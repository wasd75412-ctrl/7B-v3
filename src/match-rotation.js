function uniqueIds(values){
  return [...new Set((Array.isArray(values)?values:[]).filter(Boolean))];
}

export function rotateAfterMatch({winners=[],losers=[],waitingQueue=[],attendance=[],lastLoserReplayPlayerId='',randomValue=0}={}){
  const winnerIds=uniqueIds(winners),loserIds=uniqueIds(losers),active=new Set(uniqueIds(attendance));
  const currentPlayers=new Set([...winnerIds,...loserIds]);
  let queue=uniqueIds(waitingQueue).filter(id=>active.has(id)&&!currentPlayers.has(id));
  const missing=uniqueIds(attendance).filter(id=>!currentPlayers.has(id)&&!queue.includes(id));
  queue=[...queue,...missing];
  let chosen=[],losersToTail=[],nextLoserReplayPlayerId=null;

  if(queue.length>=2){
    chosen=queue.splice(0,2);
    losersToTail=[...loserIds];
  }else if(queue.length===1){
    const priorityPlayer=queue.shift();
    const eligibleLosers=loserIds.filter(id=>id!==lastLoserReplayPlayerId);
    const candidates=eligibleLosers.length?eligibleLosers:loserIds;
    const index=candidates.length?Math.abs(Math.trunc(Number(randomValue)||0))%candidates.length:0;
    const replayPlayer=candidates[index]||'';
    chosen=[priorityPlayer,replayPlayer].filter(Boolean);
    losersToTail=loserIds.filter(id=>id!==replayPlayer);
    nextLoserReplayPlayerId=replayPlayer||null;
  }else{
    chosen=[...loserIds];
  }

  const nextWaitingQueue=uniqueIds([...queue,...losersToTail]).filter(id=>active.has(id)&&!winnerIds.includes(id)&&!chosen.includes(id));
  return{
    chosen,
    waitingQueue:nextWaitingQueue,
    priority:nextWaitingQueue[0]||null,
    lastLoserReplayPlayerId:nextLoserReplayPlayerId
  };
}
