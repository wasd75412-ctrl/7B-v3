import test from 'node:test';
import assert from 'node:assert/strict';
import {SCORE_FONTS,normalizeScoreFont,randomScoreFont} from '../src/score-font.js';

test('normalizes unknown score fonts to a bundled font',()=>{
  assert.equal(normalizeScoreFont('unknown'),SCORE_FONTS[0]);
  assert.equal(normalizeScoreFont('orbitron'),'orbitron');
});

test('selects a bundled font and avoids repeating the current match font',()=>{
  for(const value of [0,.25,.5,.75,.999999]){
    const selected=randomScoreFont('bungee',value);
    assert.ok(SCORE_FONTS.includes(selected));
    assert.notEqual(selected,'bungee');
  }
});
