import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { PUSH_STORE, jsonResponse, subscriptionKey, validEndpoint, validRoomId, validSubscription } from './lib/push-shared.mjs';

export default async request=>{
  if(request.method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站傳送通知。'},403);
  const size=Number(request.headers.get('content-length')||0);
  if(size>4000)return jsonResponse({error:'通知資料過大。'},413);
  let body;
  try{body=await request.json()}catch{return jsonResponse({error:'通知資料格式不正確。'},400)}
  const roomId=String(body.roomId||'').toUpperCase(),endpoint=String(body.endpoint||'');
  if(!validRoomId(roomId)||!validEndpoint(endpoint))return jsonResponse({error:'找不到有效的裝置訂閱。'},400);

  const store=getStore({name:PUSH_STORE,consistency:'strong'}),key=subscriptionKey(roomId,endpoint);
  const record=await store.get(key,{type:'json'}).catch(()=>null);
  if(!record||!validSubscription(record.subscription))return jsonResponse({error:'這台裝置尚未訂閱本球局通知，請重新啟用。'},404);

  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim();
  const siteUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'').replace(/\/$/,'');
  if(!publicKey||!privateKey||!siteUrl)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||siteUrl,publicKey,privateKey);
  const payload=JSON.stringify({
    title:'7B 羽球社測試通知',
    body:'通知設定成功！投票截止前一天會用同樣方式提醒你。',
    url:`${siteUrl}/?room=${encodeURIComponent(roomId)}&page=poll`,
    icon:`${siteUrl}/icons/icon-192.png`,
    badge:`${siteUrl}/icons/icon-192.png`,
    tag:`7b-push-test-${Date.now()}`
  });
  try{
    await webpush.sendNotification(record.subscription,payload,{TTL:300,urgency:'high'});
    record.lastTestAt=new Date().toISOString();
    await store.setJSON(key,record);
    return jsonResponse({ok:true});
  }catch(error){
    if(error?.statusCode===404||error?.statusCode===410){await store.delete(key);return jsonResponse({error:'通知訂閱已失效，請重新啟用。'},410)}
    console.error(`Push test ${roomId} failed`,error);
    return jsonResponse({error:'測試通知暫時無法送出，請稍後再試。'},502);
  }
};
