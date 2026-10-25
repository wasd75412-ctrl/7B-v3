import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('the score view can be viewed from the opposite sideline on this device only',()=>{
  assert.match(html,/<button id="courtFlipToggle" class="btn host-only" type="button" aria-label="鏡像" title="鏡像" aria-pressed="false">⇄<\/button>/);
  assert.match(main,/const COURT_FLIP_KEY='bcmScoreCourtFlipV1';/);
  assert.match(main,/\$\('courtFlipToggle'\)\.onclick=toggleCourtFlip;/);
  assert.match(main,/\$\('scoreView'\)\.classList\.toggle\('court-flipped',flipped\);/);
  assert.match(main,/const displaySides=singles\?\[0\]:\(t===0\)!==flipped\?\[0,1\]:\[1,0\];/);
});

test('flipping swaps the court but keeps names, avatars and scores readable',()=>{
  assert.match(css,/\.score-view\.court-flipped \.scoreboard\{scale:-1 1\}/);
  assert.match(css,/\.score-view\.court-flipped \.scoreboard :is\(\.score-number,\.score-title,\.avatar,\.court-position,\.court-player-name\)\{scale:-1 1\}/);
});

test('the mirror toggle stays reachable in fullscreen',()=>{
  assert.match(css,/immersive-mode \.score-head \.score-actions>button:not\(#fullscreenScore\):not\(#officialStartScore\):not\(#undo\):not\(#syncSessionScore\):not\(#courtFlipToggle\),/);
  assert.match(css,/\.score-view\.immersive-mode #courtFlipToggle\{[^}]*position:fixed;[^}]*right:calc\(62px/);
  assert.match(css,/\.score-view\.immersive-mode:has\(#officialStartScore:not\(\.hidden\)\) #courtFlipToggle\{right:calc\(116px/);
});

test('remote keys keep scoring the same team when the court is flipped',()=>{
  const remote=main.slice(main.indexOf('function toggleCourtFlip'),main.indexOf('function renderScore'));
  assert.doesNotMatch(remote,/teamAPlus|teamBPlus/);
  assert.doesNotMatch(main,/courtFlipped\(\)\?'teamBPlus'/);
});

