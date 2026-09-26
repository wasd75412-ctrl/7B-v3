import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const camera=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LiveMatchOverlayController.java',import.meta.url),'utf8');
const accessibility=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');

test('burns the live player and score overlay into both preview and recorded video',()=>{
  assert.match(camera,/CameraEffect\.PREVIEW \| CameraEffect\.VIDEO_CAPTURE/);
  assert.match(camera,/\.addEffect\(scoreOverlayEffect\)/);
  assert.match(camera,/drawScoreOverlay\(frame\.getOverlayCanvas\(\), frame\.getCropRect\(\), frame\.getRotationDegrees\(\), overlayState\.get\(\)\)/);
  assert.match(camera,/fitTeamLabel\(match\.teamA, names, nameMaxWidth\)/);
  assert.match(camera,/String\.valueOf\(match\.scoreA\)/);
});

test('lays out a large two-row broadcast scoreboard against the top-left edge',()=>{
  assert.match(camera,/new RectF\(margin, margin, margin \+ boardWidth/);
  assert.match(camera,/float targetAspect = 16f \/ 9f/);
  assert.match(camera,/canvas\.translate\(viewportLeft, viewportTop\)/);
  assert.doesNotMatch(camera,/canvas\.rotate\(-90f\)/);
  assert.match(camera,/setTargetRotation\(targetRotation\)/);
  assert.match(camera,/box\.top \+ rowHeight/);
  assert.match(camera,/fitTeamLabel\(match\.teamA, names, nameMaxWidth\)/);
  assert.match(camera,/box\.right - scoreWidth \/ 2f/);
  assert.match(camera,/LinearGradient/);
  assert.match(camera,/names\.setTextSize\(Math\.max\(32f/);
});

test('subscribes to the shared room roster and live score documents',()=>{
  assert.match(overlay,/collection\("badmintonRooms"\)\.document\(session\.roomId\)/);
  assert.match(overlay,/collection\("liveScore"\)\.document\("current"\)/);
  assert.match(overlay,/playerNames\.getOrDefault\(id, "球員"\)/);
});

test('keeps Bluetooth scoring in the accessibility background controller path',()=>{
  assert.match(accessibility,/scoreController\.submit\(action/);
  assert.match(accessibility,/RemoteKeyRelay\.dispatch\(event\)/);
  assert.doesNotMatch(camera,/dispatchKeyEvent\(/);
});
