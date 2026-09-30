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

test('web score keys need a double press to start and never score while starting',()=>{
  const handler=main.match(/function handleScoreRemoteCode\(event,code\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(main,/SCORE_REMOTE_DOUBLE_PRESS_MS=800/);
  assert.match(handler,/!matchHasOfficiallyStarted\(state\.match\)\)\{\s*if\(scoreRemoteStartPressAt&&now-scoreRemoteStartPressAt<=SCORE_REMOTE_DOUBLE_PRESS_MS\)\{scoreRemoteStartPressAt=0;markMatchOfficialStarted\(new Date\(\)\.toISOString\(\)\);return\}\s*scoreRemoteStartPressAt=now;showScoreRemoteIndicator\('再按一下正式開始'[^;]*;return;/);
  assert.match(handler,/scoreRemoteStartPressAt=0;\s*if\(performScoreRemoteAction\(action\)\)/);
  assert.doesNotMatch(main,/scoreRemotePendingPress|runPendingScoreRemoteAction/);
  for(const source of [activity,service])assert.doesNotMatch(source,/pendingShortPressCount|SHUTTLE_SEQUENCE_MS/);
  assert.match(controller,/updates\.put\("officialStartCommand", command\)/);
  assert.doesNotMatch(controller,/updates\.put\(finished \? "undoFinishedCommand" : "fullscreenCommand"/);
});

test('remote score commands before the official start only show the double-press hint',()=>{
  const preStart=main.match(/function handleAndroidPreStartPress\(action,command\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(preStart,/matchHasOfficiallyStarted\(state\.match\)\)return false/);
  assert.match(preStart,/if\(command\?\.doublePress===true\)\{androidOfficialStartPending=null;markMatchOfficialStarted\(command\.clientCreatedAt\|\|command\.createdAt/);
  assert.match(preStart,/showScoreRemoteIndicator\('按兩下＋／－正式開始'/);
  assert.match(main,/handleAndroidPreStartPress\(action,command\)\)return true;[\s\S]*?performScoreRemoteAction\(action\)/);
  assert.doesNotMatch(main,/handleAndroidOfficialStartPress/);
  const court=main.match(/if\(courtVisible&&\['teamAPlus','teamBPlus'\]\.includes\(action\)\)\{[\s\S]*?return true;/)?.[0]||'';
  assert.doesNotMatch(court,/markMatchOfficialStarted|PreStartPress/);
  assert.match(main,/function handleRemoteOfficialStartCommand[\s\S]*?const started=markMatchOfficialStarted[\s\S]*?if\(started&&\$\('scoreView'\)\.classList\.contains\('hidden'\)&&\$\('resultModal'\)\.classList\.contains\('hidden'\)\)\{scoreViewRequested=true;renderScore\(\)\}/);
});

test('Android gates the official start with a double press before sending anything',()=>{
  const gate=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/OfficialStartGate.java',import.meta.url),'utf8');
  assert.match(gate,/DOUBLE_PRESS_MS = 800L/);
  assert.match(controller,/officialStartGate\.onScorePress\(\s*awaitingOfficialStart\(\), SystemClock\.uptimeMillis\(\)\)/);
  assert.match(controller,/WAIT_FOR_SECOND_PRESS\) \{\s*if \(callback != null\) callback\.onComplete\(true, "再按一下正式開始", action\);\s*return;/);
  assert.match(controller,/OFFICIAL_START\) \{[\s\S]*?startOfficialMatch\(/);
  assert.doesNotMatch(controller,/doublePress|OFFICIAL_START_DOUBLE_PRESS_MS/);
  assert.match(activity,/TEAM_A_PLUS \|\| action == VolumeKeyInterpreter\.Action\.TEAM_B_PLUS\) \{\s*sendYuntengScoreAction\(action\);\s*return;/);
});

test('a quick second YUNTENG press flushes the first instead of being dropped',()=>{
  const loop=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
  const interpreter=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/YuntengGestureInterpreter.java',import.meta.url),'utf8');
  assert.match(interpreter,/takePendingPressBeforeNewPress\(MotionEvent event\) \{[\s\S]*?ACTION_POINTER_DOWN[\s\S]*?isNewPress\(lastPointerDownAt, event\.getEventTime\(\)\)[\s\S]*?return onSettledPress\(\);/);
  assert.match(activity,/takePendingPressBeforeNewPress\(event\);[\s\S]*?cancelYuntengPressTimers\(\);\s*deliverYuntengPress\(previousPress\);[\s\S]*?yuntengGestures\.onTouchEvent\(event\)/);
  assert.match(loop,/takePendingPressBeforeNewPress\(event\);[\s\S]*?cancelYuntengPressTimers\(\);\s*sendYuntengScore\(previousPress\);[\s\S]*?yuntengGestures\.onTouchEvent\(event\)/);
});

test('Android keeps a live match listener so the first remote press is ready',()=>{
  const loop=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
  assert.match(controller,/matchListener = liveScoreReference\(session\)\.addSnapshotListener/);
  assert.match(controller,/void warmUp\(WarmUpCallback callback\) \{[\s\S]*?ensureMatchListener\(session\);/);
  assert.match(controller,/synchronized void release\(\) \{\s*if \(matchListener != null\) matchListener\.remove\(\)/);
  assert.match(activity,/backgroundScoreController\.release\(\)/);
  assert.match(service,/scoreController\.release\(\)/);
  assert.match(loop,/remoteScoreController\.release\(\)/);
});

test('Android queues rapid score commands long enough for the iPad listener to observe both',()=>{
  assert.match(controller,/COMMAND_DELIVERY_GAP_MS = 250L/);
  assert.match(controller,/commandHandler\.postDelayed\(this::processNext, COMMAND_DELIVERY_GAP_MS\)/);
  assert.match(controller,/command\.put\("clientCreatedAt", request\.clientCreatedAt\)/);
});

test('official start is idempotent and scoring waits for it',()=>{
  assert.match(main,/if\(matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('本場已正式開始'/);
  assert.match(main,/if\(!matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('請先按播放鍵正式開始'/);
  assert.match(controller,/void startOfficialMatch[\s\S]*?long clientCreatedAt = System\.currentTimeMillis\(\)[\s\S]*?command\.put\("clientCreatedAt", clientCreatedAt\)/);
  assert.match(main,/function handleRemoteOfficialStartCommand[\s\S]*?markMatchOfficialStarted\(data\.officialStartCommand\.clientCreatedAt\|\|data\.officialStartCommand\.createdAt\)/);
  assert.match(main,/function handleRemoteFullscreenCommand[\s\S]*?markMatchOfficialStarted\(data\.fullscreenCommand\.clientCreatedAt\|\|data\.fullscreenCommand\.createdAt\)/);
});

test('official start discards score presses for three seconds',()=>{
  assert.match(main,/OFFICIAL_START_SCORE_LOCK_MS=3000/);
  assert.match(main,/officialStartScoreUnlockAt=now\+OFFICIAL_START_SCORE_LOCK_MS/);
  assert.match(main,/Date\.now\(\)<officialStartScoreUnlockAt[\s\S]*?正式開始保護中[\s\S]*?return false/);
  assert.match(main,/showScoreRemoteIndicator\('比賽正式開始',\{duration:500/);
});

test('camera recording start automatically becomes the millisecond timeline baseline',()=>{
  assert.match(controller,/void markBroadcastRecordingStarted\(long clientStartedAt[\s\S]*?command\.put\("clientCreatedAt", clientStartedAt\)[\s\S]*?updates\.put\("recordingStartCommand", command\)/);
  assert.match(main,/function handleRemoteRecordingStartCommand[\s\S]*?timestampMillis\(command\.clientCreatedAt\)\|\|timestampMillis\(command\.createdAt\)[\s\S]*?matchTimelineStarts=.*startedAt\.toISOString\(\)/);
  assert.match(main,/handleRemoteRecordingStartCommand[\s\S]*?shouldAcceptRemoteCommand\(\{command,currentMatch:\{\},initial:false\}\)/);
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
  assert.match(main,/showScoreRemoteIndicator\('比賽正式開始',\{duration:500,icon:'✅',emphasis:'official'\}\)/);
  assert.match(styles,/\.score-remote-indicator\.official-start\{[^}]*top:50%;[^}]*left:50%;[^}]*transform:translate\(-50%,-50%\);[^}]*font-size:clamp\(2rem,7vw,5rem\)/);
});
