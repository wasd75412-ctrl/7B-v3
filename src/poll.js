export function pollWasFinalized(poll={}){
  return poll?.status==='closed'&&!(Array.isArray(poll?.options)&&poll.options.length);
}

export const POLL_SLOT_CAPACITY=6;

// Unsent ticks live only in memory and expire, so a room snapshot cannot wipe them mid-vote yet they never outlive the visit.
export const POLL_DRAFT_TTL_MS=10*60*1000;

export function pollDraftRound(poll={},roomId=''){
  return `${roomId}|${poll?.createdAt||''}|${poll?.autoCycle||''}`;
}

export function createPollDraft(poll={},roomId='',selected=[],now=Date.now()){
  return{round:pollDraftRound(poll,roomId),selected:[...new Set((selected||[]).map(String).filter(Boolean))],touchedAt:now};
}

export function activePollDraftSelection(draft,poll={},{roomId='',closed=false,now=Date.now(),extraIds=[]}={}){
  if(!draft||closed||draft.round!==pollDraftRound(poll,roomId))return null;
  const age=now-Number(draft.touchedAt);
  if(!(age>=0&&age<POLL_DRAFT_TTL_MS))return null;
  const valid=new Set([...(Array.isArray(poll?.options)?poll.options:[]).map(option=>option?.id),...extraIds].filter(Boolean));
  return (Array.isArray(draft.selected)?draft.selected:[]).filter(id=>valid.has(id));
}

export function pollSlotParticipantCount(poll={},optionId=''){
  if(!optionId)return 0;
  const participants=new Set();
  for(const [deviceHash,value] of Object.entries(poll.votes||{})){
    if(!String(value||'').split('|').filter(Boolean).includes(optionId))continue;
    const playerId=String(poll.voterPlayers?.[deviceHash]||'').trim();
    participants.add(playerId?`player:${playerId}`:`device:${deviceHash}`);
  }
  for(const playerId of Array.isArray(poll.manualParticipants?.[optionId])?poll.manualParticipants[optionId]:[]){
    const cleanId=String(playerId||'').trim();
    if(cleanId)participants.add(`player:${cleanId}`);
  }
  return participants.size;
}
