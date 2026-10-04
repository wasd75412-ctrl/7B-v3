import { createECDH, createHash } from 'node:crypto';
import webpush from 'web-push';

export const PUSH_STORE='7b-push-subscriptions';
const ROOMS_INDEX_KEY='index/rooms';

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

export function normalizeVapidKey(value){
  return String(value||'').trim().replace(/^(['"])(.*)\1$/,'$2').trim().replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function httpsUrl(value){
  try{const url=new URL(String(value||'').trim());return url.protocol==='https:'?url.href.replace(/\/$/,''):''}catch{return''}
}

function vapidSubject(value){
  try{const url=new URL(String(value||'').trim());return ['https:','mailto:'].includes(url.protocol)?url.href:''}catch{return''}
}

export function vapidKeyPairMatches(publicKey,privateKey){
  if(!/^[A-Za-z0-9_-]+$/.test(publicKey)||!/^[A-Za-z0-9_-]+$/.test(privateKey))return false;
  try{
    const ecdh=createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(privateKey,'base64url'));
    return ecdh.getPublicKey().toString('base64url')===publicKey;
  }catch{return false}
}

export function pushSettings(env=process.env){
  const publicKey=normalizeVapidKey(env.VAPID_PUBLIC_KEY),privateKey=normalizeVapidKey(env.VAPID_PRIVATE_KEY);
  const siteUrl=httpsUrl(env.URL)||httpsUrl(env.DEPLOY_PRIME_URL);
  if(!siteUrl||!vapidKeyPairMatches(publicKey,privateKey))return null;
  return{publicKey,privateKey,siteUrl,subject:vapidSubject(env.VAPID_SUBJECT)||siteUrl};
}

export function configureWebPush(env=process.env){
  const settings=pushSettings(env);
  if(settings)webpush.setVapidDetails(settings.subject,settings.publicKey,settings.privateKey);
  return settings;
}

// Cloudflare Workers has no node:https request, so the encrypted request from web-push is sent with fetch.
export async function sendWebPush(subscription,payload,options={}){
  const details=webpush.generateRequestDetails(subscription,payload,options);
  const headers={...details.headers};
  delete headers['Content-Length'];
  const response=await fetch(details.endpoint,{method:details.method,headers,body:details.body});
  if(response.ok)return{statusCode:response.status};
  const error=new Error(`Push service responded ${response.status}`);
  error.statusCode=response.status;
  error.body=await response.text().catch(()=>'');
  throw error;
}

export function subscriptionIndexKey(roomId){return `index/${roomId}`}

function uniqueKeys(keys){return [...new Set((keys||[]).filter(key=>typeof key==='string'&&key))].sort()}

async function readIndex(store,key){
  const value=await store.get(key,{type:'json'}).catch(()=>null);
  return value&&typeof value==='object'?value:null;
}

// KV list() has a small daily quota, so subscribers are found through per-room index values instead.
export async function indexSubscription(store,roomId,key){
  const index=await readIndex(store,subscriptionIndexKey(roomId)),keys=Array.isArray(index?.keys)?index.keys:[];
  if(!keys.includes(key))await store.setJSON(subscriptionIndexKey(roomId),{...index,keys:uniqueKeys([...keys,key])});
  const rooms=await readIndex(store,ROOMS_INDEX_KEY),roomIds=Array.isArray(rooms?.rooms)?rooms.rooms:[];
  if(!roomIds.includes(roomId))await store.setJSON(ROOMS_INDEX_KEY,{...rooms,rooms:uniqueKeys([...roomIds,roomId])});
}

export async function unindexSubscription(store,roomId,key){
  const index=await readIndex(store,subscriptionIndexKey(roomId));
  if(!Array.isArray(index?.keys)||!index.keys.includes(key))return;
  await store.setJSON(subscriptionIndexKey(roomId),{...index,keys:index.keys.filter(item=>item!==key)});
}

export async function roomSubscriptionKeys(store,roomId){
  const index=await readIndex(store,subscriptionIndexKey(roomId));
  let keys=Array.isArray(index?.keys)?index.keys:[];
  if(index?.complete)return{keys,complete:true};
  try{
    const listing=await store.list({prefix:`${roomId}/`});
    keys=uniqueKeys([...keys,...listing.blobs.map(blob=>blob.key)]);
    await store.setJSON(subscriptionIndexKey(roomId),{keys,complete:true});
    return{keys,complete:true};
  }catch(error){
    console.warn(`Push index ${roomId} rebuild skipped`,error?.message||error);
    return{keys,complete:false};
  }
}

export async function roomSubscriptions(store,roomId){
  const {keys}=await roomSubscriptionKeys(store,roomId),rows=[],missing=[];
  for(const key of keys){
    let record;
    try{record=await store.get(key,{type:'json'})}catch(error){console.warn(`Push record ${key} unreadable`,error?.message||error);continue}
    if(record===null||record===undefined){missing.push(key);continue}
    if(record.roomId===roomId&&validSubscription(record.subscription))rows.push({key,record});
  }
  if(missing.length){
    const index=await readIndex(store,subscriptionIndexKey(roomId));
    if(Array.isArray(index?.keys))await store.setJSON(subscriptionIndexKey(roomId),{...index,keys:index.keys.filter(key=>!missing.includes(key))}).catch(()=>{});
  }
  return rows;
}

export async function allRoomSubscriptions(store){
  const rooms=await readIndex(store,ROOMS_INDEX_KEY);
  let roomIds=Array.isArray(rooms?.rooms)?rooms.rooms:[];
  if(!rooms?.complete){
    try{
      const listing=await store.list(),grouped=new Map();
      for(const {key} of listing.blobs){
        const roomId=String(key).split('/')[0];
        if(!validRoomId(roomId))continue;
        grouped.set(roomId,[...(grouped.get(roomId)||[]),key]);
      }
      for(const [roomId,keys] of grouped){
        const index=await readIndex(store,subscriptionIndexKey(roomId));
        await store.setJSON(subscriptionIndexKey(roomId),{keys:uniqueKeys([...(index?.keys||[]),...keys]),complete:true});
      }
      roomIds=uniqueKeys([...roomIds,...grouped.keys()]);
      await store.setJSON(ROOMS_INDEX_KEY,{rooms:roomIds,complete:true});
    }catch(error){
      console.warn('Push room index rebuild skipped',error?.message||error);
    }
  }
  const result=new Map();
  for(const roomId of roomIds){
    const rows=await roomSubscriptions(store,roomId);
    if(rows.length)result.set(roomId,rows);
  }
  return result;
}
