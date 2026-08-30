function compactTime(value=''){
  const match=String(value).match(/^(\d{2}):(\d{2})$/);
  if(!match)return String(value||'');
  return match[2]==='00'?match[1]:`${match[1]}:${match[2]}`;
}

function compactDate(value=''){
  const match=String(value).match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match?`${Number(match[1])}/${Number(match[2])}`:String(value||'');
}

export function recruitingSlots(poll={}){
  const counts={};
  for(const option of Array.isArray(poll.options)?poll.options:[])counts[option.id]=new Set();
  for(const [deviceHash,value] of Object.entries(poll.votes||{})){
    const participant=poll.voterPlayers?.[deviceHash]||deviceHash;
    for(const optionId of String(value||'').split('|').filter(Boolean))if(counts[optionId])counts[optionId].add(participant);
  }
  return (Array.isArray(poll.options)?poll.options:[])
    .map(option=>({...option,participantCount:counts[option.id]?.size||0}))
    .filter(option=>option.participantCount===3||option.participantCount===4)
    .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}

export function recruitingMessage(poll={}){
  return recruitingSlots(poll).map((slot,index)=>{
    const date=compactDate(slot.date),time=`${compactTime(slot.time)}–${compactTime(slot.endTime)}`;
    if(index===0)return `哈囉～${date} ${time}我們有約羽球，目前${slot.participantCount}個人，你要不要一起來打🏸`;
    return `${date} ${time}也有一場，目前${slot.participantCount}個人，有空也可以一起來～`;
  }).join('\n');
}
