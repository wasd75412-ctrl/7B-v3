import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const camera=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('recording quality can be lowered from 4K and is remembered',()=>{
  assert.match(camera,/rebindSelectedQuality\(\)/);
  assert.match(camera,/FallbackStrategy\.lowerQualityOrHigherThan\(Quality\.UHD\)/);
  assert.match(camera,/FallbackStrategy\.lowerQualityThan\(quality\)/);
  assert.match(camera,/videoBitrate\(quality\)/);
  assert.match(camera,/if \(quality == Quality\.UHD\) return 40_000_000/);
  assert.match(camera,/if \(quality == Quality\.HD\) return 4_000_000/);
  assert.match(camera,/return 8_000_000/);
  assert.match(camera,/Quality\.HD/);
  assert.match(camera,/putString\(QUALITY_KEY, next\)/);
  assert.match(camera,/qualityButton\.setText\(qualityLabel\(savedQuality\(\)\)\)/);
});

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

test('opens score broadcast recording and can leave without saving',()=>{
  assert.doesNotMatch(source,/openVideoCamera\(false\)|循環錄影/);
  assert.match(source,/void openBroadcastCamera\(\) \{\s*Intent intent = new Intent\(this, LoopCameraActivity\.class\);/);
  assert.doesNotMatch(source,/EXTRA_BROADCAST_MODE/);
  assert.match(camera,/MediaStoreOutputOptions/);
  assert.doesNotMatch(camera,/broadcastMode|3 分鐘|三分鐘|saveRecentVideo|openSavedVideo/);
  assert.match(camera,/back\.setText\("返回"\);\s*prepareActionButton\(back\);\s*back\.setOnClickListener\(v -> returnWithoutAction\(\)\)/);
  assert.match(camera,/new FrameLayout\.LayoutParams\(-2, -2, Gravity\.BOTTOM \| Gravity\.START\)/);
  assert.match(camera,/void returnWithoutAction\(\)[\s\S]*?abandonRecording = true;/);
  assert.match(camera,/if \(abandonRecording\) \{[\s\S]*?getContentResolver\(\)\.delete\(savedUri, null, null\)/);
});

test('burns the live score only into broadcast recordings at the top-left',()=>{
  assert.match(camera,/scoreOverlayEffect = createScoreOverlayEffect\(\)[\s\S]*?groupBuilder\.addEffect\(scoreOverlayEffect\)/);
  assert.match(camera,/RectF box = new RectF\(margin, margin, margin \+ boardWidth/);
  assert.match(camera,/LinearGradient/);
  assert.match(camera,/names\.setTextSize\(Math\.max\(23f/);
});

test('saves broadcast video and immediately continues without opening a media viewer',()=>{
  assert.match(camera,/保存並繼續/);
  assert.match(camera,/saveBroadcastAndContinue\(\)/);
  assert.match(camera,/影片已保存，繼續錄影/);
  assert.match(camera,/broadcastSaveRequested = false;[\s\S]*?scheduleRecordingRecovery\(\)/);
  assert.doesNotMatch(camera,/ACTION_VIEW|openSavedVideo/);
});

test('keeps recording controls above Android system bars with reliable touch targets',()=>{
  assert.match(camera,/WindowInsetsCompat\.Type\.systemBars\(\)/);
  assert.match(camera,/14 \+ systemBars\.bottom/);
  assert.match(camera,/setMinHeight\(Math\.round\(56f \* density\)\)/);
  assert.match(camera,/close\.setEnabled\(false\);\s*close\.setText\("結束中…"\);\s*exitRecording\(\)/);
});

test('publishes the exact CameraX broadcast start time for the YouTube timeline',()=>{
  assert.match(camera,/event instanceof VideoRecordEvent\.Start\) \{\s*broadcastFileStartedAt = System\.currentTimeMillis\(\);\s*if \(broadcastStartReported\) return;\s*broadcastStartReported = true;/);
  assert.match(camera,/markBroadcastRecordingStarted\(System\.currentTimeMillis\(\)/);
});

test('queues every saved broadcast file for YouTube upload with its own start time',()=>{
  assert.match(camera,/if \(success && RecordingUploadStore\.add\(this, savedUri, RemoteSessionStore\.getSession\(this\)\.roomId,\s*broadcastFileStartedAt, System\.currentTimeMillis\(\)\)\) \{\s*YouTubeUploadScheduler\.schedule\(this\);/);
});
