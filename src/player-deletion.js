function uniqueIds(values){
  return [...new Set((Array.isArray(values)?values:[]).filter(Boolean))];
}

export function normalizeRetiredPlayers(value){
  const seen=new Set();
  return(Array.isArray(value)?value:[]).map(record=>({
    id:String(record?.id||'').trim(),
    name:String(record?.name||'').trim().slice(0,40),
    avatar:String(record?.avatar||'')
  })).filter(record=>record.id&&record.name&&!seen.has(record.id)&&seen.add(record.id)).slice(-100);
}

function withoutId(values,id){return uniqueIds(values).filter(value=>value!==id)}
function cleanNextCall(value,id){
  if(!value||!Array.isArray(value.players))return null;
  const players=withoutId(value.players,id);
  return players.length===4?{...value,players}:null;
}

export function deletePlayerFromState(source,id){
  const playerId=String(id||''),roster=Array.isArray(source?.roster)?source.roster:[],record=roster.find(item=>item?.id===playerId);
  if(!record)return{deleted:false,reason:'missing',state:source};
  const livePlayers=source?.match?.active&&source.match?.winner===null?(source.match.players||[]).flat():[];
  if(livePlayers.includes(playerId))return{deleted:false,reason:'active-match',state:source};

  const referenced=(source.history||[]).some(match=>(match.teams||[]).flat().includes(playerId))
    ||(source.match?.players||[]).flat().includes(playerId)
    ||(source.shuttleTubes||[]).some(tube=>[...Object.keys(tube?.paid||{}),...(tube?.paidPlayerIds||[]),...(tube?.paidPlayedPlayerIds||[])].includes(playerId));
  const retired=normalizeRetiredPlayers(source.retiredPlayers).filter(item=>item.id!==playerId);
  if(referenced)retired.push({id:record.id,name:record.name,avatar:record.avatar||''});

  const voterPlayers={...(source.schedulePoll?.voterPlayers||{})},votes={...(source.schedulePoll?.votes||{})};
  for(const [deviceHash,voterId] of Object.entries(voterPlayers))if(voterId===playerId){delete voterPlayers[deviceHash];delete votes[deviceHash]}

  const rollback=source.matchRollback?{
    ...source.matchRollback,
    waitingQueue:withoutId(source.matchRollback.waitingQueue,playerId),
    queueDraftChosen:withoutId(source.matchRollback.queueDraftChosen,playerId),
    court:withoutId(source.matchRollback.court,playerId),
    priority:source.matchRollback.priority===playerId?null:source.matchRollback.priority,
    nextCall:cleanNextCall(source.matchRollback.nextCall,playerId)
  }:null;

  return{deleted:true,reason:'deleted',state:{
    ...source,
    roster:roster.filter(item=>item.id!==playerId),
    retiredPlayers:normalizeRetiredPlayers(retired),
    adminPlayerIds:withoutId(source.adminPlayerIds,playerId),
    attendance:withoutId(source.attendance,playerId),
    court:withoutId(source.court,playerId),
    waitingQueue:withoutId(source.waitingQueue,playerId),
    queueDraftChosen:withoutId(source.queueDraftChosen,playerId),
    priority:source.priority===playerId?null:source.priority,
    nextCall:cleanNextCall(source.nextCall,playerId),
    lastLoserReplayPlayerId:source.lastLoserReplayPlayerId===playerId?null:(source.lastLoserReplayPlayerId||null),
    matchRollback:rollback,
    schedulePoll:{...(source.schedulePoll||{}),voterPlayers,votes}
  }};
}
