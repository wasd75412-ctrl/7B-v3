import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCORE_FONTS,normalizeScoreFont,randomScoreFont} from '../src/score-font.js';

const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('normalizes unknown score fonts to a bundled font',()=>{
  assert.equal(normalizeScoreFont('unknown'),SCORE_FONTS[0]);
  assert.equal(normalizeScoreFont('monoton'),SCORE_FONTS[0]);
  assert.equal(SCORE_FONTS.includes('monoton'),false);
  assert.equal(normalizeScoreFont('press-start-2p'),SCORE_FONTS[0]);
  assert.equal(SCORE_FONTS.includes('press-start-2p'),false);
  assert.equal(normalizeScoreFont('orbitron'),'orbitron');
});

test('selects a bundled font and avoids repeating the current match font',()=>{
  for(const value of [0,.25,.5,.75,.999999]){
    const selected=randomScoreFont('bungee',value);
    assert.ok(SCORE_FONTS.includes(selected));
    assert.notEqual(selected,'bungee');
  }
});

test('keeps the score separator centered outside the number layout flow',()=>{
  assert.match(css,/\.score-center\{\s*top:50%!important;/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.score-center \.score-number\.two-digit\{[\s\S]*?font-size:clamp\(9\.5rem,min\(28vw,33vh\),19rem\)!important;/);
  assert.match(css,/#scoreA\.two-digit\{padding-right:[^}]+!important\}/);
  assert.match(css,/#scoreB\.two-digit\{padding-left:[^}]+!important\}/);
  assert.match(css,/\.score-center \.score-divider\{[\s\S]*?position:absolute!important;[\s\S]*?left:50%!important;[\s\S]*?transform:translate\(-50%,-50%\)!important;/);
});

test('keeps artwork visible behind score digits without a dark panel',()=>{
  assert.match(css,/\.score-center \.score-number\{[\s\S]*?background:transparent!important;[\s\S]*?box-shadow:none!important;[\s\S]*?backdrop-filter:none!important;/);
});

test('uses bold names and only a solid name color to identify the serving player',()=>{
  assert.match(css,/\.court-player-name\{[\s\S]*?font-weight:1000!important;[\s\S]*?font-synthesis:weight;/);
  assert.match(css,/\.court-name\.server\{[\s\S]*?border:0!important;[\s\S]*?background:transparent!important;[\s\S]*?box-shadow:none!important;/);
  assert.match(css,/\.court-name\.server \.court-player-name\{\s*color:var\(--serve-yellow\)!important;\s*-webkit-text-stroke:0!important;\s*background:none!important;/);
  assert.doesNotMatch(css,/serve-position|serve-indicator-pulse/);
  assert.doesNotMatch(main,/serve-position|🏸 發球 · /);
});

test('keeps the September character face above a lowered compact score',()=>{
  assert.match(css,/data-score-theme="suisei-2023-09"\] \.score-center\{\s*top:61%!important;\s*transform:translate\(-50%,-50%\) scale\(\.86\)!important;/);
});

test('restores the approved true-center score placement for VSPO SNUT',()=>{
  assert.match(css,/data-score-theme="vspo-snut"\] \.score-center\{\s*left:50%!important;\s*top:50%!important;\s*transform:translate\(-50%,-50%\)!important;/);
});

test('fills the September background edge while keeping the character left of the right player card',()=>{
  assert.match(css,/data-score-theme="suisei-2023-09"\] \.scoreboard::before\{[^}]*background-position:center,right center!important;[^}]*background-size:100% 100%,auto 132%!important;/);
  assert.doesNotMatch(css,/data-score-theme="suisei-2023-09"\] \.scoreboard::before\{[^}]*transform:/);
});

test('fills the Pompompurin collection and raises the hug character eyes',()=>{
  assert.match(css,/data-score-theme="pudding-collection"\] \.scoreboard\{[^}]*background-size:100% 100%,110% 100%!important;/);
  assert.match(css,/data-score-theme="pudding-hug"\] \.scoreboard\{[^}]*background-position:center,center bottom!important;[^}]*background-size:100% 100%,auto 138%!important;/);
});
