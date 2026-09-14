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

test('singles scoreboard keeps names out of the central score area',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.score-view\.singles-match \.score-side\.a \.court-name\{[\s\S]*?justify-self:start/);
  assert.match(css,/\.score-view\.singles-match \.score-side\.b \.court-name\{[\s\S]*?justify-self:end/);
  assert.match(css,/\.score-view\.singles-match \.court-name \.score-player,[\s\S]*?grid-template-columns:1fr;[\s\S]*?overflow:visible/);
  assert.match(css,/\.score-view\.singles-match \.court-player-name,[\s\S]*?max-width:min\(26vw,300px\);[\s\S]*?font-size:clamp\(1\.9rem,4vw,4\.2rem\);[\s\S]*?overflow-wrap:normal/);
});

test('singles server ring and Yoyo descender are not clipped or boxed',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.score-view\.singles-match \.court-name\{[\s\S]*?overflow:visible!important/);
  assert.match(css,/\.score-view\.singles-match \.court-player-name,[\s\S]*?border:0;[\s\S]*?background:none;[\s\S]*?box-shadow:none/);
  assert.match(css,/\.score-view\.singles-match \.court-player-name\.score-name-yoyo,[\s\S]*?padding-bottom:clamp\(18px,2vw,26px\);[\s\S]*?line-height:1\.16;[\s\S]*?overflow:visible/);
});

test('singles scoreboard shows only the actual server without court labels',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/const positionLabel=singles\?'':`<span class="court-position\$\{nameClass\}">\$\{physicalSide\}<\/span>`/);
  assert.match(main,/MATCH_FORMAT_SINGLES\?`\$\{m\.serving===0\?'A隊':'B隊'\} · \$\{pname\(sid\)\} 發球`/);
});
