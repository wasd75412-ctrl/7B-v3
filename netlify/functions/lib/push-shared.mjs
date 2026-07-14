import { createHash } from 'node:crypto';

export const PUSH_STORE='7b-push-subscriptions';

export function jsonResponse(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

export function subscriptionKey(roomId,endpoint){
  const hash=createHash('sha256').update(endpoint).digest('hex');
  return `${roomId}/${hash}`;
}

export function cleanText(value,maxLength=80){
  return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,maxLength);
}

export function validRoomId(value){
  return /^[A-Z0-9]{6}$/.test(String(value||''));
}

export function validEndpoint(value){
  if(typeof value!=='string'||value.length<12||value.length>2048)return false;
  try{return new URL(value).protocol==='https:'}catch{return false}
}

export function validSubscription(value){
  return !!value&&validEndpoint(value.endpoint)&&typeof value.keys?.p256dh==='string'&&value.keys.p256dh.length<=512&&typeof value.keys?.auth==='string'&&value.keys.auth.length<=256;
}
