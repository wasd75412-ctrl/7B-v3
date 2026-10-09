export const COMEBACK_DEFICIT=5;
export const ROUT_MARGIN=8;
export const CLUTCH_MARGIN=2;
export const PERFECT_DAY_GAMES=3;
export const FEAT_KEYS=['shutouts','routs','clutch','comebacks','days','perfectDays','bestDay'];
const MAX_FEATS=new Set(['bestDay']);

function count(value){
  const number=Math.floor(Number(value));
  return Number.isFinite(number)&&number>0?number:0;
}

export function highestWinStreak(results=[],{best=0,run=0}={}){
  let current=Math.max(0,Number(run)||0);
  let highest=Math.max(current,Number(best)||0);

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

// Largest lead the eventual winner had to overcome, replayed from the rally log.
export function maxDeficit(rallies=[],winner){
  if(winner!==0&&winner!==1)return 0;
  const scores=[0,0];
  let worst=0;
  for(const team of Array.isArray(rallies)?rallies:[]){
    if(team!==0&&team!==1)continue;
    scores[team]++;
    worst=Math.max(worst,scores[1-winner]-scores[winner]);
  }
  return worst;
}

export function emptyFeats(){
  return Object.fromEntries(FEAT_KEYS.map(key=>[key,0]));
}

export function addFeats(...sources){
  const total=emptyFeats();
  for(const source of sources){
    for(const key of FEAT_KEYS){
      const value=count(source?.[key]);
      total[key]=MAX_FEATS.has(key)?Math.max(total[key],value):total[key]+value;
    }
  }
  return total;
}

export function playerFeats(rows=[],id,dayOf=row=>String(row?.dateKey||'')){
  const feats=emptyFeats(),days=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    if(!row||row.testMode)continue;
    const team=[0,1].find(side=>(row.teams?.[side]||[]).includes(id));
    if(team===undefined)continue;
    const won=row.winner===team;
    if(won){
      const own=count(row.scores?.[team]),opponent=count(row.scores?.[1-team]),margin=own-opponent;
      if(own>0&&opponent===0)feats.shutouts++;
      if(margin>=ROUT_MARGIN)feats.routs++;
      if(margin>0&&margin<=CLUTCH_MARGIN)feats.clutch++;
      if(count(row.deficit)>=COMEBACK_DEFICIT)feats.comebacks++;
    }
    const day=String(dayOf(row)||'');
    if(!day)continue;
    const record=days.get(day)||{games:0,wins:0};
    record.games++;
    if(won)record.wins++;
    days.set(day,record);
  }
  for(const {games,wins} of days.values()){
    feats.days++;
    feats.bestDay=Math.max(feats.bestDay,games);
    if(games>=PERFECT_DAY_GAMES&&wins===games)feats.perfectDays++;
  }
  return feats;
}

export function careerAchievementBadges({games=0,wins=0,results=[],settledStreak,singlesWins=0,bestPartnerWins=0,partnerCount=0,bestOpponentGames=0,feats}={}){
  const safeGames=Math.max(0,Number(games)||0);
  const safeWins=Math.min(safeGames,Math.max(0,Number(wins)||0));
  const winRate=safeGames?safeWins/safeGames:0;
  const bestWinStreak=highestWinStreak(results,settledStreak);
  const f=addFeats(feats);

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
    ['🌌','20 連勝',bestWinStreak>=20],
    ['💈','理髮師',f.shutouts>=10,'零封對手 10 場'],
    ['🚜','壓路機',f.routs>=20,`贏 ${ROUT_MARGIN} 分以上 20 場`],
    ['🫀','大心臟',f.clutch>=20,`贏 ${CLUTCH_MARGIN} 分以內 20 場`],
    ['🔄','逆轉王',f.comebacks>=5,`落後 ${COMEBACK_DEFICIT} 分以上逆轉勝 5 場`],
    ['🦸','獨行俠',count(singlesWins)>=25,'單打 25 勝'],
    ['🤝','最佳拍檔',count(bestPartnerWins)>=20,'與同一搭檔贏 20 場'],
    ['🦋','交際花',count(partnerCount)>=10,'與 10 位不同搭檔出賽'],
    ['⚔️','宿敵',count(bestOpponentGames)>=30,'與同一對手交手 30 場'],
    ['🦾','鐵人',f.bestDay>=10,'單日出賽 10 場'],
    ['☀️','完美一日',f.perfectDays>=1,`單日 ${PERFECT_DAY_GAMES} 場以上全勝`],
    ['📅','全勤王',f.days>=30,'出賽 30 天']
  ];
}
