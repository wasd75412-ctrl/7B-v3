import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const camera=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LiveMatchOverlayController.java',import.meta.url),'utf8');
const accessibility=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('shows the live score in the visible recording preview and burns it into recorded video',()=>{
  assert.match(camera,/scorePreviewOverlay = new android\.view\.View/);
  assert.match(camera,/drawScoreBoard\(canvas, 0f, 0f, getWidth\(\), getHeight\(\), overlayState\.get\(\)\)/);
  assert.match(camera,/scorePreviewOverlay\.postInvalidate\(\)/);
  assert.match(camera,/new OverlayEffect\(\s*CameraEffect\.VIDEO_CAPTURE/);
  assert.doesNotMatch(camera,/CameraEffect\.PREVIEW \| CameraEffect\.VIDEO_CAPTURE/);
  assert.match(camera,/\.addEffect\(scoreOverlayEffect\)/);
  assert.match(camera,/drawScoreOverlay\(frame\.getOverlayCanvas\(\), frame\.getCropRect\(\), frame\.getRotationDegrees\(\), overlayState\.get\(\)\)/);
  assert.match(camera,/fitTeamLabel\(match\.teamA, names, nameMaxWidth\)/);
  assert.match(camera,/String\.valueOf\(match\.scoreA\)/);
});

test('keeps video overlay rendering off the UI and recording event threads',()=>{
  assert.match(camera,/new HandlerThread\("7BScoreOverlay"\)/);
  assert.match(camera,/overlayThread\.start\(\);\s*overlayHandler = new android\.os\.Handler\(overlayThread\.getLooper\(\)\);/);
  assert.match(camera,/new OverlayEffect\(\s*CameraEffect\.VIDEO_CAPTURE,\s*0,\s*overlayHandler/);
  assert.match(camera,/\.setExecutor\(recordingExecutor\)/);
  assert.match(camera,/scoreOverlayEffect\.close\(\);\s*overlayThread\.quitSafely\(\);/);
  assert.match(camera,/recordingExecutor\.shutdown\(\)/);
});

test('lays out a compact two-row broadcast scoreboard against the top-left edge',()=>{
  assert.match(camera,/new RectF\(margin, margin, margin \+ boardWidth/);
  assert.match(camera,/float targetAspect = 16f \/ 9f/);
  assert.match(camera,/canvas\.translate\(viewportLeft, viewportTop\)/);
  assert.doesNotMatch(camera,/canvas\.rotate\(-90f\)/);
  assert.match(camera,/setTargetRotation\(targetRotation\)/);
  assert.match(camera,/box\.top \+ rowHeight/);
  assert.match(camera,/fitTeamLabel\(match\.teamA, names, nameMaxWidth\)/);
  assert.match(camera,/box\.right - scoreWidth \/ 2f/);
  assert.match(camera,/LinearGradient/);
  assert.match(camera,/0xFF0057D9, 0xFF00A9C7/);
  assert.match(camera,/0xFFD91E45, 0xFFFF7A00/);
  assert.match(camera,/teamABackground/);
  assert.match(camera,/teamBBackground/);
  assert.match(camera,/float boardWidth = Math\.min\(width \* 0\.28f/);
  assert.match(camera,/float rowHeight = Math\.max\(38f/);
  assert.match(camera,/names\.setTextSize\(Math\.max\(23f/);
});

test('subscribes to the shared room roster and live score documents',()=>{
  assert.match(overlay,/collection\("badmintonRooms"\)\.document\(session\.roomId\)/);
  assert.match(overlay,/collection\("liveScore"\)\.document\("current"\)/);
  assert.match(overlay,/playerNames\.getOrDefault\(id, "球員"\)/);
});

test('keeps the recording overlay on the newest mirrored score source',()=>{
  assert.match(overlay,/roomMatch = matchSnapshot\(snapshot\)/);
  assert.match(overlay,/liveMatch = matchSnapshot\(snapshot\)/);
  assert.match(overlay,/newest\(roomMatch, liveMatch\)\.match/);
  assert.match(overlay,/firstEpoch != secondEpoch/);
  assert.match(overlay,/first\.updatedAt > second\.updatedAt/);
});

test('mirrors live score writes for the recording fallback listener without a room write per point',()=>{
  assert.match(main,/await setDoc\(liveScoreRef,livePayload,\{merge:true\}\);\s*scheduleRoomMatchFallback\(\);/);
  const schedule=main.match(/function scheduleRoomMatchFallback\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(schedule,/roomMatchFallbackSignature\(\)!==roomMatchFallbackKey\)return flushRoomMatchFallback\(\)/);
  assert.match(schedule,/setTimeout\(flushRoomMatchFallback,ROOM_MATCH_FALLBACK_MS\)/);
  assert.match(main,/function roomMatchFallbackSignature\(\)\{[^\n]*match\.winner[^\n]*match\.startedAt/);
  assert.match(main,/const data=roomMatchFallbackTimer\?\{\.\.\.payload\(\),\.\.\.takeRoomMatchFallback\(\)\}:payload\(\)/);
  assert.match(main,/!s\.metadata\.hasPendingWrites&&roomMatchFallbackTimer\)flushRoomMatchFallback\(\)/);
  assert.match(main,/addEventListener\('pagehide',\(\)=>\{if\(roomMatchFallbackTimer\)flushRoomMatchFallback\(\)\}\)/);
});

test('keeps Bluetooth scoring in the accessibility background controller path',()=>{
  assert.match(accessibility,/scoreController\.submit\(action/);
  assert.match(accessibility,/RemoteKeyRelay\.dispatch\(event\)/);
  assert.doesNotMatch(camera,/dispatchKeyEvent\(/);
  assert.match(camera,/onKeyDown\(int keyCode[\s\S]*?KEYCODE_CAMERA[\s\S]*?return true/);
  assert.doesNotMatch(camera,/onKeyDown[\s\S]{0,500}submit\(/);
});
