function validDate(value){
  const date=new Date(value||'');
  return Number.isNaN(date.getTime())?null:date;
}

export function groupMatchHistoryByDate(history=[],dateKeyForMatch=()=>'',fallbackDateKey=''){
  const groups=new Map();
  history.forEach((match,index)=>{
    const dateKey=dateKeyForMatch(match)||fallbackDateKey||'日期不明';
    if(!groups.has(dateKey))groups.set(dateKey,[]);
    groups.get(dateKey).push({match,index});
  });
  return [...groups.entries()]
    .map(([dateKey,matches])=>({dateKey,matches:matches.sort((a,b)=>{
      const aTime=validDate(a.match.startedAt)?.getTime()??validDate(a.match.endedAt)?.getTime()??a.index;
      const bTime=validDate(b.match.startedAt)?.getTime()??validDate(b.match.endedAt)?.getTime()??b.index;
      return aTime-bTime;
    })}))
    .sort((a,b)=>b.dateKey.localeCompare(a.dateKey));
}

export function matchDayTimeline(matches=[]){
  const rows=matches.map((entry,position)=>{
    const match=entry.match||entry;
    return {...entry,match,position,start:validDate(match.startedAt),end:validDate(match.endedAt)};
  });
  const firstStart=rows.find(row=>row.start)?.start||null;
  const lastEnd=[...rows].reverse().find(row=>row.end)?.end||null;
  return {
    rows:rows.map(row=>({...row,offsetSeconds:firstStart&&row.start?Math.max(0,Math.floor((row.start-firstStart)/1000)):null})),
    firstStart,
    lastEnd,
    durationSeconds:firstStart&&lastEnd&&lastEnd>=firstStart?Math.floor((lastEnd-firstStart)/1000):null
  };
}

export function formatTimelineOffset(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '—';
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),secs=total%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${minutes}:${String(secs).padStart(2,'0')}`;
}

export function formatDuration(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '—';
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60);
  return hours?`${hours} 小時 ${minutes} 分鐘`:`${minutes} 分鐘`;
}
