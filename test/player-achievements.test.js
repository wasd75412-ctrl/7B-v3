import test from 'node:test';
import assert from 'node:assert/strict';

import { highestWinStreak } from '../src/player-achievements.js';

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
