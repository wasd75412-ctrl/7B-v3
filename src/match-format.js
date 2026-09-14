export const MATCH_FORMAT_DOUBLES='doubles';
export const MATCH_FORMAT_SINGLES='singles';

export function normalizeMatchFormat(value){
  return value===MATCH_FORMAT_SINGLES?MATCH_FORMAT_SINGLES:MATCH_FORMAT_DOUBLES;
}

export function matchPlayerCount(format){
  return normalizeMatchFormat(format)===MATCH_FORMAT_SINGLES?2:4;
}

export function teamsForLineup(players=[],format){
  const values=[...new Set(players.filter(Boolean))].slice(0,matchPlayerCount(format));
  return normalizeMatchFormat(format)===MATCH_FORMAT_SINGLES
    ?[[values[0]].filter(Boolean),[values[1]].filter(Boolean)]
    :[values.slice(0,2),values.slice(2,4)];
}

function uniqueIds(values){
  return [...new Set((Array.isArray(values)?values:[]).filter(Boolean))];
}

export function rotateSinglesAfterMatch({winner='',loser='',waitingQueue=[],attendance=[]}={}){
  const active=new Set(uniqueIds(attendance));
  const current=new Set([winner,loser].filter(Boolean));
  const queue=uniqueIds(waitingQueue).filter(id=>active.has(id)&&!current.has(id));
  for(const id of uniqueIds(attendance))if(!current.has(id)&&!queue.includes(id))queue.push(id);
  const challenger=queue.shift()||loser||'';
  const players=[winner,challenger].filter(Boolean);
  const nextWaitingQueue=uniqueIds([...queue,...(challenger!==loser?[loser]:[])]).filter(id=>active.has(id)&&!players.includes(id));
  return{players,waitingQueue:nextWaitingQueue,priority:nextWaitingQueue[0]||null};
}
