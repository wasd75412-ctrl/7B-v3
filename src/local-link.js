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

export function freshLocalLinkOffers(offers,now=Date.now()){
  if(!offers||typeof offers!=='object')return [];
  return Object.entries(offers).filter(([deviceId,offer])=>deviceId&&isFreshLocalLinkOffer(offer,now));
}

// Every phone in the room gets its own peer, so a second phone can never knock the first off the link.
export function startLocalLinkHost({db,roomId,canAnswer,onCommand,onOpenChange}){
  if(typeof RTCPeerConnection!=='function')return null;
  const ref=doc(db,'badmintonRooms',roomId,'remoteControl',LOCAL_LINK_DOC_ID);
  const peers=new Map(),answering=new Map();
  let stopped=false,firstSnapshot=true,announced=false,reportedOpen=false;
  const reportOpen=()=>{
    const open=[...peers.values()].some(entry=>entry.open);
    if(open!==reportedOpen){reportedOpen=open;onOpenChange(open)}
  };
  const closeDevice=deviceId=>{
    const entry=peers.get(deviceId);peers.delete(deviceId);
    if(entry){try{entry.peer.close()}catch{}}
    reportOpen();
  };
  const announce=()=>{
    if(stopped||announced||!canAnswer())return;
    announced=true;
    setDoc(ref,{ipadReadyAt:serverTimestamp()},{merge:true}).catch(()=>{announced=false});
  };
  const answer=async(deviceId,offer)=>{
    answering.set(deviceId,offer.sessionId);
    closeDevice(deviceId);
    const current=new RTCPeerConnection({iceServers:[]});
    const entry={peer:current,sessionId:offer.sessionId,open:false};
    peers.set(deviceId,entry);
    const isCurrent=()=>peers.get(deviceId)===entry;
    const setOpen=open=>{if(isCurrent()){entry.open=open;reportOpen()}};
    current.ondatachannel=event=>{
      const channel=event.channel;
      channel.onopen=()=>setOpen(true);
      channel.onclose=()=>setOpen(false);
      channel.onmessage=message=>{
        const parsed=parseLocalLinkMessage(typeof message.data==='string'?message.data:new TextDecoder().decode(message.data));
        if(parsed&&isCurrent())onCommand(parsed);
      };
      if(channel.readyState==='open')setOpen(true);
    };
    current.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(current.connectionState))setOpen(false)};
    try{
      await current.setRemoteDescription({type:'offer',sdp:offer.sdp});
      await current.setLocalDescription(await current.createAnswer());
      await waitForIceGathering(current,ICE_GATHER_TIMEOUT_MS);
      if(!isCurrent()||stopped)return;
      await setDoc(ref,{answers:{[deviceId]:{sessionId:offer.sessionId,sdp:current.localDescription.sdp,createdAt:serverTimestamp()}}},{merge:true});
    }catch{
      if(isCurrent())closeDevice(deviceId);
    }finally{
      if(answering.get(deviceId)===offer.sessionId)answering.delete(deviceId);
    }
  };
  const unsubscribe=onSnapshot(ref,snapshot=>{
    if(stopped||snapshot.metadata.hasPendingWrites)return;
    const offers=freshLocalLinkOffers(snapshot.exists()?snapshot.data()?.offers:null),initial=firstSnapshot;
    firstSnapshot=false;
    for(const [deviceId,offer] of offers){
      if(offer.sessionId!==peers.get(deviceId)?.sessionId&&offer.sessionId!==answering.get(deviceId)&&canAnswer())void answer(deviceId,offer);
    }
    if(initial&&!offers.length)announce();
  },()=>{});
  return {
    announce,
    stop(){stopped=true;unsubscribe();for(const deviceId of [...peers.keys()])closeDevice(deviceId)}
  };
}
