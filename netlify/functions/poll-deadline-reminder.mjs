import { getBlobStore as getStore } from './lib/blob-store.mjs';
import webpush from 'web-push';
import { PUSH_STORE, jsonResponse, validRoomId, validSubscription } from './lib/push-shared.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';
const TAIPEI_OFFSET_MS=8*60*60*1000;
const DEFAULT_REMINDER_LEAD_MS=24*60*60*1000;
// Weekly polls close Saturday 23:00 in Taipei. The reminder starts Friday 12:00, 35 hours earlier.
const WEEKLY_FRIDAY_NOON_LEAD_MS=35*60*60*1000;

function fieldString(field){return field?.stringValue||field?.timestampValue||''}

export function firestorePollFromDocument(document){
  const fields=document?.fields?.schedulePoll?.mapValue?.fields||{};
  return{
    status:fieldString(fields.status)||'open',
    deadlineAt:fieldString(fields.deadlineAt),
    optionCount:fields.options?.arrayValue?.values?.length||0
  };
}

export function reminderLeadMs(deadlineAt){
  const deadline=Date.parse(deadlineAt||'');
  if(!Number.isFinite(deadline))return DEFAULT_REMINDER_LEAD_MS;
  const local=new Date(deadline+TAIPEI_OFFSET_MS);
  const weeklySaturdayNight=local.getUTCDay()===6&&local.getUTCHours()===23&&local.getUTCMinutes()===0&&local.getUTCSeconds()===0&&local.getUTCMilliseconds()===0;
  return weeklySaturdayNight?WEEKLY_FRIDAY_NOON_LEAD_MS:DEFAULT_REMINDER_LEAD_MS;
}

export function isReminderDue(poll,lastReminderDeadline='',now=Date.now()){
  const deadline=Date.parse(poll?.deadlineAt||''),remaining=deadline-now;
  return poll?.status!=='closed'&&poll?.optionCount>0&&Number.isFinite(deadline)&&remaining>0&&remaining<=reminderLeadMs(poll?.deadlineAt)&&lastReminderDeadline!==poll.deadlineAt;
}

async function getRoomPoll(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  const url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return firestorePollFromDocument(await response.json());
}

export default async()=>{
  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim();
  if(!publicKey||!privateKey)return jsonResponse({error:'VAPID 金鑰尚未設定。'},503);
  const siteUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'').replace(/\/$/,'');
  if(!siteUrl)return jsonResponse({error:'找不到網站網址。'},503);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||siteUrl,publicKey,privateKey);
  const store=getStore({name:PUSH_STORE,consistency:'strong'}),listing=await store.list(),records=[];
  for(const blob of listing.blobs){
    const record=await store.get(blob.key,{type:'json'}).catch(()=>null);
    if(record&&validRoomId(record.roomId)&&validSubscription(record.subscription))records.push({key:blob.key,record});
  }
  const byRoom=new Map();
  for(const item of records){const rows=byRoom.get(item.record.roomId)||[];rows.push(item);byRoom.set(item.record.roomId,rows)}
  let sent=0,removed=0,failed=0;
  for(const [roomId,items] of byRoom){
    let poll;
    try{poll=await getRoomPoll(roomId)}catch(error){console.error(error);failed+=items.length;continue}
    for(const item of items){
      if(!isReminderDue(poll,item.record.lastReminderDeadline))continue;
      const payload=JSON.stringify({
        title:'🔥投票明日截止🔥',
        body:'還沒投票的球友們，點一下進行投票🏸',
        url:`${siteUrl}/?room=${encodeURIComponent(roomId)}&page=poll`,
        icon:`${siteUrl}/icons/icon-192.png`,
        badge:`${siteUrl}/icons/icon-192.png`,
        tag:`7b-poll-${roomId}-${poll.deadlineAt}`
      });
      try{
        await webpush.sendNotification(item.record.subscription,payload,{TTL:reminderLeadMs(poll.deadlineAt)/1000,urgency:'normal',topic:`poll-${roomId}`});
        item.record.lastReminderDeadline=poll.deadlineAt;
        item.record.lastReminderAt=new Date().toISOString();
        await store.setJSON(item.key,item.record);
        sent++;
      }catch(error){
        if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}
        else{console.error(`Push ${roomId} failed`,error);failed++}
      }
    }
  }
  const result={ok:true,checked:records.length,sent,removed,failed};
  console.log('Poll reminder run',result);
  return jsonResponse(result);
};

export const config={schedule:'*/5 * * * *'};
