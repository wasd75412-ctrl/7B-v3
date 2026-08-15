import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { PUSH_STORE, jsonResponse, validRoomId, validSubscription } from './lib/push-shared.mjs';
import { shouldOpenWeeklyPoll, taipeiWeekSchedule, weeklyPollFirestoreValue } from './lib/weekly-poll.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
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

async function openPoll(roomId,now){
  const cycle=taipeiWeekSchedule(now).cycle;
  const url=`${firestoreUrl(`badmintonRooms/${encodeURIComponent(roomId)}`)}&updateMask.fieldPaths=schedulePoll&updateMask.fieldPaths=weeklyPollCycle&updateMask.fieldPaths=updatedAt`;
  const response=await fetch(url,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{schedulePoll:weeklyPollFirestoreValue(now),weeklyPollCycle:{stringValue:cycle},updatedAt:{timestampValue:new Date(now).toISOString()}}})});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
}

async function subscriptionsByRoom(){
  const result=new Map(),store=getStore({name:PUSH_STORE,consistency:'strong'}),listing=await store.list();
  for(const blob of listing.blobs){
    const record=await store.get(blob.key,{type:'json'}).catch(()=>null);
    if(!record||!validRoomId(record.roomId)||!validSubscription(record.subscription))continue;
    const rows=result.get(record.roomId)||[];rows.push({key:blob.key,record});result.set(record.roomId,rows);
  }
  return{store,result};
}

export default async()=>{
  const now=Date.now(),schedule=taipeiWeekSchedule(now),rooms=await listRooms();
  const due=rooms.filter(({document})=>shouldOpenWeeklyPoll(document,now));
  if(!due.length)return jsonResponse({ok:true,cycle:schedule.cycle,checked:rooms.length,opened:0,sent:0});
  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim();
  const siteUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'').replace(/\/$/,'');
  if(publicKey&&privateKey&&siteUrl)webpush.setVapidDetails(process.env.VAPID_SUBJECT||siteUrl,publicKey,privateKey);
  const {store,result:byRoom}=await subscriptionsByRoom();
  let opened=0,sent=0,removed=0,failed=0;
  for(const {id} of due){
    try{await openPoll(id,now);opened++}catch(error){console.error(error);failed++;continue}
    if(!publicKey||!privateKey||!siteUrl)continue;
    const payload=JSON.stringify({title:'🏸 下週球局投票開始！',body:'立羽會館 01:00–04:00，請在週六中午前選擇可參加的日期。',url:`${siteUrl}/?room=${encodeURIComponent(id)}&page=poll`,icon:`${siteUrl}/icons/icon-192.png`,badge:`${siteUrl}/icons/icon-192.png`,tag:`7b-weekly-poll-${id}-${schedule.cycle}`});
    for(const item of byRoom.get(id)||[]){
      try{await webpush.sendNotification(item.record.subscription,payload,{TTL:86400,urgency:'normal',topic:`weekly-${id}`});sent++}
      catch(error){if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}else{console.error(`Push ${id} failed`,error);failed++}}
    }
  }
  const response={ok:true,cycle:schedule.cycle,checked:rooms.length,opened,sent,removed,failed};
  console.log('Weekly poll run',response);return jsonResponse(response);
};

// Every five minutes lets a delayed deploy recover automatically during the Mon–Sat window.
export const config={schedule:'*/5 * * * *'};
