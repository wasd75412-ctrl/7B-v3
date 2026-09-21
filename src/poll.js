export function pollWasFinalized(poll={}){
  return poll?.status==='closed'&&!(Array.isArray(poll?.options)&&poll.options.length);
}

export const POLL_SLOT_CAPACITY=6;

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
