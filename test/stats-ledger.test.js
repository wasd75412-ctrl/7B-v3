import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeStatsLedger, emptyStatsLedger, encodeStatsLedger, isSettledMonth, ledgerHasPlayer, ledgerMonthGames, ledgerMonthRecord, ledgerPlayerRecord, ledgerRelations, ledgerStreak, ledgerTotalGames, newerStatsLedger, settleMatches, unsettledRows } from '../src/stats-ledger.js';
import { highestWinStreak } from '../src/player-achievements.js';
import { deletePlayerFromState } from '../src/player-deletion.js';

const monthOf=row=>String(row.dateKey||'').slice(0,7);
const PLAYERS=['p1','p2','p3','p4','p5','p6'];

function randomHistory(seed=7,size=240){
  let value=seed;
  const next=()=>{value=(value*1103515245+12345)%2147483648;return value/2147483648};
  const rows=[];
  for(let index=0;index<size;index++){
    const month=1+Math.floor(index/40),day=1+index%28;
    const shuffled=PLAYERS.slice().sort(()=>next()-.5),singles=next()<.25;
    rows.push({
      matchId:`m${index}`,
      dateKey:`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
      format:singles?'singles':'doubles',
      teams:singles?[[shuffled[0]],[shuffled[1]]]:[[shuffled[0],shuffled[1]],[shuffled[2],shuffled[3]]],
      scores:[21,15],
      winner:next()<.08?null:next()<.5?0:1
    });
  }
  return rows;
}

function fullStats(rows,id,format='all'){
  let games=0,wins=0;const results=[];
  for(const row of rows){
    if(format!=='all'&&row.format!==format)continue;
    for(let team=0;team<2;team++)if((row.teams[team]||[]).includes(id)){games++;if(row.winner===team)wins++;results.push({won:row.winner===team})}
  }
  return{games,wins,results};
}
function fullRelations(rows,id){
  const partners={},opponents={};
  for(const row of rows){
    const team=row.teams.findIndex(members=>members.includes(id));
    if(team<0)continue;
    const won=row.winner===team;
    for(const pid of row.teams[team])if(pid!==id){const x=(partners[pid]||={games:0,wins:0});x.games++;if(won)x.wins++}
    for(const oid of row.teams[1-team]){const x=(opponents[oid]||={games:0,wins:0});x.games++;if(won)x.wins++}
  }
  return{partners,opponents};
}
function combinedRelations(ledger,rest,id){
  const settled=ledgerRelations(ledger,id),recent=fullRelations(rest,id),merge=(list,extra)=>{
    const out={};
    for(const x of list)out[x.id]={games:x.games,wins:x.wins};
    for(const [pid,x] of Object.entries(extra)){const y=(out[pid]||={games:0,wins:0});y.games+=x.games;y.wins+=x.wins}
    return out;
  };
  return{partners:merge(settled.partners,recent.partners),opponents:merge(settled.opponents,recent.opponents)};
}

test('月結後的生涯、單雙打、搭檔、對手與連勝和完整紀錄計算一致',()=>{
  const rows=randomHistory();
  const ledger=decodeStatsLedger(encodeStatsLedger(settleMatches(emptyStatsLedger(),rows,'2026-04',monthOf,'2026-04-01T00:00:00.000Z')));
  const rest=unsettledRows(rows,ledger,monthOf);
  assert.equal(rest.length,rows.length-120);
  assert.equal(ledgerTotalGames(ledger)+rest.length,rows.length);
  for(const format of['singles','doubles'])assert.equal(ledgerTotalGames(ledger,format)+rest.filter(row=>row.format===format).length,rows.filter(row=>row.format===format).length);
  for(const id of PLAYERS){
    for(const format of['all','singles','doubles']){
      const settled=ledgerPlayerRecord(ledger,id,format),recent=fullStats(rest,id,format),full=fullStats(rows,id,format);
      assert.deepEqual({games:settled.games+recent.games,wins:settled.wins+recent.wins},{games:full.games,wins:full.wins},`${id} ${format}`);
    }
    assert.equal(highestWinStreak(fullStats(rest,id).results,ledgerStreak(ledger,id)),highestWinStreak(fullStats(rows,id).results),`${id} streak`);
    assert.deepEqual(combinedRelations(ledger,rest,id),fullRelations(rows,id),`${id} relations`);
  }
});

test('已結算月份保留每位球員的月戰績與月場次',()=>{
  const rows=randomHistory();
  const ledger=decodeStatsLedger(encodeStatsLedger(settleMatches(emptyStatsLedger(),rows,'2026-04',monthOf)));
  for(const month of['2026-01','2026-02','2026-03']){
    const monthRows=rows.filter(row=>monthOf(row)===month);
    assert.equal(ledgerMonthGames(ledger,month),monthRows.length);
    assert.equal(ledgerMonthGames(ledger,month,'singles'),monthRows.filter(row=>row.format==='singles').length);
    for(const id of PLAYERS){
      const full=fullStats(monthRows,id,'doubles'),settled=ledgerMonthRecord(ledger,month,id,'doubles');
      assert.deepEqual(settled,{games:full.games,wins:full.wins});
    }
  }
  assert.equal(isSettledMonth(ledger,'2026-03'),true);
  assert.equal(isSettledMonth(ledger,'2026-04'),false);
});

test('分次月結與一次月結結果相同，且重複結算同一月份不會重複計入',()=>{
  const rows=randomHistory(11);
  const once=settleMatches(emptyStatsLedger(),rows,'2026-06',monthOf,'x');
  const first=decodeStatsLedger(encodeStatsLedger(settleMatches(emptyStatsLedger(),rows,'2026-03',monthOf,'x')));
  const twice=decodeStatsLedger(encodeStatsLedger(settleMatches(first,rows,'2026-06',monthOf,'x')));
  assert.deepEqual(encodeStatsLedger(twice).players.length,encodeStatsLedger(once).players.length);
  for(const id of PLAYERS){
    assert.deepEqual(ledgerPlayerRecord(twice,id),ledgerPlayerRecord(once,id));
    assert.deepEqual(ledgerStreak(twice,id),ledgerStreak(once,id));
  }
  assert.equal(settleMatches(twice,rows,'2026-06',monthOf),twice);
  assert.equal(settleMatches(twice,rows,'2026-05',monthOf),twice);
  assert.equal(ledgerTotalGames(twice),ledgerTotalGames(once));
});

test('測試比賽不會被結算',()=>{
  const ledger=settleMatches(emptyStatsLedger(),[
    {matchId:'t',dateKey:'2026-01-02',format:'doubles',teams:[['p1','p2'],['p3','p4']],winner:0,testMode:true}
  ],'2026-02',monthOf);
  assert.equal(ledgerTotalGames(ledger),0);
  assert.equal(ledgerHasPlayer(ledger,'p1'),false);
});

test('同步時保留較新的月結資料',()=>{
  const older={...emptyStatsLedger(),cutoff:'2026-03',settledAt:'a'},newer={...emptyStatsLedger(),cutoff:'2026-04',settledAt:'b'};
  assert.equal(newerStatsLedger(older,newer),newer);
  assert.equal(newerStatsLedger(newer,older),newer);
  assert.equal(newerStatsLedger(emptyStatsLedger(),newer),newer);
  assert.deepEqual(decodeStatsLedger(null),emptyStatsLedger());
  assert.equal(encodeStatsLedger(emptyStatsLedger()),null);
});

test('只存在於月結戰績的球員刪除後仍保留名稱',()=>{
  const statsLedger=settleMatches(emptyStatsLedger(),[
    {matchId:'m',dateKey:'2026-01-02',format:'singles',teams:[['p1'],['p2']],winner:0}
  ],'2026-02',monthOf);
  const result=deletePlayerFromState({roster:[{id:'p1',name:'阿明'}],history:[],statsLedger,match:{}},'p1');
  assert.equal(result.deleted,true);
  assert.deepEqual(result.state.retiredPlayers.map(player=>player.name),['阿明']);
});
