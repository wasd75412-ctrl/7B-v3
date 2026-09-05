import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const camera=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('suspends the hidden WebView while native recording stays active',()=>{
  assert.match(source,/protected void onPause\(\)[\s\S]*?webView\.onPause\(\);[\s\S]*?webView\.pauseTimers\(\);/);
  assert.match(source,/protected void onResume\(\)[\s\S]*?webView\.resumeTimers\(\);[\s\S]*?webView\.onResume\(\);/);
  assert.match(source,/The native camera and Firestore controller keep recording and scoring alive/);
});

test('recovers recording after transient CameraX finalization and only clears it on explicit exit',()=>{
  assert.match(camera,/RECORDING_RECOVERY_MS\s*=\s*750L/);
  assert.match(camera,/scheduleRecordingRecovery\(\)/);
  assert.match(camera,/protected void onResume\(\)[\s\S]*?scheduleRecordingRecovery\(\)/);
  const destroy=camera.match(/onDestroy\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1]||'';
  assert.match(destroy,/if \(explicitExit\) RemoteSessionStore\.setRecordingEnabled\(this, false\)/);
  assert.match(camera,/void exitRecording\([\s\S]*?setRecordingEnabled\(this, false\)/);
});

test('uses the platform permission callback without requiring Fragment Activity Result APIs',()=>{
  assert.match(camera,/requestPermissions\([^;]+CAMERA_PERMISSION_REQUEST\)/);
  assert.match(camera,/onRequestPermissionsResult\(/);
  assert.doesNotMatch(camera,/registerForActivityResult|ActivityResultLauncher/);
});
