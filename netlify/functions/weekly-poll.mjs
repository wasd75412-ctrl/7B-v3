import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { PUSH_STORE, isExpiredSubscriptionError, configureWebPush, jsonResponse, sendWebPush, roomSubscriptions, validRoomId } from './lib/push-shared.mjs';
import { archivePollHistoryFirestoreValue, nextWeeklyPollScan, shouldArchiveExpiredPoll, shouldOpenWeeklyPoll, shouldScanWeeklyPollRooms, taipeiWeekSchedule, weeklyPollFirestoreValue, weeklyPollPushPayload } from './lib/weekly-poll.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const WEEKLY_POLL_STATE_STORE='weekly-poll-state',WEEKLY_POLL_SCAN_KEY='scan';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';

function firestoreUrl(path=''){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${path}${path.includes('?')?'&':'?'}key=${encodeURIComponent(apiKey)}`;
}

async function listRooms(){
  const rooms=[];let pageToken='';
  do{
    const suffix=`badmintonRooms?pageSize=300${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
    const response=await fetch(firestoreUrl(suffix),{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error(`Firestore room list: ${response.status}`);
    const body=await response.json();
    for(const document of body.documents||[]){const id=document.name?.split('/').pop();if(validRoomId(id))rooms.push({id,document})}
    pageToken=body.nextPageToken||'';
  }while(pageToken);
  return rooms;
}

async function openPoll(roomId,document,now){
  const cycle=taipeiWeekSchedule(now).cycle;
  const url=`${firestoreUrl(`badmintonRooms/${encodeURIComponent(roomId)}`)}&updateMask.fieldPaths=schedulePoll&updateMask.fieldPaths=pollHistory&updateMask.fieldPaths=weeklyPollCycle&updateMask.fieldPaths=updatedAt`;
  const response=await fetch(url,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{schedulePoll:weeklyPollFirestoreValue(now),pollHistory:archivePollHistoryFirestoreValue(document,now),weeklyPollCycle:{stringValue:cycle},updatedAt:{timestampValue:new Date(now).toISOString()}}})});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
}

async function archiveExpiredPoll(roomId,document,now){
  const url=`${firestoreUrl(`badmintonRooms/${encodeURIComponent(roomId)}`)}&updateMask.fieldPaths=pollHistory&updateMask.fieldPaths=updatedAt`;
  const response=await fetch(url,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{pollHistory:archivePollHistoryFirestoreValue(document,now),updatedAt:{timestampValue:new Date(now).toISOString()}}})});
  if(!response.ok)throw new Error(`Firestore archive ${roomId}: ${response.status}`);
}

async function readScanState(){
  const store=getStore({name:WEEKLY_POLL_STATE_STORE,consistency:'strong'});
  const scan=await store.get(WEEKLY_POLL_SCAN_KEY,{type:'json'}).catch(()=>null);
  return{store,scan};
}

export default async()=>{
  const now=Date.now(),schedule=taipeiWeekSchedule(now),{store:scanStore,scan}=await readScanState();
  if(!shouldScanWeeklyPollRooms(scan,now))return jsonResponse({ok:true,cycle:schedule.cycle,skipped:true});
  const rooms=await listRooms();
  const due=rooms.filter(({document})=>shouldOpenWeeklyPoll(document,now));
  const expired=rooms.filter(({document})=>shouldArchiveExpiredPoll(document,now));
  let archived=0,failed=0,writeFailed=0;
  for(const {id,document} of expired){try{await archiveExpiredPoll(id,document,now);archived++}catch(error){console.error(error);failed++;writeFailed++}}
  const saveScan=()=>scanStore.setJSON(WEEKLY_POLL_SCAN_KEY,nextWeeklyPollScan(scan,{now,failed:writeFailed})).catch(error=>console.error('Weekly poll scan state',error));
  if(!due.length){await saveScan();return jsonResponse({ok:true,cycle:schedule.cycle,checked:rooms.length,archived,opened:0,sent:0,failed})}
  const push=configureWebPush(),store=getStore({name:PUSH_STORE,consistency:'strong'});
  let opened=0,sent=0,removed=0;
  for(const {id,document} of due){
    try{await openPoll(id,document,now);opened++}catch(error){console.error(error);failed++;writeFailed++;continue}
    if(!push)continue;
    const payload=JSON.stringify(weeklyPollPushPayload({siteUrl:push.siteUrl,roomId:id,cycle:schedule.cycle}));
    for(const item of await roomSubscriptions(store,id)){
      try{await sendWebPush(item.record.subscription,payload,{TTL:86400,urgency:'normal',topic:`weekly-${id}`});sent++}
      catch(error){if(isExpiredSubscriptionError(error)){await store.delete(item.key);removed++}else{console.error(`Push ${id} failed`,error);failed++}}
    }
  }
  await saveScan();
  const response={ok:true,cycle:schedule.cycle,checked:rooms.length,archived,opened,sent,removed,failed};
  console.log('Weekly poll run',response);return jsonResponse(response);
};

// Every five minutes lets a delayed deploy recover automatically after Monday 08:00 in Taipei.
export const config={schedule:'*/5 * * * *'};
