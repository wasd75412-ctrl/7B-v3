import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCORE_FONTS,normalizeScoreFont,randomScoreFont} from '../src/score-font.js';

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
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.score-center\{\s*top:50%!important;/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.score-center \.score-divider\{[\s\S]*?position:absolute!important;[\s\S]*?left:50%!important;[\s\S]*?transform:translate\(-50%,-50%\)!important;/);
});
