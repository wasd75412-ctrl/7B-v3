import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchPlayerCount,normalizeMatchFormat,rotateSinglesAfterMatch,teamsForLineup} from '../src/match-format.js';

test('legacy and unknown formats remain doubles',()=>{
  assert.equal(normalizeMatchFormat(), 'doubles');
  assert.equal(normalizeMatchFormat('other'), 'doubles');
  assert.equal(matchPlayerCount('doubles'),4);
});

test('singles lineups contain one player on each side',()=>{
  assert.equal(matchPlayerCount('singles'),2);
  assert.deepEqual(teamsForLineup(['a','b'],'singles'),[['a'],['b']]);
  assert.deepEqual(teamsForLineup(['a','b','c','d'],'doubles'),[['a','b'],['c','d']]);
});

test('singles winner stays and first waiting player challenges',()=>{
  assert.deepEqual(rotateSinglesAfterMatch({winner:'a',loser:'b',waitingQueue:['c','d'],attendance:['a','b','c','d']}),{
    players:['a','c'],waitingQueue:['d','b'],priority:'d'
  });
});

test('singles rematches when nobody is waiting',()=>{
  assert.deepEqual(rotateSinglesAfterMatch({winner:'a',loser:'b',attendance:['a','b']}),{
    players:['a','b'],waitingQueue:[],priority:null
  });
});

test('court, score, history, and stats expose singles mode',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(html,/id="formatSingles"[^>]*>單打</);
  assert.match(html,/id="statsFormat"[\s\S]*?value="singles">單打</);
  assert.match(main,/rotateSinglesAfterMatch/);
  assert.match(main,/format,teams:structuredClone\(m\.players\)/);
  assert.match(main,/\$\('scoreView'\)\.classList\.toggle\('singles-match'/);
});
