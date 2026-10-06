export const ERROR_LOG_KEY='bcmErrorLogV1';
export const ERROR_LOG_MAX_ENTRIES=30;
export const ERROR_LOG_UPLOAD_GAP_MS=60_000;
export const ERROR_LOG_DAILY_UPLOADS=30;
const MESSAGE_LIMIT=160,SOURCE_LIMIT=80,KIND_LIMIT=16;

const clip=(value,limit)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,limit);
const count=value=>Number.isFinite(Number(value))&&Number(value)>0?Math.floor(Number(value)):0;

// Messages that differ only by counters or ids collapse into one entry with a repeat count.
export function errorSignature(kind,message,source){
  return `${kind}|${message.replace(/\d+/g,'#')}|${source.replace(/\d+/g,'#')}`;
}

export function emptyErrorLog(){
  return{entries:[],dirty:false,lastUploadAt:0,uploadDay:'',uploadsToday:0};
}

export function normalizeErrorLog(value){
  const base=emptyErrorLog();
  if(!value||typeof value!=='object')return base;
  const entries=(Array.isArray(value.entries)?value.entries:[]).map(entry=>{
    const k=clip(entry?.k,KIND_LIMIT)||'error',m=clip(entry?.m,MESSAGE_LIMIT),s=clip(entry?.s,SOURCE_LIMIT);
    return m?{sig:errorSignature(k,m,s),k,m,s,n:count(entry?.n)||1,f:count(entry?.f),l:count(entry?.l)}:null;
  }).filter(Boolean).slice(-ERROR_LOG_MAX_ENTRIES);
  return{
    entries,
    dirty:Boolean(value.dirty)&&entries.length>0,
    lastUploadAt:count(value.lastUploadAt),
    uploadDay:typeof value.uploadDay==='string'?value.uploadDay:'',
    uploadsToday:count(value.uploadsToday)
  };
}

export function recordErrorEntry(log,{kind='error',message='',source=''}={},now=Date.now()){
  const m=clip(message,MESSAGE_LIMIT);
  if(!m)return log;
  const k=clip(kind,KIND_LIMIT)||'error',s=clip(source,SOURCE_LIMIT),sig=errorSignature(k,m,s);
  const previous=log.entries.find(entry=>entry.sig===sig);
  const entry=previous?{...previous,m,n:previous.n+1,l:now}:{sig,k,m,s,n:1,f:now,l:now};
  return{...log,entries:[...log.entries.filter(item=>item.sig!==sig),entry].slice(-ERROR_LOG_MAX_ENTRIES),dirty:true};
}

export function matchInPlay(match={}){
  return Boolean(match?.active)&&(match.winner===null||match.winner===undefined);
}

// Uploads wait for a break between matches so a weak venue signal never queues them ahead of scores.
export function canUploadErrorLog(log,{matchInProgress=false,online=true,now=Date.now(),day=''}={}){
  if(!log.dirty||matchInProgress||!online)return false;
  if(now-log.lastUploadAt<ERROR_LOG_UPLOAD_GAP_MS)return false;
  return (log.uploadDay===day?log.uploadsToday:0)<ERROR_LOG_DAILY_UPLOADS;
}

export function reachedDailyUploads(log,day=''){
  return log.uploadDay===day&&log.uploadsToday>=ERROR_LOG_DAILY_UPLOADS;
}

export function markErrorLogUploaded(log,now=Date.now(),day=''){
  return{...log,dirty:false,lastUploadAt:now,uploadDay:day,uploadsToday:(log.uploadDay===day?log.uploadsToday:0)+1};
}

export function errorLogPayload(log){
  return log.entries.map(({k,m,s,n,f,l})=>({k,m,s,n,f,l}));
}

export function describeLoggedArgs(args=[]){
  const parts=[];
  for(const arg of args){
    if(typeof arg==='string')parts.push(arg);
    else if(arg instanceof Error)parts.push(arg.code?`${arg.code}: ${arg.message}`:arg.message);
    else if(arg&&typeof arg==='object'&&(arg.message||arg.code))parts.push(String(arg.code?`${arg.code}: ${arg.message||''}`:arg.message));
  }
  return clip(parts.join(' '),MESSAGE_LIMIT);
}
