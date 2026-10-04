import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { PUSH_STORE, configureWebPush, jsonResponse, sendWebPush, roomSubscriptions, validRoomId } from './lib/push-shared.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';
const EVENT_TTL_SECONDS=7*24*60*60;

function fieldString(field){return field?.stringValue||field?.timestampValue||''}
function fieldNumber(field){const value=field?.integerValue??field?.doubleValue??0;const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.round(number)):0}

export function roomAnnouncementFromDocument(document){
  const fields=document?.fields||{},eventFields=fields.nextEvent?.mapValue?.fields||{};
  return{
    hostToken:fieldString(fields.hostToken),
    event:{
      date:fieldString(eventFields.date),
      time:fieldString(eventFields.time),
      endTime:fieldString(eventFields.endTime),
      location:fieldString(eventFields.location),
      note:fieldString(eventFields.note),
      participantCount:fieldNumber(eventFields.participantCount),
      perPersonFee:fieldNumber(eventFields.perPersonFee),
      publishedAt:fieldString(eventFields.publishedAt)
    }
  };
}

function shortDate(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return String(value||'日期待確認');
  const date=new Date(`${value}T12:00:00+08:00`),weekday=date.toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',weekday:'short'});
  return `${Number(match[2])}/${Number(match[3])}（${weekday}）`;
}

export function eventAnnouncementBody(event){
  const time=event.time&&event.endTime?`${event.time}–${event.endTime}`:event.time||event.endTime||'';
  const parts=[`${shortDate(event.date)}${time?` ${time}`:''}`];
  if(event.location)parts.push(event.location);
  if(event.note)parts.push(`場地備註：${event.note}`);
  if(event.participantCount)parts.push(`預計 ${event.participantCount.toLocaleString('zh-TW')} 人`);
  if(event.perPersonFee)parts.push(`每人 ${event.perPersonFee.toLocaleString('zh-TW')} 元`);
  return parts.join('｜');
}

async function getRoomAnnouncement(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  const url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return roomAnnouncementFromDocument(await response.json());
}

export default async request=>{
  if(request.method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站發布通知。'},403);
  const size=Number(request.headers.get('content-length')||0);
  if(size>4000)return jsonResponse({error:'通知資料過大。'},413);
  let body;
  try{body=await request.json()}catch{return jsonResponse({error:'通知資料格式不正確。'},400)}
  const roomId=String(body.roomId||'').toUpperCase(),hostToken=String(body.hostToken||''),publishedAt=String(body.publishedAt||'');
  if(!validRoomId(roomId)||!/^[a-z0-9-]{20,128}$/i.test(hostToken)||!publishedAt)return jsonResponse({error:'球局公告資料不完整。'},400);

  let room;
  try{room=await getRoomAnnouncement(roomId)}catch(error){console.error(error);return jsonResponse({error:'暫時無法確認球局公告。'},502)}
  if(room.hostToken!==hostToken)return jsonResponse({error:'只有管理員可以發布球局通知。'},403);
  const event=room.event;
  if(!event.date||!event.time||event.publishedAt!==publishedAt)return jsonResponse({error:'球局公告尚未完成同步，請稍後再試。'},409);

  const push=configureWebPush();
  if(!push)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  const siteUrl=push.siteUrl;

  const store=getStore({name:PUSH_STORE,consistency:'strong'}),records=await roomSubscriptions(store,roomId);
  const payload=JSON.stringify({
    title:'🏸 球局已確認！',
    body:eventAnnouncementBody(event),
    url:`${siteUrl}/?room=${encodeURIComponent(roomId)}`,
    icon:`${siteUrl}/icons/icon-192.png`,
    badge:`${siteUrl}/icons/icon-192.png`,
    tag:`7b-event-${roomId}-${event.publishedAt}`
  });
  let sent=0,removed=0,failed=0,skipped=0;
  for(const item of records){
    if(item.record.lastEventPublishedAt===event.publishedAt){skipped++;continue}
    try{
      await sendWebPush(item.record.subscription,payload,{TTL:EVENT_TTL_SECONDS,urgency:'high',topic:`event-${roomId}`});
      item.record.lastEventPublishedAt=event.publishedAt;
      item.record.lastEventAt=new Date().toISOString();
      await store.setJSON(item.key,item.record);
      sent++;
    }catch(error){
      if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}
      else{console.error(`Event push ${roomId} failed`,error);failed++}
    }
  }
  const result={ok:true,checked:records.length,sent,removed,failed,skipped};
  console.log('Event announcement push',result);
  return jsonResponse(result);
};
