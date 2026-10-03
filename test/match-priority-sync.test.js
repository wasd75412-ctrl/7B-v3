import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('finished matches sync and back up their own record immediately',()=>{
  const finishFlow=source.slice(source.indexOf('function finishMatch()'),source.indexOf('function updatePriority()'));
  const finishedSyncFlow=source.slice(source.indexOf('async function syncFinishedMatchNow'),source.indexOf('function adoptRestoredState'));
  const sessionFlow=source.slice(source.indexOf('async function endTodaySession'),source.indexOf('function page(')===-1?source.length:source.indexOf('$(\'deletePlayer\')'));
  assert.match(finishFlow,/if\(isHost&&!isTestMatch\)\{bumpLineupRevision\(\);void persistLineupNow\(\)\}\s*if\(isHost\)saveLiveScoreSoon\(\);\s*if\(firstCompletion&&!isTestMatch\)\{archiveUnsyncedHistory\(\);void syncFinishedMatchNow\(m\.matchId\)\}/);
  assert.match(finishedSyncFlow,/await slimRoomHistoryIfNeeded\(\);[\s\S]*?await saveNow\(\);[\s\S]*?archiveUnsyncedHistory\(\);[\s\S]*?await createCloudBackup\('auto',\{id:`auto_\$\{matchId\}`,replace:true,silent:true,system:true\}\)/);
  assert.doesNotMatch(finishFlow,/saveCompletedMatchStatsNow|\bsaveSoon\(/);
  assert.match(source,/function archiveUnsyncedHistory\(\)\{[\s\S]*?!row\.testMode&&!archivedHistory\.some[\s\S]*?void publishMatchArchive\(missing\)/);
  assert.match(source,/unarchiveReopenedMatch\(matchId\);\s*return true;/);
  assert.match(source,/function unarchiveReopenedMatch\(matchId\)\{[\s\S]*?deleteArchivedMatches\(\[matchId\]\)/);
  assert.match(source,/await writeArchivedMatches\(pending\);\s*for\(const row of pending\)\{\s*if\(!state\.history\.some\(item=>item\.matchId===row\.matchId\)\)continue;/);
  assert.match(sessionFlow,/await slimRoomHistoryIfNeeded\(\);[\s\S]*?await saveNow\(\);[\s\S]*?await createCloudBackup\('session'/);
});

test('a scoreboard break can upload completed matches without a backup',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const flow=source.slice(source.indexOf('async function syncCompletedSession'),source.indexOf('async function endTodaySession'));
  assert.match(html,/id="syncSessionScore"[^>]*>同步</);
  assert.match(html,/id="resultSyncSessionBtn"[^>]*>同步</);
  assert.match(flow,/await slimRoomHistoryIfNeeded\(\);[\s\S]*?await saveNow\(\)/);
  assert.match(html,/id="roomSyncSessionBtn" class="btn host-only" type="button">同步<\/button><button id="refreshAppMenu"/);
  assert.match(flow,/\['syncSessionScore','resultSyncSessionBtn','roomSyncSessionBtn'\]/);
  assert.match(source,/\$\('roomSyncSessionBtn'\)\.onclick=\(\)=>syncCompletedSession\(\)/);
  assert.match(styles,/#app \.room-quick-actions \.room-refresh-action\{flex:1 1 auto\}/);
  assert.doesNotMatch(flow,/createCloudBackup/);
  assert.match(styles,/\.score-view\.immersive-mode #syncSessionScore\{[^}]*position:fixed/);
});

test('starting the next match does not upload the room history',()=>{
  const checkpoint=source.slice(source.indexOf('async function saveNewMatchCheckpointNow'),source.indexOf('function checkpointNewMatch'));
  assert.match(checkpoint,/batch\.set\(roomRef,\{court:state\.court/);
  assert.doesNotMatch(checkpoint,/payload\(\)/);
});
