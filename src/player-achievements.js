export function highestWinStreak(results=[]){
  let current=0;
  let highest=0;

  for(const result of results){
    if(result===true||result?.won===true){
      current++;
      highest=Math.max(highest,current);
    }else{
      current=0;
    }
  }

  return highest;
}

export function careerAchievementBadges({games=0,wins=0,results=[]}={}){
  const safeGames=Math.max(0,Number(games)||0);
  const safeWins=Math.min(safeGames,Math.max(0,Number(wins)||0));
  const winRate=safeGames?safeWins/safeGames:0;
  const bestWinStreak=highestWinStreak(results);

  return [
    ['🏸','初登場',safeGames>=1],
    ['🥉','10 場',safeGames>=10],
    ['🪶','25 場',safeGames>=25],
    ['🥈','50 場',safeGames>=50],
    ['🎖️','75 場',safeGames>=75],
    ['🥇','100 場',safeGames>=100],
    ['🏟️','200 場',safeGames>=200],
    ['🏆','10 勝',safeWins>=10],
    ['🛡️','25 勝',safeWins>=25],
    ['💯','50 勝',safeWins>=50],
    ['🚀','75 勝',safeWins>=75],
    ['👑','100 勝',safeWins>=100],
    ['🌠','200 勝',safeWins>=200],
    ['🎯','勝率 50%',safeGames>=20&&winRate>=.5],
    ['💎','勝率 60%',safeGames>=30&&winRate>=.6],
    ['🦅','勝率 70%',safeGames>=50&&winRate>=.7],
    ['🔥','3 連勝',bestWinStreak>=3],
    ['⚡','5 連勝',bestWinStreak>=5],
    ['🌟','10 連勝',bestWinStreak>=10],
    ['🚄','15 連勝',bestWinStreak>=15],
    ['🌌','20 連勝',bestWinStreak>=20]
  ];
}
