import test from 'node:test';
import assert from 'node:assert/strict';

import { careerAchievementBadges, highestWinStreak } from '../src/player-achievements.js';

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
