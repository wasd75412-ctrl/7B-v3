import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

export const LOCAL_LINK_DOC_ID='localLink';
export const LOCAL_LINK_OFFER_MAX_AGE_MS=45_000;
const ICE_GATHER_TIMEOUT_MS=1_500;

export function isFreshLocalLinkOffer(offer,now=Date.now()){
  const at=Number(offer?.clientCreatedAt);
  return Boolean(offer?.sessionId&&typeof offer?.sdp==='string'&&offer.sdp)&&Number.isFinite(at)&&Math.abs(now-at)<=LOCAL_LINK_OFFER_MAX_AGE_MS;
}

export function parseLocalLinkMessage(text,receivedAt=Date.now()){
  let message;
  try{message=JSON.parse(String(text||''))}catch{return null}
  if(!message||typeof message!=='object')return null;
  const {type,...command}=message;
  if(!['action','officialStart'].includes(type)||!command.id)return null;
  return {type,command:{...command,id:String(command.id),createdAt:receivedAt}};
}

function waitForIceGathering(peer,timeoutMs){
  if(peer.iceGatheringState==='complete')return Promise.resolve();
  return new Promise(resolve=>{
    const timer=setTimeout(done,timeoutMs);
    function done(){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',check);resolve()}
    function check(){if(peer.iceGatheringState==='complete')done()}
    peer.addEventListener('icegatheringstatechange',check);
  });
}

export function startLocalLinkHost({db,roomId,canAnswer,onCommand,onOpenChange}){
  if(typeof RTCPeerConnection!=='function')return null;
  const ref=doc(db,'badmintonRooms',roomId,'remoteControl',LOCAL_LINK_DOC_ID);
  let peer=null,sessionId='',answering='',stopped=false,firstSnapshot=true,announced=false;
  const setOpen=(owner,open)=>{if(owner===peer)onOpenChange(open)};
  const closePeer=()=>{
    const current=peer;peer=null;sessionId='';
    if(current){try{current.close()}catch{}}
    onOpenChange(false);
  };
  const announce=()=>{
    if(stopped||announced||!canAnswer())return;
    announced=true;
    setDoc(ref,{ipadReadyAt:serverTimestamp()},{merge:true}).catch(()=>{announced=false});
  };
  const answer=async offer=>{
    answering=offer.sessionId;
    closePeer();
    const current=new RTCPeerConnection({iceServers:[]});
    peer=current;sessionId=offer.sessionId;
    current.ondatachannel=event=>{
      const channel=event.channel;
      channel.onopen=()=>setOpen(current,true);
      channel.onclose=()=>setOpen(current,false);
      channel.onmessage=message=>{
        const parsed=parseLocalLinkMessage(typeof message.data==='string'?message.data:new TextDecoder().decode(message.data));
        if(parsed&&current===peer)onCommand(parsed);
      };
      if(channel.readyState==='open')setOpen(current,true);
    };
    current.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(current.connectionState))setOpen(current,false)};
    try{
      await current.setRemoteDescription({type:'offer',sdp:offer.sdp});
      await current.setLocalDescription(await current.createAnswer());
      await waitForIceGathering(current,ICE_GATHER_TIMEOUT_MS);
      if(current!==peer||stopped)return;
      await setDoc(ref,{answer:{sessionId:offer.sessionId,sdp:current.localDescription.sdp,createdAt:serverTimestamp()}},{merge:true});
    }catch{
      if(current===peer)closePeer();
    }finally{
      if(answering===offer.sessionId)answering='';
    }
  };
  const unsubscribe=onSnapshot(ref,snapshot=>{
    if(stopped||snapshot.metadata.hasPendingWrites)return;
    const offer=snapshot.exists()?snapshot.data()?.offer:null,initial=firstSnapshot;
    firstSnapshot=false;
    const fresh=isFreshLocalLinkOffer(offer);
    if(fresh&&offer.sessionId!==sessionId&&offer.sessionId!==answering&&canAnswer()){void answer(offer);return}
    if(initial&&!fresh)announce();
  },()=>{});
  return {
    announce,
    stop(){stopped=true;unsubscribe();closePeer()}
  };
}
