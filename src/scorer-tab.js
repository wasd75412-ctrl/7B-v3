export const SCORER_TAB_CHANNEL='bcmScorerTabV1';
export const SCORER_TAB_SUPERSEDED_KEY='bcmScorerTabSupersededV1';

// Tabs of one browser share the scorer device id, so two admin tabs would both act as the scorer.
// A claim is the last time a tab was shown; a hidden tab claims 0 and never displaces a shown one.
export function scorerTabClaim({tabId='',roomId='',visible=false,now=Date.now(),previous=null}={}){
  const kept=previous?.roomId===roomId?Number(previous.at)||0:0;
  return {tabId:String(tabId),roomId:String(roomId),at:visible?now:kept};
}

export function claimSupersedes(incoming,own){
  if(!incoming?.tabId||!incoming.roomId||!own?.tabId||!own.roomId)return false;
  if(incoming.tabId===own.tabId||incoming.roomId!==own.roomId)return false;
  const theirs=Number(incoming.at)||0,ours=Number(own.at)||0;
  return theirs>ours||(theirs===ours&&String(incoming.tabId)>String(own.tabId));
}
