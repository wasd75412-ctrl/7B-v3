function idList(value){
  return Array.isArray(value)?value.filter(Boolean):[];
}

function uniqueIds(values){
  return [...new Set(idList(values))];
}

function cleanNextCall(value){
  const players=idList(value?.players).slice(0,4);
  return players.length?{players,createdAt:String(value?.createdAt||'')}:null;
}

export function normalizeFinishedMatchRollback(value){
  const matchId=String(value?.matchId||'').trim();
  if(!matchId)return null;
  return{
    matchId,
    waitingQueue:uniqueIds(value.waitingQueue),
    queueDraftChosen:uniqueIds(value.queueDraftChosen),
    priority:value.priority||null,
    nextCall:cleanNextCall(value.nextCall),
    court:uniqueIds(value.court).slice(0,4),
    lastLoserReplayPlayerId:value.lastLoserReplayPlayerId||null,
    createdAt:String(value.createdAt||''),
    inferred:!!value.inferred
  };
}

export function createFinishedMatchRollback(state,matchId,{inferred=false}={}){
  return normalizeFinishedMatchRollback({
    matchId,
    waitingQueue:state?.waitingQueue,
    queueDraftChosen:state?.queueDraftChosen,
    priority:state?.priority,
    nextCall:state?.nextCall,
    court:state?.court,
    lastLoserReplayPlayerId:state?.lastLoserReplayPlayerId,
    createdAt:new Date().toISOString(),
    inferred
  });
}

// Older app versions recorded the result before rollback metadata existed.
// Rebuild the pre-finish queue from the recorded teams, next call and current queue.
export function inferFinishedMatchRollback(state,record){
  const matchId=String(record?.matchId||state?.match?.matchId||'').trim();
  const teams=Array.isArray(record?.teams)?record.teams:state?.match?.players;
  const winner=record?.winner===0||record?.winner===1?record.winner:state?.match?.winner;
  if(!matchId||!Array.isArray(teams)||!Array.isArray(teams[0])||!Array.isArray(teams[1])||(winner!==0&&winner!==1))return null;
  const winners=new Set(idList(teams[winner])),losers=new Set(idList(teams[1-winner]));
  const promoted=idList(state?.nextCall?.players).filter(id=>!winners.has(id)&&!losers.has(id));
  const remaining=idList(state?.waitingQueue).filter(id=>!winners.has(id)&&!losers.has(id)&&!promoted.includes(id));
  const waitingQueue=uniqueIds([...promoted,...remaining]);
  return normalizeFinishedMatchRollback({
    matchId,
    waitingQueue,
    queueDraftChosen:[],
    priority:waitingQueue[0]||null,
    nextCall:null,
    court:idList(teams).flat().slice(0,4),
    lastLoserReplayPlayerId:null,
    createdAt:new Date().toISOString(),
    inferred:true
  });
}

export function reopenFinishedMatchState(state,matchId){
  const id=String(matchId||'').trim(),history=Array.isArray(state?.history)?state.history:[];
  if(!id)return{reopened:false};
  const removed=history.find(record=>record?.matchId===id)||null;
  const stored=normalizeFinishedMatchRollback(state?.matchRollback);
  const rollback=stored?.matchId===id?stored:inferFinishedMatchRollback(state,removed);
  if(!removed&&!rollback)return{reopened:false};
  return{
    reopened:true,
    inferred:!!rollback?.inferred,
    history:history.filter(record=>record?.matchId!==id),
    waitingQueue:rollback?rollback.waitingQueue:idList(state?.waitingQueue),
    queueDraftChosen:rollback?rollback.queueDraftChosen:idList(state?.queueDraftChosen),
    priority:rollback?rollback.priority:(state?.priority||null),
    nextCall:rollback?rollback.nextCall:(state?.nextCall||null),
    court:rollback?rollback.court:idList(state?.court),
    lastLoserReplayPlayerId:rollback?rollback.lastLoserReplayPlayerId:(state?.lastLoserReplayPlayerId||null),
    matchRollback:null
  };
}
