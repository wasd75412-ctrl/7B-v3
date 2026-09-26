const uniqueIds=values=>[...new Set((Array.isArray(values)?values:[]).map(value=>String(value||'').trim()).filter(Boolean))];

export function playedParticipantIds(matches=[]){
  return uniqueIds((Array.isArray(matches)?matches:[])
    .filter(match=>match&&!match.testMode)
    .flatMap(match=>Array.isArray(match.teams)?match.teams.flat():[]));
}
