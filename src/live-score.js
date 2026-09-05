export const LIVE_SCORE_SCHEMA_VERSION=1;

const pair=(value,fallback)=>Array.isArray(value)?value.slice(0,2):[...fallback];
const team=value=>Array.isArray(value)?value.filter(Boolean).slice(0,2):[];

export function encodeLiveMatch(source={}){
  return{
    active:!!source.active,
    teamA:team(source.players?.[0]??source.teamA),
    teamB:team(source.players?.[1]??source.teamB),
    scores:pair(source.scores,[0,0]).map(value=>Math.max(0,Number(value)||0)),
    rallies:Array.isArray(source.rallies)?source.rallies.filter(value=>value===0||value===1):[],
    serving:source.serving===1?1:0,
    posA:pair(source.positions?.[0]??source.posA,[0,1]),
    posB:pair(source.positions?.[1]??source.posB,[0,1]),
    winner:source.winner===0||source.winner===1?source.winner:null,
    matchId:source.matchId||null,
    scoreFont:typeof source.scoreFont==='string'?source.scoreFont:'',
    testMode:!!source.testMode,
    testCompleted:!!source.testCompleted,
    ...(Number(source.syncEpoch)>0?{syncEpoch:Number(source.syncEpoch)}:{}),
    startedAt:source.startedAt||''
  };
}

export function decodeLiveMatch(source={},fallback={}){
  const encoded=source?.match||source||{};
  const base=encodeLiveMatch(fallback);
  const match=encodeLiveMatch({...base,...encoded});
  return{
    ...fallback,
    active:match.active,
    players:[match.teamA,match.teamB],
    scores:match.scores,
    rallies:match.rallies,
    serving:match.serving,
    positions:[match.posA,match.posB],
    winner:match.winner,
    matchId:match.matchId,
    scoreFont:match.scoreFont,
    testMode:match.testMode,
    testCompleted:match.testCompleted,
    syncEpoch:Number(encoded.syncEpoch)||((encoded.matchId||null)===(base.matchId||null)?Number(base.syncEpoch)||0:0),
    startedAt:match.startedAt
  };
}

export function createLiveScoreData(match){
  return{schemaVersion:LIVE_SCORE_SCHEMA_VERSION,match:encodeLiveMatch(match)};
}

// Session order is independent of a document's updatedAt: an old device can write later.
export function matchSessionEpoch(match={}){
  return Number(match.syncEpoch)||Date.parse(match.startedAt)||0;
}

export function nextMatchEpoch(previous={},now=Date.now()){
  return Math.max(now,matchSessionEpoch(previous)+1);
}

export function createMatchCheckpointData(match){
  const liveScore=createLiveScoreData(match);
  return{liveScore,room:{match:liveScore.match,liveScoreEnabled:true,liveScoreMatchKey:liveMatchKey(match)}};
}

export function generalRoomStateWithoutMatch(encodedState={}){
  const {match:_liveMatch,...generalState}=encodedState&&typeof encodedState==='object'?encodedState:{};
  return generalState;
}

export function shouldShowScoreView({matchActive=false,isHost=false,androidRemote=false,requested=false}={}){
  return Boolean(matchActive&&isHost&&!androidRemote&&requested);
}

export function liveMatchKey(source={}){
  return JSON.stringify(encodeLiveMatch(source?.match||source));
}

export function shouldApplyIncomingLiveMatch({isHost=false,writePending=false,currentMatchId='',incomingMatchId='',currentMatch,incomingMatch}={}){
  const current=String(currentMatch?.matchId||currentMatchId||''),incoming=String(incomingMatch?.matchId||incomingMatchId||'');
  const currentEpoch=matchSessionEpoch(currentMatch),incomingEpoch=matchSessionEpoch(incomingMatch);
  if(current===incoming){
    return !(currentEpoch&&incomingEpoch&&incomingEpoch<currentEpoch);
  }
  if(currentEpoch)return incomingEpoch>currentEpoch;
  if(isHost&&writePending&&current)return false;
  // Preserve the legacy ID-only API; real snapshots supply the complete matches.
  if(currentMatch&&current&&!incomingEpoch)return false;
  return true;
}

export function shouldKeepLatestLiveMatch({liveScoreReady=false,hasLatestLiveMatch=false}={}){
  return Boolean(liveScoreReady&&hasLatestLiveMatch);
}

export function shouldAnnounceSyncedLiveScore({announce=true,snapshotReady=false,changed=false,scoreVisible=false,androidRemote=false,matchActive=false,voiceEnabled=false}={}){
  return Boolean(announce&&snapshotReady&&changed&&scoreVisible&&!androidRemote&&matchActive&&voiceEnabled);
}
