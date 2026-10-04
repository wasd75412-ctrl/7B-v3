import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const activity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const service=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');

test('P4 key 5 starts the match on both of its alternating volume keys',()=>{
  const p4=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/P4GestureInterpreter.java',import.meta.url),'utf8');
  const startKey=p4.match(/static boolean isOfficialStartKey[\s\S]*?\n    }/)?.[0]||'';
  assert.match(startKey,/KEYCODE_VOLUME_DOWN/);
  assert.match(startKey,/KEYCODE_VOLUME_UP/);
});

test('new score screens wait for the explicit official start timestamp',()=>{
  const startMatch=main.match(/function startMatch\(\)\{[\s\S]*?\nfunction finishMatch/)?.[0]||'';
  const startNext=main.match(/function startNext\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(startMatch,/startedAt:''/);
  assert.doesNotMatch(startMatch,/startedAt:new Date/);
  assert.match(startNext,/startedAt:''/);
  assert.doesNotMatch(startNext,/startedAt:new Date/);
  assert.match(main,/function markMatchOfficialStarted\(requestedAt\)[\s\S]*?requestedMillis=timestampMillis\(requestedAt\)[\s\S]*?Math\.min\(requestedMillis,now\)[\s\S]*?saveLiveScoreSoon\(\);renderDashboard\(\)/);
  assert.match(main,/keepOfficialStart\(beforeMatch,decodeLiveMatch\(data,beforeMatch\)\)/);
  assert.match(main,/if\(checkpointMissedOfficialStart\(checkpoint\.liveScore\.match,state\.match\)\)await persistLiveScoreState\(\)/);
});

test('web score keys need a double press to start and never score while starting',()=>{
  const handler=main.match(/function handleScoreRemoteCode\(event,code\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(main,/SCORE_REMOTE_DOUBLE_PRESS_MS=500/);
  assert.doesNotMatch(main,/SCORE_REMOTE_DOUBLE_PRESS_MIN_MS/);
  assert.match(handler,/awaitingOfficialStart[\s\S]*?if\(scoreRemoteStartPressAt&&now-scoreRemoteStartPressAt<=SCORE_REMOTE_DOUBLE_PRESS_MS\)\{scoreRemoteStartPressAt=0;markMatchOfficialStarted\(new Date\(\)\.toISOString\(\)\);return\}\s*scoreRemoteStartPressAt=now;showScoreRemoteIndicator\('再按一下正式開始'/);
  assert.match(handler,/scoreRemoteStartPressAt=0;\s*if\(performScoreRemoteAction\(action\)\)/);
  assert.doesNotMatch(main,/scoreRemotePendingPress|runPendingScoreRemoteAction/);
  for(const source of [activity,service])assert.doesNotMatch(source,/pendingShortPressCount|SHUTTLE_SEQUENCE_MS/);
  assert.match(controller,/updates\.put\("officialStartCommand", command\)/);
  assert.doesNotMatch(controller,/updates\.put\(finished \? "undoFinishedCommand" : "fullscreenCommand"/);
});

test('remote score commands before the official start only show the double-press hint',()=>{
  const preStart=main.match(/function handleAndroidPreStartPress\(action,command\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(preStart,/matchHasOfficiallyStarted\(state\.match\)\)return false/);
  assert.match(preStart,/pressedAt=timestampMillis\(command\?\.clientCreatedAt\)/);
  assert.match(preStart,/if\(command\?\.doublePress===true\)\{androidOfficialStartPending=null;markMatchOfficialStarted\(/);
  assert.doesNotMatch(preStart,/SCORE_REMOTE_DOUBLE_PRESS_MIN_MS/);
  assert.match(preStart,/if\(gap<=SCORE_REMOTE_DOUBLE_PRESS_MS\)\{androidOfficialStartPending=null;markMatchOfficialStarted\(/);
  assert.match(preStart,/androidOfficialStartPending=\{matchId:state\.match\.matchId,at\}/);
  assert.match(preStart,/showScoreRemoteIndicator\('按兩下＋／－正式開始'/);
  assert.match(main,/handleAndroidPreStartPress\(action,command\)\)return true;[\s\S]*?performScoreRemoteAction\(action\)/);
  assert.doesNotMatch(main,/handleAndroidOfficialStartPress/);
  const court=main.match(/if\(courtVisible&&\['teamAPlus','teamBPlus'\]\.includes\(action\)\)\{[\s\S]*?return true;/)?.[0]||'';
  assert.doesNotMatch(court,/markMatchOfficialStarted|PreStartPress/);
  assert.match(main,/function handleRemoteOfficialStartCommand[\s\S]*?const started=markMatchOfficialStarted[\s\S]*?if\(started&&\$\('scoreView'\)\.classList\.contains\('hidden'\)&&\$\('resultModal'\)\.classList\.contains\('hidden'\)\)\{scoreViewRequested=true;renderScore\(\)\}/);
});

test('Android gates the official start with a double press before sending anything',()=>{
  const gate=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/OfficialStartGate.java',import.meta.url),'utf8');
  assert.doesNotMatch(gate,/MIN_CONFIRM_GAP_MS/);
  assert.match(gate,/DOUBLE_PRESS_MS = 500L/);
  assert.match(gate,/if \(gap <= DOUBLE_PRESS_MS\)/);
  assert.match(controller,/officialStartGate\.onScorePress\(\s*awaitingOfficialStart\(\), now\)/);
  assert.match(controller,/START_ECHO_SUPPRESS_MS = 500L/);
  assert.match(controller,/if \(scoreAction && now < suppressScoreUntil\)/);
  assert.match(controller,/suppressScoreUntil = now \+ START_ECHO_SUPPRESS_MS/);
  assert.match(main,/function isOfficialStartScoreEcho\(action,command\)\{[\s\S]*?OFFICIAL_START_ECHO_MS/);
  assert.match(main,/if\(isOfficialStartScoreEcho\(action,command\)\)return true;\s*if\(performScoreRemoteAction\(action\)\)/);
  assert.match(controller,/WAIT_FOR_SECOND_PRESS\) \{\s*if \(callback != null\) callback\.onComplete\(true, "再按一下正式開始", action\);\s*return;/);
  assert.match(controller,/OFFICIAL_START\) \{[\s\S]*?startOfficialMatch\(/);
  assert.doesNotMatch(controller,/doublePress|OFFICIAL_START_DOUBLE_PRESS_MS/);
  assert.match(activity,/TEAM_A_PLUS \|\| action == VolumeKeyInterpreter\.Action\.TEAM_B_PLUS\) \{\s*sendScoreAction\(action\);\s*return;/);
});

test('touch events only intercept the P4 remote now that YUNTENG is removed',()=>{
  const loop=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
  assert.doesNotMatch(controller,/allowsFastOfficialStartPress/);
  assert.match(activity,/dispatchTouchEvent\(MotionEvent event\) \{\s*if \(deliverP4Gesture\(event\)\) return true;\s*return super\.dispatchTouchEvent\(event\);/);
  assert.match(loop,/dispatchTouchEvent\(MotionEvent event\) \{\s*if \(deliverP4Gesture\(event\)\) return true;\s*return super\.dispatchTouchEvent\(event\);/);
});

test('Android keeps a live match listener so the first remote press is ready',()=>{
  const loop=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
  assert.match(controller,/matchListener = liveScoreReference\(session\)\.addSnapshotListener/);
  assert.match(controller,/if \(error != null\) onMatchListenerFailed\(roomId\);/);
  assert.match(controller,/private synchronized void onMatchListenerFailed\(String roomId\) \{[\s\S]*?matchKnown = false;[\s\S]*?retryHandler\.postDelayed/);
  assert.match(controller,/void warmUp\(WarmUpCallback callback\) \{[\s\S]*?ensureMatchListener\(session\);/);
  assert.match(controller,/synchronized void release\(\) \{\s*retryHandler\.removeCallbacksAndMessages\(null\);\s*if \(matchListener != null\) matchListener\.remove\(\)/);
  assert.match(activity,/backgroundScoreController\.release\(\)/);
  assert.match(service,/scoreController\.release\(\)/);
  assert.match(loop,/remoteScoreController\.release\(\)/);
});

test('presses stamped with the just-replaced match still count toward the official start',()=>{
  const startMatch=main.match(/function startMatch\(\)\{[\s\S]*?\n/)?.[0]||'';
  const startNext=main.match(/function startNext\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  for(const source of [startMatch,startNext])assert.match(source,/rememberReplacedRemoteMatch\(\);\s*state\.match=\{active:true/);
  const replaced=main.match(/function isReplacedMatchPreStartPress\(command,action\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(replaced,/!matchHasOfficiallyStarted\(match\)&&!match\.rallies\.length/);
  assert.match(replaced,/Date\.now\(\)-replacedRemoteMatchAt<=REMOTE_COMMAND_MAX_AGE_MS&&String\(command\?\.matchId\?\?''\)===replacedRemoteMatchId/);
  assert.match(replaced,/shouldAcceptRemoteCommand\(\{command,currentMatch:\{matchId:replacedRemoteMatchId\}\}\)/);
  assert.match(main,/const staleForCurrentMatch=!initial&&isStaleMatchPressForCurrentMatch\(\{command,currentMatch:state\.match\}\);\s*if\(!staleForCurrentMatch&&!shouldAcceptRemoteCommand\(\{command,currentMatch:state\.match,initial,skipAge\}\)\)\{\s*if\(initial\|\|requestedAndroidRemote\|\|!isHost\|\|\$\('scoreView'\)\.classList\.contains\('hidden'\)\|\|!isReplacedMatchPreStartPress\(command,action\)\)return false;\s*return handleAndroidPreStartPress\(action,command\);/);
});

test('Android sends remote commands without a transaction once the match is known',()=>{
  const sendAction=controller.match(/private void sendAction\(Request request\) \{[\s\S]*?\n    \}/)?.[0]||'';
  assert.match(sendAction,/String cachedMatchId = knownMatchId\(\);\s*if \(cachedMatchId != null\) \{\s*deliverAction\(remoteControl, request, cachedMatchId\);/);
  assert.doesNotMatch(sendAction,/目前沒有進行中的比賽/);
  assert.match(controller,/void startOfficialMatch[\s\S]*?String cachedMatchId = cachedPreStartMatchId\(\);\s*if \(cachedMatchId != null\) \{\s*Map<String, Object> updates = officialStartUpdates\(cachedMatchId, clientCreatedAt\);[\s\S]*?remoteControl\.set\(updates, SetOptions\.merge\(\)\)/);
  assert.match(controller,/cachedPreStartMatchId\(\) \{\s*return matchKnown && matchActive && !matchFinished && !matchStarted && !matchId\.isEmpty\(\) \? matchId : null;/);
});

test('Android appends every score press immediately instead of holding later presses',()=>{
  assert.doesNotMatch(controller,/COMMAND_DELIVERY_GAP_MS|commandHandler\.postDelayed\(this::processNext|remoteActionLog/);
  assert.match(controller,/Map<String, Object> command = actionCommand\(request, matchId, id\);[\s\S]*?if \(""\.equals\(command\.get\("action"\)\)\)[\s\S]*?remoteControl\.getParent\(\)\.document\("score-" \+ id\)\.set\(command\)/);
  assert.match(controller,/command\.put\("clientCreatedAt", request\.clientCreatedAt\)/);
  assert.match(controller,/reported\.compareAndSet\(false, true\) && request\.callback != null\) \{\s*request\.callback\.onComplete\(true, "已送出遙控器指令", request\.action\);/);
  assert.match(main,/resilientSnapshot\(collection\(db,'badmintonRooms',id,'remoteControl'\)[\s\S]*?change\.doc\.id\.startsWith\('score-'\)[\s\S]*?handleRemoteActionCommand\(\{remoteActionCommand:item\.command\},\{initial:false,skipAge:true\}\)/);
  assert.match(main,/if\(!id\|\|seenRemoteActionIds\.has\(id\)\)return false;\s*seenRemoteActionIds\.add\(id\)/);
  assert.match(main,/function replay\(\)\{[\s\S]*?m\.syncEpoch=Math\.max\(Date\.now\(\),\(Number\(m\.syncEpoch\)\|\|0\)\+1\)/);
});

test('official start is idempotent and scoring waits for it',()=>{
  assert.match(main,/if\(matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('本場已正式開始'/);
  assert.match(main,/if\(!matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('請先按播放鍵正式開始'/);
  assert.match(controller,/void startOfficialMatch[\s\S]*?long clientCreatedAt = System\.currentTimeMillis\(\)[\s\S]*?command\.put\("clientCreatedAt", clientCreatedAt\)/);
  assert.match(main,/function handleRemoteOfficialStartCommand[\s\S]*?markMatchOfficialStarted\(data\.officialStartCommand\.clientCreatedAt\|\|data\.officialStartCommand\.createdAt\)/);
  assert.match(main,/function handleRemoteFullscreenCommand[\s\S]*?markMatchOfficialStarted\(data\.fullscreenCommand\.clientCreatedAt\|\|data\.fullscreenCommand\.createdAt\)/);
});

test('the score badge stays live while a room write is still syncing',()=>{
  const badge=main.match(/function updateSyncBadge\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(badge,/const livePending=liveScoreWriteScheduled\|\|pendingLiveScoreWrites>0\|\|liveScoreHasPendingWrites\|\|\(liveScoreConnecting&&!liveScoreReady\)/);
  assert.match(badge,/if\(livePending\)\{scoreBadge\.textContent='同步中'/);
  assert.match(badge,/scoreBadge\.textContent='即時連線'/);
});

test('a started match stays started when a later snapshot omits the start time',()=>{
  assert.match(controller,/startedLatchMatchId = nextMatchId;\s*suppressScoreUntil = startedNow \? now \+ START_ECHO_SUPPRESS_MS : Long\.MIN_VALUE;\s*matchStarted = startedNow;/);
  assert.match(controller,/else if \(!nextActive \|\| nextFinished\) \{\s*matchStarted = false;\s*\} else if \(startedNow\) \{\s*if \(!matchStarted\) suppressScoreUntil = Math\.max\(suppressScoreUntil, now \+ START_ECHO_SUPPRESS_MS\);\s*matchStarted = true;\s*\}/);
});

test('scoring does not speak',()=>{
  assert.doesNotMatch(main,/speechSynthesis|announceScore|synth\.cancel/);
});

test('official start does not block the following score presses',()=>{
  assert.doesNotMatch(main,/OFFICIAL_START_SCORE_LOCK_MS|officialStartScoreUnlockAt|正式開始保護中/);
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
  assert.match(main,/function markMatchOfficialStarted\(requestedAt\)[\s\S]*?saveLiveScoreSoon\(\);renderDashboard\(\);renderHistory\(\)/);
  assert.match(main,/officialStartButton\.classList\.toggle\('hidden',!canStart\)/);
  assert.match(styles,/\.score-view\.immersive-mode \.score-head \.score-actions>button:not\(#fullscreenScore\):not\(#officialStartScore\):not\(#undo\):not\(#syncSessionScore\)/);
  assert.match(styles,/\.score-view\.immersive-mode #officialStartScore:not\(\.hidden\)\{[^}]*position:fixed;[^}]*right:calc\(62px/);
});

test('touchscreen scoring cannot bypass the official start timestamp',()=>{
  assert.match(main,/function guardUnofficialTouchScoring\(event\)[\s\S]*?matchHasOfficiallyStarted\(state\.match\)[\s\S]*?scoreSideA\.contains\(target\)[\s\S]*?\$\('scoreA'\)\.contains\(target\)[\s\S]*?\$\('scoreB'\)\.contains\(target\)[\s\S]*?event\.stopImmediatePropagation\(\)[\s\S]*?請先按播放鍵正式開始/);
  assert.match(main,/document\.addEventListener\('click',guardUnofficialTouchScoring,\{capture:true\}\)/);
});

test('an official start pressed before the next match is shown never carries over',()=>{
  const start=controller.match(/void startOfficialMatch\(FullscreenCallback callback\) \{[\s\S]*?\n    \}/)?.[0]||'';
  assert.match(start,/ensureMatchListener\(session\);/);
  assert.match(start,/remoteControl\.set\(updates, SetOptions\.merge\(\)\)\s*\.addOnFailureListener\(error -> callback\.onComplete\(false, errorMessage\(error\)\)\);\s*callback\.onComplete\(true, "已送出正式開始比賽"\);/);
  assert.doesNotMatch(controller,/cachedFinishedMatchId/);
  assert.match(start,/if \(match\.get\("winner"\) != null\) throw new IllegalStateException\("本場比賽已結束"\);/);
  assert.match(start,/\.addOnSuccessListener\(ignored -> \{\s*sendDirect\("officialStart", sentCommand\.get\(\)\);/);
  const handler=main.match(/function handleRemoteOfficialStartCommand\(data,\{initial=false\}=\{\}\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(handler,/if\(!shouldAcceptRemoteCommand\(\{command,currentMatch:state\.match,initial\}\)\)return false;/);
  assert.doesNotMatch(main,/pendingOfficialStartAfterMatch|startPendingOfficialStart|isReplacedMatchOfficialStart/);
  const startNext=main.match(/function startNext\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(startNext,/checkpointNewMatch\(\);renderAll\(\);/);
});

test('the play button disappears as soon as the match officially starts',()=>{
  assert.match(main,/function markMatchOfficialStarted\(requestedAt\)[\s\S]*?saveLiveScoreSoon\(\);renderDashboard\(\);renderHistory\(\);renderScore\(\);/);
});

test('official start indicator is emphasized and centered for everyone to see',()=>{
  assert.match(main,/showScoreRemoteIndicator\('比賽正式開始',\{duration:500,icon:'✅',emphasis:'official'\}\)/);
  assert.match(styles,/\.score-remote-indicator\.official-start\{[^}]*top:50%;[^}]*left:50%;[^}]*transform:translate\(-50%,-50%\);[^}]*font-size:clamp\(2rem,7vw,5rem\)/);
});
