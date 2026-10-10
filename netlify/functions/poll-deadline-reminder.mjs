import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { PUSH_STORE, allRoomSubscriptions, configureWebPush, jsonResponse, sendWebPush } from './lib/push-shared.mjs';

const FIREBASE_PROJECT='badminton-7a1c3';
const FIREBASE_API_KEY='AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM';
const TAIPEI_OFFSET_MS=8*60*60*1000;
const DAY_MS=24*60*60*1000;
const REMINDER_WEEKDAY=6,REMINDER_HOUR=12;

function fieldString(field){return field?.stringValue||field?.timestampValue||''}

export function firestorePollFromDocument(document){
  const fields=document?.fields?.schedulePoll?.mapValue?.fields||{};
  return{
    status:fieldString(fields.status)||'open',
    deadlineAt:fieldString(fields.deadlineAt),
    optionCount:fields.options?.arrayValue?.values?.length||0
  };
}

// The reminder always starts at the last Saturday 12:00 in Taipei before the deadline.
export function reminderStartMs(deadlineAt){
  const deadline=Date.parse(deadlineAt||'');
  if(!Number.isFinite(deadline))return NaN;
  const local=new Date(deadline+TAIPEI_OFFSET_MS);
  let start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-((local.getUTCDay()-REMINDER_WEEKDAY+7)%7),REMINDER_HOUR)-TAIPEI_OFFSET_MS;
  if(start>=deadline)start-=7*DAY_MS;
  return start;
}

export function isReminderDue(poll,lastReminderDeadline='',now=Date.now()){
  const deadline=Date.parse(poll?.deadlineAt||'');
  return poll?.status!=='closed'&&poll?.optionCount>0&&Number.isFinite(deadline)&&now<deadline&&now>=reminderStartMs(poll?.deadlineAt)&&lastReminderDeadline!==poll.deadlineAt;
}

function taipeiDayNumber(ms){return Math.floor((ms+TAIPEI_OFFSET_MS)/DAY_MS)}

export function reminderTitle(deadlineAt,now=Date.now()){
  const days=taipeiDayNumber(Date.parse(deadlineAt||''))-taipeiDayNumber(now);
  return days===0?'🔥投票今日截止🔥':days===1?'🔥投票明日截止🔥':'🔥投票即將截止🔥';
}

function endpointHost(endpoint){try{return new URL(endpoint).host}catch{return ''}}

// Only the push host is exposed, never the full endpoint or keys.
export function pushFailure(record,error){
  return{
    roomId:record?.roomId||'',
    playerName:record?.playerName||'',
    host:endpointHost(record?.subscription?.endpoint),
    status:Number(error?.statusCode)||0,
    error:String(error?.body||error?.message||error||'').slice(0,160),
    updatedAt:record?.updatedAt||''
  };
}

async function getRoomPoll(roomId){
  const apiKey=process.env.FIREBASE_API_KEY||FIREBASE_API_KEY;
  const url=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/badmintonRooms/${encodeURIComponent(roomId)}?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`Firestore ${roomId}: ${response.status}`);
  return firestorePollFromDocument(await response.json());
}

export default async()=>{
  const push=configureWebPush();
  if(!push)return jsonResponse({error:'手機通知服務尚未完成設定。'},503);
  const siteUrl=push.siteUrl;
  const store=getStore({name:PUSH_STORE,consistency:'strong'}),byRoom=await allRoomSubscriptions(store);
  let checked=0,sent=0,removed=0,failed=0;const failures=[];
  for(const [roomId,items] of byRoom){
    checked+=items.length;
    let poll;
    try{poll=await getRoomPoll(roomId)}catch(error){console.error(error);failed+=items.length;failures.push({roomId,error:String(error?.message||error).slice(0,160)});continue}
    for(const item of items){
      if(!isReminderDue(poll,item.record.lastReminderDeadline))continue;
      const payload=JSON.stringify({
        title:reminderTitle(poll.deadlineAt),
        body:'還沒投票的球友們，點一下進行投票🏸',
        url:`${siteUrl}/?room=${encodeURIComponent(roomId)}&page=poll`,
        icon:`${siteUrl}/icons/icon-192.png`,
        badge:`${siteUrl}/icons/icon-192.png`,
        tag:`7b-poll-${roomId}-${poll.deadlineAt}`
      });
      try{
        await sendWebPush(item.record.subscription,payload,{TTL:Math.max(60,Math.ceil((Date.parse(poll.deadlineAt)-Date.now())/1000)),urgency:'normal',topic:`poll-${roomId}`});
        item.record.lastReminderDeadline=poll.deadlineAt;
        item.record.lastReminderAt=new Date().toISOString();
        await store.setJSON(item.key,item.record);
        sent++;
      }catch(error){
        if(error?.statusCode===404||error?.statusCode===410){await store.delete(item.key);removed++}
        else{console.error(`Push ${roomId} failed`,error);failed++;failures.push(pushFailure(item.record,error))}
      }
    }
  }
  const result={ok:true,checked,sent,removed,failed,failures};
  console.log('Poll reminder run',result);
  return jsonResponse(result);
};

export const config={schedule:'*/5 * * * *'};
