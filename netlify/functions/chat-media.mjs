import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { CHAT_MEDIA_MAX_BYTES, CHAT_MEDIA_TYPES, normalizeChatMedia } from '../../src/chat.js';
import { CHAT_MEDIA_STORE, verifyClaimedChatSender } from './chat-mention.mjs';
import { cleanText, jsonResponse, validRoomId } from './lib/push-shared.mjs';

function safeFileName(value){
  let decoded=String(value||'');
  try{decoded=decodeURIComponent(decoded)}catch{}
  return cleanText(decoded,120)||'聊天室媒體';
}

export function validChatMediaType(value){
  return CHAT_MEDIA_TYPES.includes(String(value||'').split(';')[0].trim().toLowerCase());
}

function mediaHeaders(contentType,fileName,size){
  return{
    'content-type':contentType,
    'content-length':String(size),
    'content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(fileName||'media')}`,
    'cache-control':'public, max-age=604800, immutable',
    'accept-ranges':'bytes',
    'x-content-type-options':'nosniff',
    'cross-origin-resource-policy':'same-origin'
  };
}

function byteRange(value,size){
  const match=String(value||'').match(/^bytes=(\d*)-(\d*)$/);
  if(!match)return null;
  let start=match[1]?Number(match[1]):0,end=match[2]?Number(match[2]):size-1;
  if(!match[1]&&match[2]){const suffix=Number(match[2]);start=Math.max(0,size-suffix);end=size-1}
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||start>=size)return null;
  return{start,end:Math.min(end,size-1)};
}

export default async request=>{
  if(request.headers.get('sec-fetch-site')==='cross-site')return jsonResponse({error:'不允許跨網站使用聊天室媒體。'},403);
  const url=new URL(request.url),method=request.method.toUpperCase();
  const roomId=String(method==='POST'?request.headers.get('x-chat-room')||'':url.searchParams.get('roomId')||'').toUpperCase();
  const store=getStore({name:CHAT_MEDIA_STORE,consistency:'strong'});
  if(!validRoomId(roomId))return jsonResponse({error:'球局代碼格式不正確。'},400);

  if(method==='GET'||method==='HEAD'){
    const id=cleanText(url.searchParams.get('id'),128);
    if(!/^[a-zA-Z0-9-]{8,128}$/.test(id))return jsonResponse({error:'媒體代碼格式不正確。'},400);
    const key=`${roomId}/${id}`;
    try{
      const stored=method==='HEAD'
        ?await store.getMetadata(key)
        :await store.getWithMetadata(key,{type:'arrayBuffer'});
      if(!stored)return jsonResponse({error:'找不到這個聊天室媒體。'},404);
      const media=normalizeChatMedia({...stored.metadata,id});
      if(!media)return jsonResponse({error:'聊天室媒體資料不完整。'},404);
      if(method==='HEAD')return new Response(null,{headers:mediaHeaders(media.contentType,media.fileName,media.size)});
      const data=stored.data,range=byteRange(request.headers.get('range'),data.byteLength);
      if(range){
        const part=data.slice(range.start,range.end+1),headers=mediaHeaders(media.contentType,media.fileName,part.byteLength);
        headers['content-range']=`bytes ${range.start}-${range.end}/${data.byteLength}`;
        return new Response(part,{status:206,headers});
      }
      return new Response(data,{headers:mediaHeaders(media.contentType,media.fileName,data.byteLength)});
    }catch(error){
      console.error(`Chat media read ${roomId}/${id} failed`,error);
      return jsonResponse({error:'聊天室媒體暫時無法讀取。'},502);
    }
  }

  if(method!=='POST')return jsonResponse({error:'不支援這個操作。'},405);
  const contentType=String(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!validChatMediaType(contentType))return jsonResponse({error:'只支援 JPG、PNG、WebP、GIF、MP4、WebM 或 MOV。'},415);
  const announcedSize=Number(request.headers.get('content-length')||0);
  if(announcedSize>CHAT_MEDIA_MAX_BYTES)return jsonResponse({error:'檔案不可超過 5 MB。'},413);
  let claimedSender;
  try{
    claimedSender=await verifyClaimedChatSender(roomId,request.headers.get('x-chat-sender'),request.headers.get('x-chat-token'));
  }catch(error){
    console.error(`Chat media identity verification ${roomId} failed`,error);
    return jsonResponse({error:'目前無法確認認領身分，請稍後再試。'},502);
  }
  if(!claimedSender)return jsonResponse({error:'此裝置尚未認領這位球員，無法上傳聊天室媒體。'},403);
  const data=await request.arrayBuffer();
  if(!data.byteLength)return jsonResponse({error:'檔案內容是空的。'},400);
  if(data.byteLength>CHAT_MEDIA_MAX_BYTES)return jsonResponse({error:'檔案不可超過 5 MB。'},413);
  const id=randomUUID(),fileName=safeFileName(request.headers.get('x-chat-file-name'));
  const media=normalizeChatMedia({id,contentType,fileName,size:data.byteLength});
  try{
    await store.set(`${roomId}/${id}`,data,{metadata:{...media,senderId:claimedSender.senderId,senderHash:claimedSender.senderHash},onlyIfNew:true});
    return jsonResponse({ok:true,media});
  }catch(error){
    console.error(`Chat media upload ${roomId}/${id} failed`,error);
    return jsonResponse({error:'媒體暫時無法上傳，請稍後再試。'},502);
  }
};
