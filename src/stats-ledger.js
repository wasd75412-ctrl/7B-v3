const MONTH_PATTERN=/^\d{4}-\d{2}$/;
const PLAYER_STRIDE=7;
const PAIR_STRIDE=4;
const OPPONENT_STRIDE=5;
const MONTH_PLAYER_STRIDE=5;

function count(value){
  const number=Math.floor(Number(value));
  return Number.isFinite(number)&&number>0?number:0;
}
function record(games,wins){
  const total=count(games);
  return [total,Math.min(total,count(wins))];
}
function matchFormat(row){return row?.format==='singles'?'singles':'doubles'}
function emptyPlayer(){return{singles:[0,0],doubles:[0,0],best:0,run:0}}
function emptyMonth(){return{games:{singles:0,doubles:0},players:{}}}
function addPair(map,id,otherId,won){
  const row=(map[id]||={});
  const value=(row[otherId]||=[0,0]);
  value[0]++;
  if(won)value[1]++;
}
function setPair(map,id,otherId,value){(map[id]||={})[otherId]=value}
function readPairs(values,ids,visit){
  const rows=Array.isArray(values)?values:[];
  for(let index=0;index+PAIR_STRIDE<=rows.length;index+=PAIR_STRIDE){
    const a=ids[rows[index]]||'',b=ids[rows[index+1]]||'';
    if(!a||!b||a===b)continue;
    const [games,wins]=record(rows[index+2],rows[index+3]);
    if(games)visit(a,b,games,wins);
  }
}

export function emptyStatsLedger(){
  return{cutoff:'',settledAt:'',games:{singles:0,doubles:0},players:{},partners:{},opponents:{},months:{}};
}

export function decodeStatsLedger(source){
  const ledger=emptyStatsLedger();
  if(!source||typeof source!=='object'||!MONTH_PATTERN.test(source.cutoff||''))return ledger;
  ledger.cutoff=source.cutoff;
  ledger.settledAt=String(source.settledAt||'');
  ledger.games={singles:count(source.games?.[0]),doubles:count(source.games?.[1])};
  const ids=(Array.isArray(source.ids)?source.ids:[]).map(id=>String(id||''));
  const players=Array.isArray(source.players)?source.players:[];
  for(let index=0;index+PLAYER_STRIDE<=players.length;index+=PLAYER_STRIDE){
    const id=ids[players[index]]||'';
    if(!id)continue;
    ledger.players[id]={
      singles:record(players[index+1],players[index+2]),
      doubles:record(players[index+3],players[index+4]),
      best:count(players[index+5]),
      run:count(players[index+6])
    };
  }
  readPairs(source.partners,ids,(a,b,games,wins)=>{
    setPair(ledger.partners,a,b,[games,wins]);
    setPair(ledger.partners,b,a,[games,wins]);
  });
  const opponents=Array.isArray(source.opponents)?source.opponents:[];
  for(let index=0;index+OPPONENT_STRIDE<=opponents.length;index+=OPPONENT_STRIDE){
    const a=ids[opponents[index]]||'',b=ids[opponents[index+1]]||'';
    if(!a||!b||a===b)continue;
    const [games,winsA]=record(opponents[index+2],opponents[index+3]),winsB=Math.min(games-winsA,count(opponents[index+4]));
    if(!games)continue;
    setPair(ledger.opponents,a,b,[games,winsA]);
    setPair(ledger.opponents,b,a,[games,winsB]);
  }
  for(const item of Array.isArray(source.months)?source.months:[]){
    const month=String(item?.month||'');
    if(!MONTH_PATTERN.test(month)||month>=ledger.cutoff)continue;
    const bucket=emptyMonth(),rows=Array.isArray(item.players)?item.players:[];
    bucket.games={singles:count(item.games?.[0]),doubles:count(item.games?.[1])};
    for(let index=0;index+MONTH_PLAYER_STRIDE<=rows.length;index+=MONTH_PLAYER_STRIDE){
      const id=ids[rows[index]]||'';
      if(id)bucket.players[id]={singles:record(rows[index+1],rows[index+2]),doubles:record(rows[index+3],rows[index+4])};
    }
    ledger.months[month]=bucket;
  }
  return ledger;
}

export function encodeStatsLedger(ledger){
  if(!ledger?.cutoff||!MONTH_PATTERN.test(ledger.cutoff))return null;
  const ids=[],indexById=new Map();
  const indexOf=id=>{
    if(!indexById.has(id)){indexById.set(id,ids.length);ids.push(id)}
    return indexById.get(id);
  };
  const players=[];
  for(const [id,value] of Object.entries(ledger.players||{})){
    players.push(indexOf(id),...record(...(value.singles||[])),...record(...(value.doubles||[])),count(value.best),count(value.run));
  }
  // Pairs are stored in both directions in memory; only the lower-index side is written.
  // Opponents keep both sides' wins because a match without a winner is a loss for everyone.
  const pairs=(map,withReverseWins)=>{
    const rows=[];
    for(const [id,others] of Object.entries(map||{})){
      for(const [otherId,value] of Object.entries(others||{})){
        if(id===otherId)continue;
        const a=indexOf(id),b=indexOf(otherId);
        if(a>b)continue;
        const [games,wins]=record(...(value||[]));
        if(!games)continue;
        rows.push(a,b,games,wins);
        if(withReverseWins)rows.push(Math.min(games-wins,count(map[otherId]?.[id]?.[1])));
      }
    }
    return rows;
  };
  const partners=pairs(ledger.partners,false),opponents=pairs(ledger.opponents,true);
  const months=Object.entries(ledger.months||{}).filter(([month])=>MONTH_PATTERN.test(month)).sort(([a],[b])=>a.localeCompare(b)).map(([month,bucket])=>{
    const rows=[];
    for(const [id,value] of Object.entries(bucket?.players||{}))rows.push(indexOf(id),...record(...(value.singles||[])),...record(...(value.doubles||[])));
    return{month,games:[count(bucket?.games?.singles),count(bucket?.games?.doubles)],players:rows};
  });
  return{
    cutoff:ledger.cutoff,
    settledAt:String(ledger.settledAt||''),
    games:[count(ledger.games?.singles),count(ledger.games?.doubles)],
    ids,players,partners,opponents,months
  };
}

export function isSettledMonth(ledger,month){
  return !!ledger?.cutoff&&String(month||'')<ledger.cutoff;
}

export function unsettledRows(rows,ledger,monthOf){
  const list=Array.isArray(rows)?rows:[];
  if(!ledger?.cutoff)return list;
  return list.filter(row=>!isSettledMonth(ledger,monthOf(row)));
}

export function newerStatsLedger(current,incoming){
  const a=current?.cutoff||'',b=incoming?.cutoff||'';
  if(a!==b)return b>a?incoming:current;
  return String(incoming?.settledAt||'')>=String(current?.settledAt||'')?incoming:current;
}

// Rows must be in chronological order so win streaks carry across the cutoff.
export function settleMatches(ledger,rows,cutoff,monthOf,settledAt=new Date().toISOString()){
  const base=ledger?.cutoff?ledger:emptyStatsLedger();
  if(!MONTH_PATTERN.test(cutoff||'')||cutoff<=base.cutoff)return base;
  const next=structuredClone(base);
  for(const row of Array.isArray(rows)?rows:[]){
    if(!row||row.testMode)continue;
    const month=String(monthOf(row)||'');
    if(month<base.cutoff||month>=cutoff)continue;
    const format=matchFormat(row),teams=[0,1].map(team=>(row.teams?.[team]||[]).filter(Boolean));
    const bucket=MONTH_PATTERN.test(month)?(next.months[month]||=emptyMonth()):null;
    next.games[format]++;
    if(bucket)bucket.games[format]++;
    for(let team=0;team<2;team++){
      const won=row.winner===team;
      for(const id of teams[team]){
        const player=(next.players[id]||=emptyPlayer());
        player[format][0]++;
        if(won){player[format][1]++;player.run++;player.best=Math.max(player.best,player.run)}
        else player.run=0;
        if(bucket){
          const monthly=(bucket.players[id]||={singles:[0,0],doubles:[0,0]});
          monthly[format][0]++;
          if(won)monthly[format][1]++;
        }
        for(const partnerId of teams[team])if(partnerId!==id)addPair(next.partners,id,partnerId,won);
        for(const opponentId of teams[1-team])addPair(next.opponents,id,opponentId,won);
      }
    }
  }
  next.cutoff=cutoff;
  next.settledAt=settledAt;
  return next;
}

function formatRecord(value,format){
  if(!value)return{games:0,wins:0};
  if(format==='singles'||format==='doubles')return{games:value[format][0],wins:value[format][1]};
  return{games:value.singles[0]+value.doubles[0],wins:value.singles[1]+value.doubles[1]};
}

export function ledgerPlayerRecord(ledger,id,format='all'){return formatRecord(ledger?.players?.[id],format)}

export function ledgerMonthRecord(ledger,month,id,format='all'){return formatRecord(ledger?.months?.[month]?.players?.[id],format)}

export function ledgerTotalGames(ledger,format='all'){
  const games=ledger?.games||{};
  if(format==='singles'||format==='doubles')return count(games[format]);
  return count(games.singles)+count(games.doubles);
}

export function ledgerMonthGames(ledger,month,format='all'){return ledgerTotalGames(ledger?.months?.[month],format)}

export function ledgerStreak(ledger,id){
  const player=ledger?.players?.[id];
  return{best:count(player?.best),run:count(player?.run)};
}

export function ledgerRelations(ledger,id){
  const read=map=>Object.entries(map?.[id]||{}).map(([otherId,[games,wins]])=>({id:otherId,games,wins}));
  return{partners:read(ledger?.partners),opponents:read(ledger?.opponents)};
}

export function ledgerHasPlayer(ledger,id){return !!ledger?.players?.[id]}
