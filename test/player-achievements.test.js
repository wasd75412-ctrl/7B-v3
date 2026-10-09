import test from 'node:test';
import assert from 'node:assert/strict';

import { addFeats, careerAchievementBadges, highestWinStreak, maxDeficit, playerFeats } from '../src/player-achievements.js';

const earnedMap=input=>new Map(careerAchievementBadges(input).map(([,label,on])=>[label,on]));
const match=(dateKey,scores,winner,extra={})=>({dateKey,teams:[['me','ally'],['x','y']],scores,winner,...extra});

test('連勝在之後輸球後仍保留生涯最高紀錄',()=>{
  assert.equal(highestWinStreak([
    {won:true},{won:true},{won:true},{won:true},{won:true},{won:false}
  ]),5);
});

test('不同連勝區段取最高值',()=>{
  assert.equal(highestWinStreak([
    {won:true},{won:true},{won:false},
    {won:true},{won:true},{won:true},{won:false},
    {won:true}
  ]),3);
});

test('支援布林結果且無勝場時回傳零',()=>{
  assert.equal(highestWinStreak([false,false]),0);
  assert.equal(highestWinStreak([true,true,false,true]),2);
  assert.equal(highestWinStreak(),0);
});

test('新增出賽與勝場里程碑徽章',()=>{
  const badges=careerAchievementBadges({games:75,wins:25});
  const earned=new Map(badges.map(([,label,on])=>[label,on]));
  assert.equal(earned.get('25 場'),true);
  assert.equal(earned.get('75 場'),true);
  assert.equal(earned.get('100 場'),false);
  assert.equal(earned.get('25 勝'),true);
  assert.equal(earned.get('50 勝'),false);
});

test('勝率徽章需要足夠場次且使用實際勝率',()=>{
  const tooFew=new Map(careerAchievementBadges({games:19,wins:19}).map(([,label,on])=>[label,on]));
  const sixtyPercent=new Map(careerAchievementBadges({games:30,wins:18}).map(([,label,on])=>[label,on]));
  const roundedOnly=new Map(careerAchievementBadges({games:32,wins:19}).map(([,label,on])=>[label,on]));
  assert.equal(tooFew.get('勝率 50%'),false);
  assert.equal(sixtyPercent.get('勝率 50%'),true);
  assert.equal(sixtyPercent.get('勝率 60%'),true);
  assert.equal(roundedOnly.get('勝率 60%'),false);
});

test('新增十五與二十連勝長期目標',()=>{
  const results=Array.from({length:15},()=>({won:true}));
  const earned=new Map(careerAchievementBadges({games:15,wins:15,results}).map(([,label,on])=>[label,on]));
  assert.equal(earned.get('10 連勝'),true);
  assert.equal(earned.get('15 連勝'),true);
  assert.equal(earned.get('20 連勝'),false);
});

test('理髮師需要累計零封對手十場',()=>{
  const rows=Array.from({length:10},(_,index)=>match(`2026-01-${String(index+1).padStart(2,'0')}`,[11,0],0));
  assert.equal(playerFeats(rows,'me').shutouts,10);
  assert.equal(playerFeats(rows,'x').shutouts,0);
  assert.equal(earnedMap({feats:playerFeats(rows.slice(1),'me')}).get('理髮師'),false);
  assert.equal(earnedMap({feats:playerFeats(rows,'me')}).get('理髮師'),true);
});

test('比分類成就依勝方分差計算，輸球與測試比賽不計',()=>{
  const feats=playerFeats([
    match('2026-01-01',[11,3],0),
    match('2026-01-01',[12,10],0),
    match('2026-01-01',[15,14],0),
    match('2026-01-01',[11,9],1),
    match('2026-01-01',[11,0],0,{testMode:true}),
    match('2026-01-01',[11,7],0,{deficit:5})
  ],'me');
  assert.equal(feats.routs,1);
  assert.equal(feats.clutch,2);
  assert.equal(feats.comebacks,1);
  assert.equal(feats.shutouts,0);
});

test('最大落後分數由逐分紀錄重算',()=>{
  assert.equal(maxDeficit([1,1,1,1,1,0,0,0,0,0,0],0),5);
  assert.equal(maxDeficit([0,0,1],0),0);
  assert.equal(maxDeficit([1,1],null),0);
});

test('單日成就計算出賽天數、單日最多場次與全勝日',()=>{
  const rows=[
    match('2026-01-01',[11,5],0),match('2026-01-01',[11,5],0),match('2026-01-01',[11,5],0),
    match('2026-01-02',[11,5],0),match('2026-01-02',[5,11],1),match('2026-01-02',[11,5],0),match('2026-01-02',[11,5],0)
  ];
  const feats=playerFeats(rows,'me');
  assert.deepEqual({days:feats.days,bestDay:feats.bestDay,perfectDays:feats.perfectDays},{days:2,bestDay:4,perfectDays:1});
  assert.equal(addFeats({bestDay:4,days:2},{bestDay:3,days:1}).bestDay,4);
  assert.equal(addFeats({bestDay:4,days:2},{bestDay:3,days:1}).days,3);
});

test('搭檔、對手與單打成就使用門檻',()=>{
  const below=earnedMap({singlesWins:24,bestPartnerWins:19,partnerCount:9,bestOpponentGames:29});
  const reached=earnedMap({singlesWins:25,bestPartnerWins:20,partnerCount:10,bestOpponentGames:30});
  for(const label of['獨行俠','最佳拍檔','交際花','宿敵']){
    assert.equal(below.get(label),false,label);
    assert.equal(reached.get(label),true,label);
  }
});

test('新成就附帶達成條件說明',()=>{
  const badge=careerAchievementBadges().find(([,label])=>label==='理髮師');
  assert.equal(badge[3],'零封對手 10 場');
});
