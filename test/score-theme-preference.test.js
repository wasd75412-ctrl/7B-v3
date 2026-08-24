import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseScoreTheme, linkedScoreThemesForPlayers, scoreThemeCandidates } from '../src/score-theme-preference.js';

const themes=['vspo-hbl','vspo','vspo-snut','happy-panda','blue-stage','the-star','suisei-2023-09','suisei-2024-07','suisei-2026-01','pudding-pattern','pudding-hug','pudding-collection','pudding-puppy','sanrio-party','bow-kitty','three-eyed-pattern','gbc-grass','girls-band','girls-band-fashion','jujutsu'];

test('links each requested player to the requested background series',()=>{
  assert.deepEqual(linkedScoreThemesForPlayers(['建昱']),['vspo-hbl','vspo','vspo-snut','happy-panda']);
  assert.deepEqual(linkedScoreThemesForPlayers(['于萱']),['blue-stage','the-star','suisei-2023-09','suisei-2024-07','suisei-2026-01']);
  assert.deepEqual(linkedScoreThemesForPlayers(['于瑄']),['suisei-2023-09','suisei-2024-07','suisei-2026-01']);
  assert.deepEqual(linkedScoreThemesForPlayers(['宇恬']),['pudding-pattern','pudding-hug','pudding-collection','pudding-puppy']);
  assert.deepEqual(linkedScoreThemesForPlayers(['慧璇']),['sanrio-party','bow-kitty']);
  assert.deepEqual(linkedScoreThemesForPlayers(['禹彤']),['three-eyed-pattern']);
  assert.deepEqual(linkedScoreThemesForPlayers(['于萱Jr.']),['gbc-grass','girls-band','girls-band-fashion']);
  assert.deepEqual(linkedScoreThemesForPlayers(['川景']),['jujutsu']);
});

test('raises linked background frequency for one linked player',()=>{
  const candidates=scoreThemeCandidates({themes,current:'jujutsu',playerNames:['于萱']});
  assert.ok(candidates.filter(theme=>theme==='blue-stage').length>candidates.filter(theme=>theme==='happy-panda').length);
  assert.ok(candidates.filter(theme=>theme==='the-star').length>candidates.filter(theme=>theme==='happy-panda').length);
  assert.ok(candidates.filter(theme=>theme==='suisei-2023-09').length>candidates.filter(theme=>theme==='happy-panda').length);
  assert.ok(candidates.filter(theme=>theme==='suisei-2024-07').length>candidates.filter(theme=>theme==='happy-panda').length);
  assert.ok(candidates.filter(theme=>theme==='suisei-2026-01').length>candidates.filter(theme=>theme==='happy-panda').length);
});

test('uses only linked backgrounds when multiple linked players are on court',()=>{
  const candidates=scoreThemeCandidates({themes,current:'happy-panda',playerNames:['建昱','于萱','未連結球員']});
  assert.deepEqual(new Set(candidates),new Set(['vspo-hbl','vspo','vspo-snut','blue-stage','the-star','suisei-2023-09','suisei-2024-07','suisei-2026-01']));
});

test('chooses from ordinary backgrounds when no linked player is on court',()=>{
  assert.equal(chooseScoreTheme({themes:['happy-panda','jujutsu'],current:'happy-panda',playerNames:['未連結球員']},()=>0),'jujutsu');
});
