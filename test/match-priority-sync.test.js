import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('finished matches keep stats local until the session ends',()=>{
  const finishFlow=source.slice(source.indexOf('function finishMatch()'),source.indexOf('function updatePriority()'));
  const sessionFlow=source.slice(source.indexOf('async function endTodaySession'),source.indexOf('function page(')===-1?source.length:source.indexOf('$(\'deletePlayer\')'));
  assert.match(finishFlow,/if\(isHost\)saveLiveScoreSoon\(\)/);
  assert.doesNotMatch(finishFlow,/saveCompletedMatchStatsNow|publishMatchArchive|\bsaveSoon\(|createCloudBackup/);
  assert.match(sessionFlow,/await slimRoomHistoryIfNeeded\(\);[\s\S]*?await saveNow\(\);[\s\S]*?await createCloudBackup\('session'/);
});

test('starting the next match does not upload the room history',()=>{
  const checkpoint=source.slice(source.indexOf('async function saveNewMatchCheckpointNow'),source.indexOf('function checkpointNewMatch'));
  assert.match(checkpoint,/batch\.set\(roomRef,\{court:state\.court/);
  assert.doesNotMatch(checkpoint,/payload\(\)/);
});
