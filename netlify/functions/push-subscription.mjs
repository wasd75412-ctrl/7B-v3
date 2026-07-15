import { getStore } from '@netlify/blobs';
import { PUSH_STORE, cleanText, jsonResponse, subscriptionKey, validEndpoint, validRoomId, validSubscription } from './lib/push-shared.mjs';

export default async request=>{
  if(request.method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站設定通知。'},403);
  const size=Number(request.headers.get('content-length')||0);
  if(size>12000)return jsonResponse({error:'通知資料過大。'},413);
  let body;
  try{body=await request.json()}catch{return jsonResponse({error:'通知資料格式不正確。'},400)}
  const roomId=String(body.roomId||'').toUpperCase();
  if(!validRoomId(roomId))return jsonResponse({error:'球局代碼格式不正確。'},400);
  const endpoint=body.enabled===false?body.endpoint:body.subscription?.endpoint;
  if(!validEndpoint(endpoint))return jsonResponse({error:'通知裝置資料不正確。'},400);
  const store=getStore({name:PUSH_STORE,consistency:'strong'}),key=subscriptionKey(roomId,endpoint);
  if(body.enabled===false){
    await store.delete(key);
    return jsonResponse({ok:true,enabled:false});
  }
  if(!validSubscription(body.subscription))return jsonResponse({error:'通知裝置資料不完整。'},400);
  const existing=await store.get(key,{type:'json'}).catch(()=>null),now=new Date().toISOString();
  await store.setJSON(key,{
    roomId,
    clientHash:cleanText(body.clientHash,128),
    playerId:cleanText(body.playerId,128),
    playerName:cleanText(body.playerName,40),
    subscription:body.subscription,
    createdAt:existing?.createdAt||now,
    updatedAt:now,
    lastReminderDeadline:existing?.lastReminderDeadline||'',
    lastReminderAt:existing?.lastReminderAt||'',
    lastEventPublishedAt:existing?.lastEventPublishedAt||'',
    lastEventAt:existing?.lastEventAt||''
  });
  return jsonResponse({ok:true,enabled:true});
};
