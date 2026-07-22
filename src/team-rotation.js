function teammatePair(team=[]){
  return [team[0],team[1]].filter(Boolean);
}

export function consecutiveTeammateGames(history=[],playerA,playerB){
  if(!playerA||!playerB||playerA===playerB)return 0;
  let streak=0;
  for(let index=history.length-1;index>=0;index--){
    const teams=Array.isArray(history[index]?.teams)?history[index].teams:[];
    const teamA=teams.findIndex(team=>Array.isArray(team)&&team.includes(playerA));
    const teamB=teams.findIndex(team=>Array.isArray(team)&&team.includes(playerB));
    if(teamA<0||teamB<0)continue;
    if(teamA!==teamB)break;
    streak++;
  }
  return streak;
}

export function lineupExceedsTeammateLimit(lineup=[],history=[],maxConsecutiveGames=2){
  if(lineup.length!==4||new Set(lineup).size!==4)return false;
  return [lineup.slice(0,2),lineup.slice(2,4)].some(team=>{
    const [playerA,playerB]=teammatePair(team);
    return consecutiveTeammateGames(history,playerA,playerB)>=maxConsecutiveGames;
  });
}

function pairingPenalty(lineup,history){
  return [lineup.slice(0,2),lineup.slice(2,4)].reduce((total,team)=>{
    const [playerA,playerB]=teammatePair(team);
    return total+consecutiveTeammateGames(history,playerA,playerB);
  },0);
}

export function arrangeTeamsWithTeammateLimit(players=[],history=[],randomValue=0,maxConsecutiveGames=2){
  const ids=[...new Set(players.filter(Boolean))].slice(0,4);
  if(ids.length!==4)return ids;
  const [a,b,c,d]=ids;
  const pairings=[[a,b,c,d],[a,c,b,d],[a,d,b,c]];
  const safe=pairings.filter(lineup=>!lineupExceedsTeammateLimit(lineup,history,maxConsecutiveGames));
  const pool=safe.length?safe:pairings.slice().sort((left,right)=>pairingPenalty(left,history)-pairingPenalty(right,history));
  const index=Math.abs(Number(randomValue)||0)%pool.length;
  return [...pool[index]];
}
