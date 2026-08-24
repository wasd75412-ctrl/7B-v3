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

test('uses a heavy sans-serif face without a black frame and a solid name color for the serving player',()=>{
  assert.match(css,/\.court-player-name\{[\s\S]*?font-family:"PingFang TC","Noto Sans TC","Microsoft JhengHei UI","Microsoft JhengHei",system-ui,sans-serif!important;[\s\S]*?font-weight:900!important;[\s\S]*?font-synthesis:weight;[\s\S]*?-webkit-text-stroke:clamp\(1px,\.12vw,1\.8px\) currentColor;[\s\S]*?text-shadow:none;/);
  assert.match(css,/\.court-name\.server\{[\s\S]*?border:0!important;[\s\S]*?background:transparent!important;[\s\S]*?box-shadow:none!important;/);
  assert.match(css,/\.court-name\.server \.court-player-name\{\s*color:var\(--serve-yellow\)!important;\s*-webkit-text-stroke:clamp\(1px,\.12vw,1\.8px\) var\(--serve-yellow\)!important;\s*background:none!important;\s*text-shadow:none!important;/);
  assert.doesNotMatch(css,/serve-position|serve-indicator-pulse/);
  assert.doesNotMatch(main,/serve-position|🏸 發球 · /);
});

test('enlarges only the current serving player name and restores the normal size when serve changes',()=>{
  assert.match(css,/\.court-player-name\{\s*--score-server-boost:0pt;[\s\S]*?var\(--score-server-boost\)[\s\S]*?transition:font-size \.18s ease,color \.18s ease;/);
  assert.match(css,/\.court-name\.server \.court-player-name\{\s*--score-server-boost:clamp\(8pt,1\.8vw,16pt\);[\s\S]*?width:max-content;[\s\S]*?white-space:nowrap;[\s\S]*?overflow-wrap:normal;/);
  assert.match(css,/\.court-name\.server\{\s*color:#fff!important;\s*overflow:visible!important;/);
  assert.match(main,/const serving=m\.serving===t&&serverIndex===i&&m\.winner===null;/);
  assert.match(main,/class="court-name \$\{serving\?'server':''\}"/);
});

test('keeps the September score at the true scoreboard center',()=>{
  assert.match(css,/data-score-theme="suisei-2023-09"\] \.score-center\{\s*left:50%!important;\s*top:50%!important;\s*transform:translate\(-50%,-50%\) scale\(\.86\)!important;/);
});

test('restores the approved true-center score placement for VSPO SNUT',()=>{
  assert.match(css,/data-score-theme="vspo-snut"\] \.score-center\{\s*left:50%!important;\s*top:50%!important;\s*transform:translate\(-50%,-50%\)!important;/);
});

test('uses the original VSPO SNUT artwork as a large cover crop',()=>{
  assert.match(css,/data-score-theme="vspo-snut"\]\{[^}]*url\('\/assets\/score-backgrounds\/vspo-snut-original\.webp'\)/);
  assert.match(css,/data-score-theme="vspo-snut"\] \.scoreboard\{\s*background-position:center,center 52%!important;\s*background-repeat:no-repeat!important;\s*background-size:100% 100%,cover!important;/);
});

test('fills the September background edge while keeping the character left of the right player card',()=>{
  assert.match(css,/data-score-theme="suisei-2023-09"\] \.scoreboard::before\{[^}]*background-position:center,right center!important;[^}]*background-size:100% 100%,auto 132%!important;/);
  assert.doesNotMatch(css,/data-score-theme="suisei-2023-09"\] \.scoreboard::before\{[^}]*transform:/);
});

test('fills the Pompompurin collection and raises the hug character eyes',()=>{
  assert.match(css,/data-score-theme="pudding-collection"\] \.scoreboard\{[^}]*background-size:100% 100%,110% 100%!important;/);
  assert.match(css,/data-score-theme="pudding-hug"\] \.scoreboard\{[^}]*background-position:center,center bottom!important;[^}]*background-size:100% 100%,auto 138%!important;/);
});
