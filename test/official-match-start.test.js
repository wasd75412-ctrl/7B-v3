import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const activity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const service=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');

test('new score screens wait for the explicit official start timestamp',()=>{
  const startMatch=main.match(/function startMatch\(\)\{[\s\S]*?\nfunction finishMatch/)?.[0]||'';
  const startNext=main.match(/function startNext\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(startMatch,/startedAt:''/);
  assert.doesNotMatch(startMatch,/startedAt:new Date/);
  assert.match(startNext,/startedAt:''/);
  assert.doesNotMatch(startNext,/startedAt:new Date/);
  assert.match(main,/function markMatchOfficialStarted\(requestedAt\)[\s\S]*?requestedMillis=timestampMillis\(requestedAt\)[\s\S]*?Math\.min\(requestedMillis,now\)[\s\S]*?saveLiveScoreSoon\(\);saveSoon\(\)/);
});

test('web keyboard double press still starts the match while YUNTENG uses direct keys',()=>{
  assert.match(main,/requestedAt=scoreRemotePendingPress\.requestedAt[\s\S]*?scoreRemotePendingPress=null;markMatchOfficialStarted\(requestedAt\);return/);
  assert.match(main,/scoreRemotePendingPress=\{code,action,at:now,requestedAt:new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(main,/scoreRemotePendingPress=null;toggleScoreFullscreen\(\)/);
  for(const source of [activity,service])assert.doesNotMatch(source,/pendingShortPressCount|SHUTTLE_SEQUENCE_MS/);
  assert.match(controller,/updates\.put\("officialStartCommand", command\)/);
  assert.doesNotMatch(controller,/updates\.put\(finished \? "undoFinishedCommand" : "fullscreenCommand"/);
});

test('YUNTENG score keys require a same-key double press only before official start',()=>{
  assert.match(main,/function handleAndroidOfficialStartPress\(action,command\)[\s\S]*?matchHasOfficiallyStarted\(state\.match\)[\s\S]*?androidOfficialStartPending\.action===action[\s\S]*?SCORE_REMOTE_DOUBLE_PRESS_MS[\s\S]*?markMatchOfficialStarted\(command\?\.createdAt/);
  assert.match(main,/handleAndroidOfficialStartPress\(action,command\)\)return true;[\s\S]*?performScoreRemoteAction\(action\)/);
  assert.match(main,/androidOfficialStartPending=\{action,matchId,at:now\}[\s\S]*?再按一次正式開始/);
});

test('official start is idempotent and scoring waits for it',()=>{
  assert.match(main,/if\(matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('本場已正式開始'/);
  assert.match(main,/if\(!matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('請先按播放鍵正式開始'/);
  assert.match(main,/function handleRemoteOfficialStartCommand[\s\S]*?markMatchOfficialStarted\(data\.officialStartCommand\.createdAt\)/);
  assert.match(main,/function handleRemoteFullscreenCommand[\s\S]*?markMatchOfficialStarted\(data\.fullscreenCommand\.createdAt\)/);
});

test('score mode provides a play fallback for official start in both layouts',()=>{
  assert.match(index,/id="officialStartScore"[^>]*>▶️/);
  assert.match(main,/officialStartScoreBtn\.onclick=\(\)=>markMatchOfficialStarted\(\)/);
  assert.match(main,/officialStartButton\.classList\.toggle\('hidden',!canStart\)/);
  assert.match(styles,/\.score-view\.immersive-mode \.score-head \.score-actions>button:not\(#fullscreenScore\):not\(#officialStartScore\):not\(#undo\)/);
  assert.match(styles,/\.score-view\.immersive-mode #officialStartScore:not\(\.hidden\)\{[^}]*position:fixed;[^}]*right:calc\(62px/);
});

test('touchscreen scoring cannot bypass the official start timestamp',()=>{
  assert.match(main,/function guardUnofficialTouchScoring\(event\)[\s\S]*?matchHasOfficiallyStarted\(state\.match\)[\s\S]*?scoreSideA\.contains\(target\)[\s\S]*?\$\('scoreA'\)\.contains\(target\)[\s\S]*?\$\('scoreB'\)\.contains\(target\)[\s\S]*?event\.stopImmediatePropagation\(\)[\s\S]*?請先按播放鍵正式開始/);
  assert.match(main,/document\.addEventListener\('click',guardUnofficialTouchScoring,\{capture:true\}\)/);
});

test('official start indicator is emphasized and centered for everyone to see',()=>{
  assert.match(main,/showScoreRemoteIndicator\('比賽正式開始',\{duration:2600,icon:'✅',emphasis:'official'\}\)/);
  assert.match(styles,/\.score-remote-indicator\.official-start\{[^}]*top:50%;[^}]*left:50%;[^}]*transform:translate\(-50%,-50%\);[^}]*font-size:clamp\(2rem,7vw,5rem\)/);
});
