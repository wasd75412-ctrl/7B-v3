import { calculateCombinedPerPersonFee } from './next-event.js';
import { playedParticipantIds } from './session-participants.js';
import { normalizeShuttleTubes, sessionShuttleUsage, shuttleUnitPrice } from './shuttle-tube.js';

const DATE_KEY=/^\d{4}-\d{2}-\d{2}$/;

export function taipeiDateKey(now=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}

export function nextEventIdentity(event={}){
  const explicit=String(event.id||event.optionId||event.publishedAt||'').trim();
  return (explicit||`${event.date||''}_${event.time||''}_${event.endTime||''}_${event.location||''}`).slice(0,180);
}

export function matchDateKey(match){
  if(DATE_KEY.test(match?.dateKey||''))return match.dateKey;
  const ended=Date.parse(match?.endedAt||'');
  return Number.isFinite(ended)?taipeiDateKey(new Date(ended)):'';
}

function historyMatch(match){
  if(!match||typeof match!=='object')return null;
  if(Array.isArray(match.teams))return match;
  return {...match,teams:[[match.teamA1,match.teamA2].filter(Boolean),[match.teamB1,match.teamB2].filter(Boolean)]};
}

function todaysEvent(room,today){
  return [...(Array.isArray(room.nextEvents)?room.nextEvents:[]),room.nextEvent]
    .filter(event=>event&&event.date===today)
    .sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`))[0]||null;
}

export function sessionFeeNoticeText(amount,{transferBankCode='',transferAccount=''}={}){
  const fee=Math.max(0,Math.round(Number(amount)||0));
  const formatted=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(fee);
  const account=String(transferAccount||'').trim().slice(0,40),bankCode=String(transferBankCode||'').trim().slice(0,3);
  const parts=[`今日繳費 ${formatted} 元`];
  if(account)parts.push(`轉帳帳號 ${bankCode?`(${bankCode}) `:''}${account}`);
  parts.push('若已轉帳請按回報繳費');
  return {title:'今日繳費',body:parts.join('｜')};
}

export function sessionFeeNoticeFromRoom(room={},today=''){
  const date=String(today||'');
  if(!DATE_KEY.test(date))return null;
  const event=todaysEvent(room,date);
  if(!event)return null;
  const eventId=nextEventIdentity(event);
  const playerIds=playedParticipantIds((Array.isArray(room.history)?room.history:[]).map(historyMatch).filter(match=>match&&matchDateKey(match)===date));
  if(!playerIds.length)return null;
  const tube=normalizeShuttleTubes(room.shuttleTubes).find(row=>row.status==='active')||null;
  const used=sessionShuttleUsage(tube,eventId);
  const amount=calculateCombinedPerPersonFee(Math.max(0,Math.round(Number(event.rentalTotal)||0)),used*shuttleUnitPrice(tube?.price),playerIds.length);
  if(!amount)return null;
  const transfer={transferBankCode:String(event.transferBankCode||''),transferAccount:String(event.transferAccount||'')};
  return {eventId,amount,playerIds,...transfer,...sessionFeeNoticeText(amount,transfer)};
}

export function sessionFeeSubscriptionTargets(records,playerIds){
  const ids=new Set(playerIds);
  return (Array.isArray(records)?records:[]).filter(record=>ids.has(String(record?.playerId||'')));
}

export function sessionFeeNoticePayload({siteUrl,roomId,eventId,amount,noticeId,transferBankCode='',transferAccount=''}){
  const base=String(siteUrl||'').replace(/\/$/,'');
  return {
    ...sessionFeeNoticeText(amount,{transferBankCode,transferAccount}),
    url:`${base}/?room=${encodeURIComponent(roomId)}&page=payment&event=${encodeURIComponent(eventId)}`,
    icon:`${base}/icons/icon-192.png`,
    badge:`${base}/icons/icon-192.png`,
    tag:`7b-session-fee-${roomId}-${noticeId}`,
    actions:[{action:'report-payment',title:'回報繳費'}]
  };
}
