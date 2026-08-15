import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('finished matches enqueue compact stats before the full room sync',()=>{
  const priorityFlow=source.slice(source.indexOf('function completedMatchSyncPayload()'),source.indexOf('function saveSoon('));
  const finishFlow=source.slice(source.indexOf('function finishMatch()'),source.indexOf('function updatePriority()'));
  assert.match(priorityFlow,/history:encoded\.history/);
  assert.match(priorityFlow,/match:encoded\.match/);
  assert.match(priorityFlow,/setDoc\(roomRef,completedMatchSyncPayload\(\),\{merge:true\}\)/);
  assert.doesNotMatch(priorityFlow,/roster:encoded\.roster/);
  const priorityIndex=finishFlow.indexOf('saveCompletedMatchStatsNow()');
  const fullSyncIndex=finishFlow.indexOf('saveSoon(420)');
  assert.ok(priorityIndex>=0&&fullSyncIndex>priorityIndex);
});

test('only a newly recorded match starts the priority stats sync',()=>{
  const finishFlow=source.slice(source.indexOf('function finishMatch()'),source.indexOf('function updatePriority()'));
  assert.match(finishFlow,/if\(newlyRecorded&&isHost&&!isTestMatch\)\{[\s\S]*?saveCompletedMatchStatsNow\(\)/);
  assert.match(finishFlow,/else saveSoon\(\)/);
});
