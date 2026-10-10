import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { sessionFeeNoticeFromRoom, sessionFeeNoticePayload, sessionFeeSubscriptionTargets, taipeiDateKey } from '../../src/session-fee-notice.js';
import { PUSH_STORE, isExpiredSubscriptionError, configureWebPush, jsonResponse, sendWebPush, roomSubscriptions, validRoomId } from './lib/push-shared.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';
const NOTICE_TTL_SECONDS=2*24*60*60;

function decodeFirestoreValue(value={}){
  if(!value||typeof value!=='object')return null;
  if('stringValue'in value)return String(value.stringValue||'');
  if('integerValue'in value)return Number(value.integerValue);
  if('doubleValue'in value)return Number(value.doubleValue);
  if('booleanValue'in value)return value.booleanValue===true;
  if('nullValue'in value)return null;
  if('timestampValue'in value)return String(value.timestampValue||'');
  if('arrayValue'in value)return (value.arrayValue?.values||[]).map(decodeFirestoreValue);
  if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue?.fields||{}).map(([key,entry])=>[key,decodeFirestoreValue(entry)]));
  return null;
}

export function roomStateFromDocument(document){
  const fields=document?.fields||{};
  return {
    hostToken:String(decodeFirestoreValue(fields.hostToken)||''),
    history:decodeFirestoreValue(fields.history)||[],
    nextEvents:decodeFirestoreValue(fields.nextEvents)||[],
    nextEvent:decodeFirestoreValue(fields.nextEvent),
    shuttleTubes:decodeFirestoreValue(fields.shuttleTubes)||[]
  };
}

async function getRoomState(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  const url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return roomStateFromDocument(await response.json());
}

export default async request=>{
  if(request.method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站發布通知。'},403);
  const size=Number(request.headers.get('content-length')||0);
  if(size>4000)return jsonResponse({error:'通知資料過大。'},413);
  let body;
  try{body=await request.json()}catch{return jsonResponse({error:'通知資料格式不正確。'},400)}
  const roomId=String(body.roomId||'').toUpperCase(),hostToken=String(body.hostToken||''),noticeId=String(body.noticeId||'');
  if(!validRoomId(roomId)||!/^[a-z0-9-]{20,128}$/i.test(hostToken)||!/^\d{4}-\d{2}-\d{2}T/.test(noticeId)||noticeId.length>40)return jsonResponse({error:'繳費通知資料不完整。'},400);

  let room;
  try{room=await getRoomState(roomId)}catch(error){console.error(error);return jsonResponse({error:'暫時無法確認今日繳費。'},502)}
  if(room.hostToken!==hostToken)return jsonResponse({error:'只有管理員可以發布繳費通知。'},403);
  const notice=sessionFeeNoticeFromRoom(room,taipeiDateKey());
  if(!notice)return jsonResponse({ok:true,amount:0,checked:0,sent:0,removed:0,failed:0,skipped:0});

  const push=configureWebPush();
  if(!push)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  const siteUrl=push.siteUrl;

  const store=getStore({name:PUSH_STORE,consistency:'strong'}),records=await roomSubscriptions(store,roomId);
  const targets=sessionFeeSubscriptionTargets(records.map(item=>item.record),notice.playerIds);
  const targetKeys=new Set(targets);
  const payload=JSON.stringify(sessionFeeNoticePayload({siteUrl,roomId,eventId:notice.eventId,amount:notice.amount,noticeId,transferBankCode:notice.transferBankCode,transferAccount:notice.transferAccount}));
  let sent=0,removed=0,failed=0,skipped=0;
  for(const item of records){
    if(!targetKeys.has(item.record))continue;
    if(item.record.lastSessionFeeNoticeId===noticeId){skipped++;continue}
    try{
      await sendWebPush(item.record.subscription,payload,{TTL:NOTICE_TTL_SECONDS,urgency:'high'});
      item.record.lastSessionFeeNoticeId=noticeId;
      item.record.lastSessionFeeAt=new Date().toISOString();
      await store.setJSON(item.key,item.record);
      sent++;
    }catch(error){
      if(isExpiredSubscriptionError(error)){await store.delete(item.key);removed++}
      else{console.error(`Session fee push ${roomId} failed`,error);failed++}
    }
  }
  const result={ok:true,amount:notice.amount,eventId:notice.eventId,checked:targets.length,sent,removed,failed,skipped};
  console.log('Session fee push',result);
  return jsonResponse(result);
};
