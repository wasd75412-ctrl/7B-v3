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
    startedAt:match.startedAt
  };
}

export function createLiveScoreData(match){
  return{schemaVersion:LIVE_SCORE_SCHEMA_VERSION,match:encodeLiveMatch(match)};
}

export function liveMatchKey(source={}){
  return JSON.stringify(encodeLiveMatch(source?.match||source));
}
