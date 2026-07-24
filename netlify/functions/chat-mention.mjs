import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { chatMessagePreview, cleanChatText, hasChatAllMention, normalizeChatMentionIds, playerOwnerHashes } from '../../src/chat.js';
import { PUSH_STORE, cleanText, jsonResponse, validRoomId, validSubscription } from './lib/push-shared.mjs';

const CHAT_STORE='7b-room-chat';
const CHAT_TTL_SECONDS=2*24*60*60;
const CHAT_HISTORY_LIMIT=100;
const CHAT_STORAGE_LIMIT=300;
const FIREBASE_PROJECT_ID=process.env.FIREBASE_PROJECT_ID?.trim()||'badminton-7a1c3';
const FIREBASE_WEB_API_KEY=process.env.FIREBASE_WEB_API_KEY?.trim()||'AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';

function decodeFirestoreValue(value={}){
  if('stringValue'in value)return String(value.stringValue||'');
  if('arrayValue'in value)return (value.arrayValue?.values||[]).map(decodeFirestoreValue);
  if('mapValue'in value){
    return Object.fromEntries(Object.entries(value.mapValue?.fields||{}).map(([key,entry])=>[key,decodeFirestoreValue(entry)]));
  }
  return null;
}

export function claimedChatSenderFromDocument(document,{senderId='',senderHash=''}={}){
  const roster=decodeFirestoreValue(document?.fields?.roster);
  if(!Array.isArray(roster)||!senderId||!senderHash)return null;
  const sender=roster.find(player=>player?.id===senderId&&playerOwnerHashes(player).includes(senderHash));
  if(!sender?.name)return null;
  return{senderId:cleanText(sender.id,128),senderName:cleanText(sender.name,40),senderHash};
}

async function verifyClaimedChatSender(roomId,senderId,senderToken){
  const token=cleanText(senderToken,512);
  if(!token)return null;
  const senderHash=createHash('sha256').update(token).digest('hex');
  const endpoint=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`;
  const response=await fetch(endpoint,{headers:{accept:'application/json'}});
  if(response.status===404)return null;
  if(!response.ok)throw new Error(`Firestore claim verification failed (${response.status})`);
  return claimedChatSenderFromDocument(await response.json(),{senderId:cleanText(senderId,128),senderHash});
}

export function normalizeStoredChatMessage(source={}){
  const createdAt=String(source.createdAt||''),created=Date.parse(createdAt),text=cleanChatText(source.text);
  return{
    id:cleanText(source.id,128),
    text,
    senderId:cleanText(source.senderId,128),
    senderName:cleanText(source.senderName,40),
    senderHash:cleanText(source.senderHash,128),
    mentions:normalizeChatMentionIds(source.mentions),
    mentionAll:hasChatAllMention(text),
    createdAt:Number.isFinite(created)?new Date(created).toISOString():'',
    clientCreatedAt:Number(source.clientCreatedAt)||0
  };
}

export function shouldNotifyChatSubscription(record,message,{roomId='',messageId=''}={}){
  const alreadySent=Array.isArray(record?.chatMentionMessageIds)&&record.chatMentionMessageIds.includes(messageId);
  const targeted=!!message?.mentionAll||(message?.mentions||[]).includes(record?.playerId);
  return record?.roomId===roomId&&targeted&&record?.clientHash!==message?.senderHash&&!alreadySent;
}

async function listRoomMessages(store,roomId){
  const listing=await store.list({prefix:`${roomId}/`}),messages=[];
  for(const blob of listing.blobs){
    const message=normalizeStoredChatMessage(await store.get(blob.key,{type:'json'}).catch(()=>null));
    if(message.id&&message.text&&message.senderId&&message.senderName&&message.createdAt)messages.push(message);
  }
  messages.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
  return{messages:messages.slice(-CHAT_HISTORY_LIMIT),blobs:listing.blobs};
}

async function sendMentionNotifications(message,roomId,messageId){
  if(!message.mentionAll&&!message.mentions.length)return{checked:0,sent:0,removed:0,failed:0};
  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim();
  const siteUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'').replace(/\/$/,'');
  if(!publicKey||!privateKey||!siteUrl)return{checked:0,sent:0,removed:0,failed:0,unavailable:true};
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||siteUrl,publicKey,privateKey);

  const store=getStore({name:PUSH_STORE,consistency:'strong'}),listing=await store.list(),targets=[];
  for(const blob of listing.blobs){
    const record=await store.get(blob.key,{type:'json'}).catch(()=>null);
    if(shouldNotifyChatSubscription(record,message,{roomId,messageId})&&validSubscription(record.subscription))targets.push({key:blob.key,record});
  }

  const payload=JSON.stringify({
    title:message.mentionAll?`📣 ${message.senderName} 通知所有人`:`💬 ${message.senderName} 標記了你`,
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
  return{checked:targets.length,sent,removed,failed};
}

export default async request=>{
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站使用聊天室。'},403);
  const url=new URL(request.url),roomId=String(request.method==='GET'?url.searchParams.get('roomId')||'':'').toUpperCase();
  const chatStore=getStore({name:CHAT_STORE,consistency:'strong'});

  if(request.method==='GET'){
    if(!validRoomId(roomId))return jsonResponse({error:'球局代碼格式不正確。'},400);
    try{
      const {messages}=await listRoomMessages(chatStore,roomId);
      return jsonResponse({ok:true,messages});
    }catch(error){
      console.error(`Chat list ${roomId} failed`,error);
      return jsonResponse({error:'聊天室暫時無法同步。'},502);
    }
  }

  if(request.method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  const size=Number(request.headers.get('content-length')||0);
  if(size>10000)return jsonResponse({error:'聊天室訊息資料過大。'},413);
  let body;
  try{body=await request.json()}catch{return jsonResponse({error:'聊天室訊息格式不正確。'},400)}
  const postRoomId=String(body.roomId||'').toUpperCase(),messageId=randomUUID(),createdAt=new Date().toISOString();
  if(!validRoomId(postRoomId))return jsonResponse({error:'球局代碼格式不正確。'},400);
  let claimedSender;
  try{
    claimedSender=await verifyClaimedChatSender(postRoomId,body.senderId,body.senderToken);
  }catch(error){
    console.error(`Chat identity verification ${postRoomId} failed`,error);
    return jsonResponse({error:'目前無法確認認領身分，請稍後再試。'},502);
  }
  if(!claimedSender)return jsonResponse({error:'此裝置尚未認領這位球員，無法使用該身分發言。'},403);
  const message=normalizeStoredChatMessage({
    id:messageId,
    text:body.text,
    ...claimedSender,
    mentions:body.mentions,
    mentionAll:body.mentionAll,
    createdAt,
    clientCreatedAt:body.clientCreatedAt
  });
  if(!message.text||!message.senderId||!message.senderName||!message.senderHash)return jsonResponse({error:'聊天室訊息資料不完整。'},400);

  try{
    const key=`${postRoomId}/${String(Date.now()).padStart(13,'0')}-${messageId}`;
    await chatStore.setJSON(key,message);
    const notification=await sendMentionNotifications(message,postRoomId,messageId);
    const listing=await chatStore.list({prefix:`${postRoomId}/`});
    if(listing.blobs.length>CHAT_STORAGE_LIMIT){
      const old=listing.blobs.sort((a,b)=>a.key.localeCompare(b.key)).slice(0,listing.blobs.length-CHAT_STORAGE_LIMIT);
      await Promise.all(old.map(blob=>chatStore.delete(blob.key)));
    }
    return jsonResponse({ok:true,message,...notification});
  }catch(error){
    console.error(`Chat send ${postRoomId}/${messageId} failed`,error);
    return jsonResponse({error:'訊息暫時無法傳送，請稍後再試。'},502);
  }
};
