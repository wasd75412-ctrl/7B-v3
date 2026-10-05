import { decodeLiveMatch, encodeLiveMatch, matchSessionEpoch } from './live-score.js';

export const MATCH_JOURNAL_MAX_AGE_MS=6*60*60*1000;

export function matchJournalKey(roomId=''){
  return `bcmLiveMatchJournalV1:${roomId}`;
}

export function matchInProgress(match={}){
  return !!match?.active&&(match.winner===null||match.winner===undefined)&&(Boolean(match.startedAt)||(Array.isArray(match.rallies)&&match.rallies.length>0));
}

export function matchJournalEntry(match={},now=Date.now()){
  return matchInProgress(match)?{savedAt:now,match:encodeLiveMatch(match)}:null;
}

// A reload can hand the scoring device an older cloud copy when its writes never reached the server.
export function journaledMatchToRestore(entry,currentMatch={},{deviceId='',now=Date.now()}={}){
  if(!entry?.match||!(now-Number(entry.savedAt)<=MATCH_JOURNAL_MAX_AGE_MS))return null;
  const saved=decodeLiveMatch({match:entry.match},{});
  if(!matchInProgress(saved)||(saved.scorerDevice&&saved.scorerDevice!==deviceId))return null;
  const current=currentMatch||{};
  if(saved.matchId&&saved.matchId===current.matchId){
    const currentOpen=current.winner===null||current.winner===undefined;
    return currentOpen&&saved.rallies.length>(current.rallies||[]).length?saved:null;
  }
  return matchSessionEpoch(saved)>matchSessionEpoch(current)?saved:null;
}
