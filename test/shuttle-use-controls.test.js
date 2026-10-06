import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const activity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const service=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');
const interpreter=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/VolumeKeyInterpreter.java',import.meta.url),'utf8');
const cameraActivity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('shows one-shuttle controls in scoring and next-match result views plus dashboard summary',()=>{
  for(const id of ['homeShuttleSummary','scoreUseShuttle','resultUseShuttle','resultReturnShuttle'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/id="resultUseShuttle"[^>]*>−1<\/button>/);
  assert.match(html,/id="resultReturnShuttle"[^>]*>\+1<\/button>/);
  assert.doesNotMatch(html,/id="result(?:Use|Return)Shuttle"[^>]*>[^<]*🏸/);
  assert.match(main,/function useOneShuttle\(/);
  assert.match(main,/id="homeShuttleManagerBtn"[^>]*>球桶管理<\/button>/);
  assert.match(main,/\$\('homeShuttleManagerBtn'\)\?\.addEventListener\('click',openShuttleTubeManager\)/);
  assert.match(main,/adjustSessionShuttleUsage\(row,-1,shuttleUsageSessionKey\(\)\)/);
  assert.match(main,/adjustSessionShuttleUsage\(row,1,shuttleUsageSessionKey\(\)\)/);
  assert.match(main,/adjustSessionShuttleUsage\(tube,delta,shuttleUsageSessionKey\(\)\)/);
  assert.match(main,/if\(\(roomWriteScheduled\|\|pendingRoomWrites>0\)&&!snapshotHasPendingWrites\)\{updateSyncBadge\(\);return\}/);
  assert.match(main,/function returnOneShuttle\(/);
  assert.match(main,/activateShuttleTube\(tubes,pending\.id,[^\n]+\);\s*syncShuttleCostNotice\([^\n]+\);updateUseShuttleButtons\(\);renderShuttleTubeManager\(\);\s*void saveNow\(\)\.catch\(\(\)=>saveSoon\(\)\)/);
  assert.match(main,/data-shuttle-delta="-1"[^>]*>−1<\/button>/);
  assert.match(main,/data-shuttle-delta="1"[^\n]*?>\+1<\/button>/);
  assert.match(main,/已加回 1 顆球｜剩餘/);
  assert.match(main,/showScoreRemoteIndicator\(`已使用 1 顆球｜剩餘 \$\{updated\.remainingShuttles\} 顆`,\{duration:2000,icon:'🏸'\}\)/);
  assert.match(main,/resultModal&&!resultModal\.classList\.contains\('hidden'\)\?resultModal:\(currentFullscreenElement\(\)\|\|\$\('scoreView'\)\)/);
  assert.match(main,/overlayHost\.append\(indicator\)/);
  assert.match(styles,/\.score-remote-indicator\{[^}]*z-index:1000/);
  assert.doesNotMatch(main,/if\(source==='remote'\)showScoreRemoteIndicator\(`已使用 1 顆/);
  assert.match(main,/class="home-shuttle-fee-amount">\$\{players\?`每人 \$\{formatMoney\(share\)\} 元`/);
  assert.match(main,/ensureShuttleCostNotice/);
  assert.match(main,/sessionCombinedCosts\(e\)/);
  assert.match(main,/next-event-payment">場租及球費 <strong class="next-event-fee-amount">\$\{formatMoney\(perPersonFee\)\} 元/);
  assert.match(styles,/\.home-shuttle-fee-amount\{[^}]*font-size:1\.16rem/);
  assert.match(styles,/\.next-event-fee-amount\{[^}]*font-size:1\.18em/);
  assert.doesNotMatch(html,/勝方兩人保留，候場隊首兩人上場/);
  assert.doesNotMatch(html,/id="priorityText"/);
  assert.doesNotMatch(main,/\$\('priorityText'\)/);
  assert.match(styles,/#resultModal \.next-team/);
});

test('persists shuttle changes during lite-sync matches and refreshes the session fee',()=>{
  assert.match(main,/function saveShuttleChange\(\)\{if\(isHost&&roomRef\)void saveNow\(\)\.catch\(\(\)=>saveSoon\(\)\)\}/);
  for(const name of ['useOneShuttle','returnOneShuttle','renderShuttleTubeManager','createNewShuttleTube']){
    const body=main.slice(main.indexOf(`function ${name}(`),main.indexOf('\nfunction ',main.indexOf(`function ${name}(`)+1));
    assert.doesNotMatch(body,/saveSoon\(\);/,`${name} must not rely on saveSoon`);
  }
  assert.match(main,/adjustSessionShuttleUsage\(row,-1,shuttleUsageSessionKey\(\)\):row\)\);\s*const updated=activeShuttleTube\(\);\s*syncShuttleCostNotice\(updated\);updateUseShuttleButtons\(\);renderShuttleTubeManager\(\);saveShuttleChange\(\);/);
  assert.match(main,/function syncShuttleCostNotice\(tube\)\{[^}]*refreshSessionFeeAmount\(\);\s*renderDashboard\(\);/);
  assert.match(main,/function refreshSessionFeeAmount\(\)\{[\s\S]*?sessionFee:\{\.\.\.event\.sessionFee,amount:share\}/);
});

test('routes remote keys directly without multi-press delay',()=>{
  for(const source of [activity,service]){
    assert.match(source,/Action previousAction = \w+Keys\.onMissingKeyUp\(keyCode\);[\s\S]*?handleResolved\w+Action\(previousAction, keyCode, event\.getEventTime\(\)\);/);
    assert.match(source,/SHUTTLE_PRESS_COOLDOWN_MS = 2000L/);
    assert.match(source,/Action\.USE_SHUTTLE[\s\S]*?Action\.RETURN_SHUTTLE/);
    assert.doesNotMatch(source,/pendingShortPressCount|SHUTTLE_SEQUENCE_MS/);
    assert.match(source,/action == VolumeKeyInterpreter\.Action\.UNDO/);
  }
  assert.match(interpreter,/KEYCODE_VOLUME_UP:[\s\S]*?TEAM_A_PLUS/);
  assert.match(interpreter,/KEYCODE_VOLUME_DOWN:[\s\S]*?TEAM_B_PLUS/);
  assert.match(interpreter,/KEYCODE_CAMERA:[\s\S]*?USE_SHUTTLE/);
  assert.match(interpreter,/longPressAction[\s\S]*?KEYCODE_VOLUME_UP[\s\S]*?Action\.UNDO[\s\S]*?Action\.RETURN_SHUTTLE/);
  assert.match(activity,/scoreController\(\)\.useOneShuttle/);
  assert.match(activity,/scoreController\(\)\.returnOneShuttle/);
  assert.match(service,/useOneShuttle/);
  assert.match(service,/returnOneShuttle/);
  assert.match(activity,/sendRemoteOfficialStartCommand\(\).*backgroundScoreController\.startOfficialMatch/s);
  assert.match(controller,/startOfficialMatch\(FullscreenCallback callback\).*transaction\.get\(liveScore\).*officialStartUpdates\(String\.valueOf\(matchId\), clientCreatedAt\);\s*transaction\.set\(remoteControl, updates, SetOptions\.merge\(\)\)/s);
  assert.match(controller,/officialStartUpdates\(String matchId, long clientCreatedAt\)[\s\S]*?updates\.put\("officialStartCommand", command\)/);
  assert.match(controller,/sendShuttleCommand\(VolumeKeyInterpreter\.Action\.USE_SHUTTLE, "已使用 1 顆球"/);
  assert.match(controller,/sendShuttleCommand\(VolumeKeyInterpreter\.Action\.RETURN_SHUTTLE, "已加回 1 顆球"/);
  assert.match(controller,/sendShuttleCommand[\s\S]*?sendAction\(new Request\(action/);
  assert.match(controller,/case USE_SHUTTLE:[\s\S]*?return "useShuttle"/);
  assert.match(controller,/case RETURN_SHUTTLE:[\s\S]*?return "returnShuttle"/);
  assert.doesNotMatch(controller,/remoteActionCommand/);
  assert.match(controller,/startOfficialMatch[\s\S]*?if \(!session\.isAuthorized\(\)\)[\s\S]*?transaction\.get\(liveScore\)/);
  assert.match(controller,/private void sendAction\(Request request\).*knownMatchId\(\).*deliverAction\(remoteControl, request, cachedMatchId\)/s);
  assert.match(controller,/remoteControl\.getParent\(\)\.document\("score-" \+ id\)\.set\(command\)/);
  assert.match(main,/\['teamAPlus','teamBPlus','undo','useShuttle','returnShuttle'\]/);
  assert.match(main,/if\(!scoreVisible&&!resultVisible\)\{\s*if\(courtVisible&&\['teamAPlus','teamBPlus'\]\.includes\(action\)\)/);
  assert.match(main,/if\(action==='useShuttle'\)return useOneShuttle/);
  assert.match(main,/if\(action==='returnShuttle'\)return returnOneShuttle/);
  assert.match(main,/if\(resultVisible\)\{\s*if\(action==='undo'\)performScoreRemoteAction\('undo',\{announce:false\}\);\s*else if\(isResultScreenBurstPress\(command\)\)showScoreRemoteIndicator\('本場已結束'[^\n]*\n\s*else if\(isResultScreenNextMatchPress\(command,action\)\)startNextFromRemote\(\);\s*return true;\s*\}/);
});

test('YUNTENG remote support is removed and camera-key shuttle controls remain',()=>{
  assert.equal(existsSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/YuntengGestureInterpreter.java',import.meta.url)),false);
  for(const source of [activity,service,cameraActivity])assert.doesNotMatch(source,/yunteng/i);
  assert.match(activity,/sendScoreAction[\s\S]*?scoreController\(\)\.submit\(action/);
  const cameraButton=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/CameraButtonGesture.java',import.meta.url),'utf8');
  assert.match(cameraButton,/DOUBLE_PRESS_MS = 500L/);
  assert.match(cameraButton,/callbacks\.useShuttle\(\)[\s\S]*?callbacks\.undo\(\)/);
  assert.match(cameraButton,/callbacks\.returnShuttle\(\)/);
  assert.match(activity,/KEYCODE_CAMERA && action == VolumeKeyInterpreter\.Action\.USE_SHUTTLE[\s\S]*?onShortPress\(eventTime, cameraButtonCallbacks\)/);
  assert.match(activity,/KEYCODE_CAMERA && action == VolumeKeyInterpreter\.Action\.RETURN_SHUTTLE[\s\S]*?onLongPress\(eventTime, cameraButtonCallbacks\)/);
  assert.match(activity,/void undo\(\) \{ sendRemoteAction\(VolumeKeyInterpreter\.Action\.UNDO\); \}[\s\S]*?void useShuttle\(\) \{ sendRemoteUseShuttleCommand\(\); \}[\s\S]*?void returnShuttle\(\) \{ sendRemoteReturnShuttleCommand\(\); \}/);
  assert.match(service,/KEYCODE_CAMERA && action == VolumeKeyInterpreter\.Action\.USE_SHUTTLE[\s\S]*?onShortPress\(eventTime, cameraButtonCallbacks\)/);
  assert.match(service,/void undo\(\) \{ sendBackgroundAction\(VolumeKeyInterpreter\.Action\.UNDO\); \}[\s\S]*?void useShuttle\(\) \{ sendBackgroundUseShuttle\(\); \}[\s\S]*?void returnShuttle\(\) \{ sendBackgroundReturnShuttle\(\); \}/);
  assert.match(cameraActivity,/CameraButtonGesture\.shared\(\)\.onShortPress\(event\.getEventTime\(\), recordingCameraCallbacks\)/);
  assert.match(cameraActivity,/CameraButtonGesture\.shared\(\)\.onLongPress\(pressedAt \+ VolumeKeyInterpreter\.LONG_PRESS_MS, recordingCameraCallbacks\)/);
  assert.match(cameraActivity,/if \(keyCode == android\.view\.KeyEvent\.KEYCODE_CAMERA\) \{\s*handleRecordingCameraKey\(event\);/);
  assert.match(cameraActivity,/remoteScoreController\.submit\(action/);
});
