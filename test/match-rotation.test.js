import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rotateAfterMatch } from '../src/match-rotation.js';

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('always promotes the first waiting players before adding losers',()=>{
  const result=rotateAfterMatch({
    winners:['p1','p2'],losers:['p3','p4'],waitingQueue:['p5','p6','p7'],
    attendance:['p1','p2','p3','p4','p5','p6','p7']
  });
  assert.deepEqual(result.chosen,['p5','p6']);
  assert.deepEqual(result.waitingQueue,['p7','p3','p4']);
  assert.equal(result.priority,'p7');
});

test('with five players a loser may stay once but cannot stay twice in a row',()=>{
  const first=rotateAfterMatch({
    winners:['p1','p2'],losers:['p3','p4'],waitingQueue:['p5'],
    attendance:['p1','p2','p3','p4','p5'],randomValue:0
  });
  assert.deepEqual(first.chosen,['p5','p3']);
  assert.equal(first.lastLoserReplayPlayerId,'p3');

  const second=rotateAfterMatch({
    winners:['p1','p2'],losers:['p3','p5'],waitingQueue:['p4'],
    attendance:['p1','p2','p3','p4','p5'],lastLoserReplayPlayerId:first.lastLoserReplayPlayerId,randomValue:0
  });
  assert.deepEqual(second.chosen,['p4','p5']);
  assert.deepEqual(second.waitingQueue,['p3']);
  assert.equal(second.lastLoserReplayPlayerId,'p5');
});

test('a player can be selected again after sitting out once',()=>{
  const result=rotateAfterMatch({
    winners:['p1','p2'],losers:['p3','p4'],waitingQueue:['p5'],
    attendance:['p1','p2','p3','p4','p5'],lastLoserReplayPlayerId:'p5',randomValue:0
  });
  assert.deepEqual(result.chosen,['p5','p3']);
  assert.equal(result.lastLoserReplayPlayerId,'p3');
});

test('finished-match rendering keeps the next-call lineup out of the waiting queue',()=>{
  const renderWaiting=mainSource.slice(mainSource.indexOf('function renderWaiting()'),mainSource.indexOf('function winFor'));
  assert.match(renderWaiting,/state\.nextCall\?\.players/);
  assert.match(renderWaiting,/state\.waitingQueue=ordered/);
});
