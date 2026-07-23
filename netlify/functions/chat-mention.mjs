import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { chatMessagePreview, cleanChatText, normalizeChatMentionIds } from '../../src/chat.js';
import { PUSH_STORE, cleanText, jsonResponse, validRoomId, validSubscription } from './lib/push-shared.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';
const CHAT_TTL_SECONDS=2*24*60*60;
const MESSAGE_FRESHNESS_MS=15*60*1000;

function fieldString(field){return field?.stringValue||field?.timestampValue||''}
function fieldStrings(field){return (field?.arrayValue?.values||[]).map(fieldString).filter(Boolean)}

export function chatMessageFromDocument(document){
  const fields=document?.fields||{};
  return{
    text:cleanChatText(fieldString(fields.text)),
    senderId:cleanText(fieldString(fields.senderId),128),
    senderName:cleanText(fieldString(fields.senderName),40),
    senderHash:cleanText(fieldString(fields.senderHash),128),
    mentions:normalizeChatMentionIds(fieldStrings(fields.mentions)),
    createdAt:fieldString(fields.createdAt)
  };
}

export function isFreshChatMessage(message,now=Date.now()){
  const created=Date.parse(message?.createdAt||'');
  return Number.isFinite(created)&&created<=now+60_000&&created>=now-MESSAGE_FRESHNESS_MS;
}

async function getChatMessage(roomId,messageId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  const path=`badmintonRooms/${encodeURIComponent(roomId)}/chatMessages/${encodeURIComponent(messageId)}`;
  const url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${path}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore chat ${roomId}/${messageId}: ${response.status}`);
  return chatMessageFromDocument(await response.json());
}

export default async request=>{
  if(request.method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站傳送通知。'},403);
  const size=Number(request.headers.get('content-length')||0);
  if(size>2000)return jsonResponse({error:'標記通知資料過大。'},413);
  let body;
  try{body=await request.json()}catch{return jsonResponse({error:'標記通知格式不正確。'},400)}
  const roomId=String(body.roomId||'').toUpperCase(),messageId=String(body.messageId||'');
  if(!validRoomId(roomId)||!/^[a-zA-Z0-9_-]{8,128}$/.test(messageId))return jsonResponse({error:'找不到有效的聊天室訊息。'},400);

  let message;
  try{message=await getChatMessage(roomId,messageId)}catch(error){console.error(error);return jsonResponse({error:'暫時無法確認聊天室訊息。'},502)}
  if(!message.text||!message.senderId||!message.senderName||!message.mentions.length||!isFreshChatMessage(message))return jsonResponse({error:'聊天室訊息沒有可傳送的標記通知。'},409);

  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim();
  const siteUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'').replace(/\/$/,'');
  if(!publicKey||!privateKey||!siteUrl)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||siteUrl,publicKey,privateKey);

  const store=getStore({name:PUSH_STORE,consistency:'strong'}),listing=await store.list(),targets=[];
  for(const blob of listing.blobs){
    const record=await store.get(blob.key,{type:'json'}).catch(()=>null);
    const alreadySent=Array.isArray(record?.chatMentionMessageIds)&&record.chatMentionMessageIds.includes(messageId);
    if(record?.roomId===roomId&&message.mentions.includes(record.playerId)&&record.clientHash!==message.senderHash&&!alreadySent&&validSubscription(record.subscription))targets.push({key:blob.key,record});
  }

  const payload=JSON.stringify({
    title:`💬 ${message.senderName} 標記了你`,
    body:chatMessagePreview(message.text),
    url:`${siteUrl}/?room=${encodeURIComponent(roomId)}&page=chat`,
    icon:`${siteUrl}/icons/icon-192.png`,
    badge:`${siteUrl}/icons/icon-192.png`,
    tag:`7b-chat-${roomId}-${messageId}`
  });
  let sent=0,removed=0,failed=0;
  for(const item of targets){
    try{
      await webpush.sendNotification(item.record.subscription,payload,{TTL:CHAT_TTL_SECONDS,urgency:'high'});
      item.record.chatMentionMessageIds=[messageId,...(item.record.chatMentionMessageIds||[]).filter(id=>id!==messageId)].slice(0,30);
      item.record.lastChatMentionAt=new Date().toISOString();
      await store.setJSON(item.key,item.record);
      sent++;
    }catch(error){
      if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}
      else{console.error(`Chat mention ${roomId}/${messageId} failed`,error);failed++}
    }
  }
  return jsonResponse({ok:true,checked:targets.length,sent,removed,failed});
};
