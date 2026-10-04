export const ROOM_HISTORY_KEEP=40;
export const DELETED_MATCH_KEEP=500;
export const SYNC_MODE_LITE='lite';
export const SYNC_MODE_FULL='full';

export function normalizeSyncMode(value){
  return value===SYNC_MODE_FULL?SYNC_MODE_FULL:SYNC_MODE_LITE;
}

export function shouldSkipFullRoomSync({mode,matchActive=false,matchOpen=false}={}){
  return normalizeSyncMode(mode)===SYNC_MODE_LITE&&!!matchActive&&!!matchOpen;
}

export function recentHistory(history,keep=ROOM_HISTORY_KEEP){
  const rows=Array.isArray(history)?history.filter(Boolean):[];
  return rows.length>keep?rows.slice(rows.length-keep):rows.slice();
}

export function overflowHistory(history,keep=ROOM_HISTORY_KEEP){
  const rows=Array.isArray(history)?history.filter(row=>row&&!row.testMode&&row.matchId):[];
  return rows.length>keep?rows.slice(0,rows.length-keep):[];
}

export function archiveDocId(matchId){
  const id=String(matchId||'').trim().replace(/[/\s]/g,'_').slice(0,700);
  return id||'match';
}

export function encodeArchivedMatch(row={}){
  const teams=Array.isArray(row.teams)?row.teams:[];
  return {
    matchId:String(row.matchId||''),
    time:row.time||'',
    teamA1:row.teamA1||teams[0]?.[0]||'',
    teamA2:row.teamA2||teams[0]?.[1]||'',
    teamB1:row.teamB1||teams[1]?.[0]||'',
    teamB2:row.teamB2||teams[1]?.[1]||'',
    scoreA:row.scoreA??row.scores?.[0]??0,
    scoreB:row.scoreB??row.scores?.[1]??0,
    winner:row.winner===0||row.winner===1?row.winner:null,
    format:row.format==='singles'?'singles':'doubles',
    endedAt:row.endedAt||'',
    startedAt:row.startedAt||'',
    dateKey:row.dateKey||'',
    monthKey:row.monthKey||''
  };
}

export function decodeArchivedMatch(row={}){
  const encoded=encodeArchivedMatch(row);
  return {
    matchId:encoded.matchId,
    time:encoded.time,
    teams:[[encoded.teamA1,encoded.teamA2].filter(Boolean),[encoded.teamB1,encoded.teamB2].filter(Boolean)],
    scores:[encoded.scoreA,encoded.scoreB],
    winner:encoded.winner,
    format:encoded.format,
    testMode:false,
    endedAt:encoded.endedAt,
    startedAt:encoded.startedAt,
    dateKey:encoded.dateKey,
    monthKey:encoded.monthKey
  };
}

export function mergeMatchHistory(roomHistory,archived,removedIds){
  const removed=removedIds instanceof Set?removedIds:new Set(removedIds||[]);
  const merged=[];
  const indexById=new Map();
  const indexByStart=new Map();
  const add=row=>{
    if(!row||row.testMode)return;
    const id=String(row.matchId||'');
    const start=String(row.startedAt||'');
    if(id&&removed.has(id))return;
    if(id&&indexById.has(id)){
      const index=indexById.get(id);
      merged[index]=row;
      if(start)indexByStart.set(start,index);
      return;
    }
    if(start&&indexByStart.has(start)){
      const index=indexByStart.get(start);
      merged[index]=row;
      if(id)indexById.set(id,index);
      return;
    }
    const index=merged.length;
    if(id)indexById.set(id,index);
    if(start)indexByStart.set(start,index);
    merged.push(row);
  };
  for(const row of archived||[])add(row);
  for(const row of roomHistory||[])add(row);
  return merged.map((row,index)=>({row,index})).sort((a,b)=>{
    const at=Date.parse(a.row.endedAt||a.row.startedAt||'')||0;
    const bt=Date.parse(b.row.endedAt||b.row.startedAt||'')||0;
    return at-bt||a.index-b.index;
  }).map(item=>item.row);
}

export const ARCHIVE_CACHE_FULL_REFRESH_MS=7*24*60*60*1000;

export function archiveCacheKey(roomId){
  return `bcmMatchArchiveCacheV1:${roomId||'local'}`;
}

export function readArchiveCache(storage,roomId){
  try{
    const parsed=JSON.parse(storage.getItem(archiveCacheKey(roomId))||'null');
    if(!parsed||!Array.isArray(parsed.rows))return null;
    return {rows:parsed.rows.filter(row=>row&&row.matchId).map(encodeArchivedMatch),fullAt:Number(parsed.fullAt)||0};
  }catch{return null}
}

export function writeArchiveCache(storage,roomId,{rows,fullAt}){
  try{storage.setItem(archiveCacheKey(roomId),JSON.stringify({rows:(rows||[]).map(encodeArchivedMatch),fullAt:Number(fullAt)||0}))}catch{}
}

export function archiveCacheNeedsFullRefresh(cache,now=Date.now()){
  return !cache||!cache.fullAt||now-cache.fullAt>ARCHIVE_CACHE_FULL_REFRESH_MS;
}

export function archiveSyncCursor(rows){
  let cursor='';
  for(const row of rows||[]){const endedAt=String(row?.endedAt||'');if(endedAt>cursor)cursor=endedAt}
  return cursor;
}

export function mergeArchiveRows(cached,fresh){
  const byId=new Map();
  for(const row of cached||[])if(row?.matchId)byId.set(String(row.matchId),encodeArchivedMatch(row));
  for(const row of fresh||[])if(row?.matchId)byId.set(String(row.matchId),encodeArchivedMatch(row));
  return [...byId.values()];
}

export function mergeDeletedMatchIds(...lists){
  const ids=[],seen=new Set();
  for(const list of lists){
    for(const id of Array.isArray(list)||list instanceof Set?list:[]){
      const value=String(id||'').trim();
      if(!value||seen.has(value))continue;
      seen.add(value);ids.push(value);
    }
  }
  return ids.slice(-DELETED_MATCH_KEEP);
}

export function pendingArchiveKey(roomId){
  return `bcmPendingMatchArchiveV1:${roomId||'local'}`;
}

export function readPendingArchives(storage,roomId){
  try{
    const parsed=JSON.parse(storage.getItem(pendingArchiveKey(roomId))||'[]');
    return Array.isArray(parsed)?parsed.filter(row=>row&&row.matchId):[];
  }catch{return []}
}

export function writePendingArchives(storage,roomId,rows){
  const key=pendingArchiveKey(roomId);
  if(!rows?.length)storage.removeItem(key);
  else storage.setItem(key,JSON.stringify(rows));
}
