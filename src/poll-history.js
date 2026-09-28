export const POLL_UNAVAILABLE='__unavailable__';

function selectionList(value){
  return String(value||'').split('|').map(item=>item.trim()).filter(Boolean);
}

export function prunePollHistoryRows(rows,today){
  return(Array.isArray(rows)?rows:[]).map(row=>{
    const options=(Array.isArray(row?.options)?row.options:[]).filter(option=>String(option?.date||'')>=today);
    if(!options.length)return null;
    const validOptionIds=new Set(options.map(option=>String(option.id||'')).filter(Boolean));
    const votes={};
    for(const[deviceHash,value]of Object.entries(row.votes&&typeof row.votes==='object'?row.votes:{})){
      const kept=selectionList(value).filter(id=>id===POLL_UNAVAILABLE||validOptionIds.has(id));
      if(kept.length)votes[deviceHash]=kept.join('|');
    }
    const voterPlayers=Object.fromEntries(Object.entries(row.voterPlayers&&typeof row.voterPlayers==='object'?row.voterPlayers:{}).filter(([deviceHash])=>deviceHash in votes));
    const manualParticipants=Object.fromEntries(Object.entries(row.manualParticipants&&typeof row.manualParticipants==='object'?row.manualParticipants:{}).filter(([optionId])=>validOptionIds.has(optionId)));
    return{...row,options,votes,voterPlayers,manualParticipants};
  }).filter(Boolean);
}
