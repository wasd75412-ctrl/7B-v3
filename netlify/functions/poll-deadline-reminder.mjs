import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { PUSH_STORE, jsonResponse, validRoomId, validSubscription } from './lib/push-shared.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';
const REMINDER_WINDOW_MS=24*60*60*1000;

function fieldString(field){return field?.stringValue||field?.timestampValue||''}

export function firestorePollFromDocument(document){
  const fields=document?.fields?.schedulePoll?.mapValue?.fields||{};
  return{
    status:fieldString(fields.status)||'open',
    deadlineAt:fieldString(fields.deadlineAt),
    optionCount:fields.options?.arrayValue?.values?.length||0
  };
}

export function isReminderDue(poll,lastReminderDeadline='',now=Date.now()){
  const deadline=Date.parse(poll?.deadlineAt||''),remaining=deadline-now;
  return poll?.status!=='closed'&&poll?.optionCount>0&&Number.isFinite(deadline)&&remaining>0&&remaining<=REMINDER_WINDOW_MS&&lastReminderDeadline!==poll.deadlineAt;
}

async function getRoomPoll(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  const url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return firestorePollFromDocument(await response.json());
}

function deadlineLabel(value){
  return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
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
        title:'7B 羽球社｜投票明天截止',
        body:`下次球局投票將於 ${deadlineLabel(poll.deadlineAt)} 截止，記得完成選擇。`,
        url:`${siteUrl}/?room=${encodeURIComponent(roomId)}&page=poll`,
        icon:`${siteUrl}/icons/icon-192.png`,
        badge:`${siteUrl}/icons/icon-192.png`,
        tag:`7b-poll-${roomId}-${poll.deadlineAt}`
      });
      try{
        await webpush.sendNotification(item.record.subscription,payload,{TTL:REMINDER_WINDOW_MS/1000,urgency:'normal',topic:`poll-${roomId}`});
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
  return jsonResponse({ok:true,checked:records.length,sent,removed,failed});
};

export const config={schedule:'@hourly'};
