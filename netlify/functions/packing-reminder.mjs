import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { EVENT_PACKING_MEMO_ITEMS } from '../../src/event-packing-memo.js';
import { PUSH_STORE, jsonResponse, validRoomId, validSubscription } from './lib/push-shared.mjs';
import { duePackingEvent, firestoreEventsFromDocument } from './lib/packing-reminder.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';

async function getRoomEvents(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY,url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return firestoreEventsFromDocument(await response.json());
}

export default async()=>{
  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim(),siteUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'').replace(/\/$/,'');
  if(!publicKey||!privateKey||!siteUrl)return jsonResponse({error:'提醒服務尚未完成設定。'},503);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||siteUrl,publicKey,privateKey);
  const store=getStore({name:PUSH_STORE,consistency:'strong'}),listing=await store.list(),records=[];
  for(const blob of listing.blobs){const record=await store.get(blob.key,{type:'json'}).catch(()=>null);if(record?.packingReminderEnabled===true&&validRoomId(record.roomId)&&validSubscription(record.subscription))records.push({key:blob.key,record})}
  const eventsByRoom=new Map();let sent=0,removed=0,failed=0;
  for(const item of records){
    let events=eventsByRoom.get(item.record.roomId);
    if(!events){try{events=await getRoomEvents(item.record.roomId);eventsByRoom.set(item.record.roomId,events)}catch(error){console.error(error);failed++;continue}}
    const event=duePackingEvent(events,item.record.lastPackingEventId,item.record.packingReminderMinutes);
    if(!event)continue;
    const when=`${event.date} ${event.time}`,place=event.location?` · ${event.location}`:'',payload=JSON.stringify({title:'🎒 出發前記得帶',body:`${when}${place}\n${EVENT_PACKING_MEMO_ITEMS.join('、')}`,url:`${siteUrl}/?room=${encodeURIComponent(item.record.roomId)}`,icon:`${siteUrl}/icons/icon-192.png`,badge:`${siteUrl}/icons/icon-192.png`,tag:`7b-packing-${item.record.roomId}-${event.id}`});
    try{await webpush.sendNotification(item.record.subscription,payload,{TTL:7200,urgency:'high',topic:`packing-${item.record.roomId}`});item.record.lastPackingEventId=event.id;item.record.lastPackingReminderAt=new Date().toISOString();await store.setJSON(item.key,item.record);sent++}
    catch(error){if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}else{console.error(`Packing push ${item.record.roomId} failed`,error);failed++}}
  }
  return jsonResponse({ok:true,checked:records.length,sent,removed,failed});
};

export const config={schedule:'*/5 * * * *'};
