import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { PUSH_STORE, allRoomSubscriptions, isExpiredSubscriptionError, configureWebPush, jsonResponse, pushFailure, sendWebPush, unindexSubscription, validRoomId } from './lib/push-shared.mjs';
import { archivePollHistoryFirestoreValue, isWeeklyPollNotifyWindow, needsWeeklyPollPush, nextWeeklyPollScan, shouldArchiveExpiredPoll, shouldOpenWeeklyPoll, shouldScanWeeklyPollRooms, taipeiWeekSchedule, weeklyPollFirestoreValue, weeklyPollNotifySummary, weeklyPollPushPayload } from './lib/weekly-poll.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const WEEKLY_POLL_STATE_STORE='weekly-poll-state',WEEKLY_POLL_SCAN_KEY='scan',WEEKLY_POLL_NOTIFY_KEY='notify';
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

async function roomWeeklyPollCycle(roomId){
  const response=await fetch(`${firestoreUrl(`badmintonRooms/${encodeURIComponent(roomId)}`)}&mask.fieldPaths=weeklyPollCycle`,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return (await response.json()).fields?.weeklyPollCycle?.stringValue||'';
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

async function scanRooms(scan,scanStore,now){
  const rooms=await listRooms(),opened=new Set();
  const due=rooms.filter(({document})=>shouldOpenWeeklyPoll(document,now));
  const expired=rooms.filter(({document})=>shouldArchiveExpiredPoll(document,now));
  let archived=0,failed=0;
  for(const {id,document} of expired){try{await archiveExpiredPoll(id,document,now);archived++}catch(error){console.error(error);failed++}}
  for(const {id,document} of due){try{await openPoll(id,document,now);opened.add(id)}catch(error){console.error(error);failed++}}
  await scanStore.setJSON(WEEKLY_POLL_SCAN_KEY,nextWeeklyPollScan(scan,{now,failed})).catch(error=>console.error('Weekly poll scan state',error));
  return{opened,result:{checked:rooms.length,archived,opened:opened.size,failed}};
}

// Each device records the cycle it was told about, so a failed or interrupted send is retried instead of lost.
async function notifyWeeklyPoll(now,openedRooms,stateStore){
  if(!isWeeklyPollNotifyWindow(now))return null;
  const push=configureWebPush();
  if(!push)return{error:'push not configured'};
  const cycle=taipeiWeekSchedule(now).cycle,store=getStore({name:PUSH_STORE,consistency:'strong'}),byRoom=await allRoomSubscriptions(store);
  let sent=0,removed=0,failed=0;const failures=[];
  for(const [roomId,items] of byRoom){
    const pending=items.filter(item=>needsWeeklyPollPush(item.record,cycle));
    if(!pending.length)continue;
    if(!openedRooms.has(roomId)){
      try{if(await roomWeeklyPollCycle(roomId)!==cycle)continue}
      catch(error){console.error(error);failed+=pending.length;failures.push({roomId,error:String(error?.message||error).slice(0,160)});continue}
    }
    const payload=JSON.stringify(weeklyPollPushPayload({siteUrl:push.siteUrl,roomId,cycle}));
    for(const item of pending){
      try{
        // Apple rejects a 13-character topic such as weekly-RTYBSJ with BadWebPushTopic, and one push a week needs no collapsing.
        await sendWebPush(item.record.subscription,payload,{TTL:86400,urgency:'normal'});
        item.record.lastWeeklyPollCycle=cycle;
        item.record.lastWeeklyPollAt=new Date().toISOString();
        await store.setJSON(item.key,item.record);
        sent++;
      }catch(error){
        if(isExpiredSubscriptionError(error)){await store.delete(item.key);await unindexSubscription(store,roomId,item.key);removed++}
        else{console.error(`Push ${roomId} failed`,error);failed++;failures.push(pushFailure(item.record,error))}
      }
    }
  }
  const summary=weeklyPollNotifySummary({cycle,sent,removed,failed,failures});
  if(sent||removed||failed){
    const previous=await stateStore.get(WEEKLY_POLL_NOTIFY_KEY,{type:'json'}).catch(()=>null);
    if(JSON.stringify({...previous,at:undefined})!==JSON.stringify(summary))await stateStore.setJSON(WEEKLY_POLL_NOTIFY_KEY,{...summary,at:new Date(now).toISOString()}).catch(error=>console.error('Weekly poll notify state',error));
  }
  return summary;
}

export default async()=>{
  const now=Date.now(),schedule=taipeiWeekSchedule(now),{store:scanStore,scan}=await readScanState();
  const response={ok:true,cycle:schedule.cycle};
  let opened=new Set();
  if(shouldScanWeeklyPollRooms(scan,now)){const run=await scanRooms(scan,scanStore,now);opened=run.opened;Object.assign(response,run.result)}
  else response.skipped=true;
  const notify=await notifyWeeklyPoll(now,opened,scanStore);
  if(notify)response.notify=notify;
  if(!response.skipped||notify?.sent||notify?.failed)console.log('Weekly poll run',response);
  return jsonResponse(response);
};

// Every five minutes lets a delayed deploy recover automatically after Monday 08:00 in Taipei.
export const config={schedule:'*/5 * * * *'};
