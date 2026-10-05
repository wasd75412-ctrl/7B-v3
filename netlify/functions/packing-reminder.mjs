import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { EVENT_PACKING_MEMO_ITEMS, normalizePackingItems } from '../../src/event-packing-memo.js';
import { PUSH_STORE, allRoomSubscriptions, configureWebPush, jsonResponse, sendWebPush } from './lib/push-shared.mjs';
import { PACKING_EVENTS_STORE, duePackingEvent, firestoreEventsFromDocument, roomEventsWithFallback } from './lib/packing-reminder.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';

async function getRoomEvents(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY,url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return firestoreEventsFromDocument(await response.json());
}

export default async()=>{
  const push=configureWebPush();
  if(!push)return jsonResponse({error:'提醒服務尚未完成設定。'},503);
  const siteUrl=push.siteUrl;
  const store=getStore({name:PUSH_STORE,consistency:'strong'}),eventStore=getStore({name:PACKING_EVENTS_STORE,consistency:'strong'}),records=[...(await allRoomSubscriptions(store)).values()].flat().filter(item=>item.record.packingReminderEnabled===true);
  const eventsByRoom=new Map();let sent=0,removed=0,failed=0;
  for(const item of records){
    let events=eventsByRoom.get(item.record.roomId);
    if(!events){try{events=await roomEventsWithFallback(eventStore,item.record.roomId,getRoomEvents);eventsByRoom.set(item.record.roomId,events)}catch(error){console.error(error);failed++;continue}}
    const event=duePackingEvent(events,item.record.lastPackingEventId,item.record.packingReminderMinutes);
    if(!event)continue;
    const items=Array.isArray(item.record.packingItems)?normalizePackingItems(item.record.packingItems):EVENT_PACKING_MEMO_ITEMS;
    if(!items.length)continue;
    const when=`${event.date} ${event.time}`,place=event.location?` · ${event.location}`:'',payload=JSON.stringify({title:'🎒 出發前記得帶',body:`${when}${place}\n${items.join('、')}`,url:`${siteUrl}/?room=${encodeURIComponent(item.record.roomId)}`,icon:`${siteUrl}/icons/icon-192.png`,badge:`${siteUrl}/icons/icon-192.png`,tag:`7b-packing-${item.record.roomId}-${event.id}`});
    try{await sendWebPush(item.record.subscription,payload,{TTL:7200,urgency:'high',topic:`packing-${item.record.roomId}`});item.record.lastPackingEventId=event.id;item.record.lastPackingReminderAt=new Date().toISOString();await store.setJSON(item.key,item.record);sent++}
    catch(error){if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}else{console.error(`Packing push ${item.record.roomId} failed`,error);failed++}}
  }
  return jsonResponse({ok:true,checked:records.length,sent,removed,failed});
};

export const config={schedule:'*/5 * * * *'};
