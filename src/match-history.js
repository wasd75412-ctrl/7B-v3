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

export function groupHistoryDatesByMonth(dateGroups=[]){
  const months=new Map();
  dateGroups.forEach(group=>{
    const monthKey=/^\d{4}-\d{2}/.test(group.dateKey||'')?group.dateKey.slice(0,7):'日期不明';
    if(!months.has(monthKey))months.set(monthKey,[]);
    months.get(monthKey).push(group);
  });
  return [...months.entries()].map(([monthKey,dates])=>({
    monthKey,
    dates,
    matchCount:dates.reduce((total,date)=>total+date.matches.length,0)
  })).sort((a,b)=>b.monthKey.localeCompare(a.monthKey));
}

export function matchDayTimeline(matches=[],sessionStartedAt=''){
  const rows=matches.map((entry,position)=>{
    const match=entry.match||entry;
    return {...entry,match,position,start:validDate(match.startedAt),end:validDate(match.endedAt)};
  });
  const firstStart=rows.find(row=>row.start)?.start||null;
  const timelineStart=validDate(sessionStartedAt)||firstStart;
  const lastEnd=[...rows].reverse().find(row=>row.end)?.end||null;
  return {
    rows:rows.map(row=>({...row,offsetSeconds:timelineStart&&row.start?Math.max(0,Math.floor((row.start-timelineStart)/1000)):null})),
    timelineStart,
    firstStart,
    lastEnd,
    durationSeconds:firstStart&&lastEnd&&lastEnd>=firstStart?Math.floor((lastEnd-firstStart)/1000):null
  };
}

export function formatTimelineOffset(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '—';
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),secs=total%60;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

export function youtubeTimelineText(matches=[],sessionStartedAt='',playerName=id=>id){
  const timeline=matchDayTimeline(matches,sessionStartedAt);
  const lines=['00:00:00 準備與熱身'];
  timeline.rows.forEach(({match,position,offsetSeconds})=>{
    const left=(match.teams?.[0]||[]).map(playerName).join('／');
    const right=(match.teams?.[1]||[]).map(playerName).join('／');
    lines.push(`${formatTimelineOffset(offsetSeconds)} Game${position+1} ${left} ${match.scores?.[0]??0}：${match.scores?.[1]??0} ${right}`);
  });
  return lines.join('\n');
}

export function formatDuration(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '—';
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60);
  return hours?`${hours} 小時 ${minutes} 分鐘`:`${minutes} 分鐘`;
}
