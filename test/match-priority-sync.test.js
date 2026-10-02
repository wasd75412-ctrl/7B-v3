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

test('a scoreboard break can upload completed matches without a backup',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const flow=source.slice(source.indexOf('async function syncCompletedSession'),source.indexOf('async function endTodaySession'));
  assert.match(html,/id="syncSessionScore"[^>]*>同步</);
  assert.match(html,/id="resultSyncSessionBtn"[^>]*>同步</);
  assert.match(flow,/await slimRoomHistoryIfNeeded\(\);[\s\S]*?await saveNow\(\)/);
  assert.doesNotMatch(flow,/createCloudBackup/);
  assert.match(styles,/\.score-view\.immersive-mode #syncSessionScore\{[^}]*position:fixed/);
});

test('starting the next match does not upload the room history',()=>{
  const checkpoint=source.slice(source.indexOf('async function saveNewMatchCheckpointNow'),source.indexOf('function checkpointNewMatch'));
  assert.match(checkpoint,/batch\.set\(roomRef,\{court:state\.court/);
  assert.doesNotMatch(checkpoint,/payload\(\)/);
});
