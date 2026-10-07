import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const camera=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../android-remote/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');

test('recording quality can be lowered from 4K and is remembered',()=>{
  assert.match(camera,/rebindSelectedQuality\(\)/);
  assert.match(camera,/FallbackStrategy\.lowerQualityOrHigherThan\(Quality\.UHD\)/);
  assert.match(camera,/FallbackStrategy\.lowerQualityThan\(quality\)/);
  assert.match(camera,/videoBitrate\(quality\)/);
  assert.match(camera,/if \(quality == Quality\.UHD\) return 40_000_000/);
  assert.match(camera,/if \(quality == Quality\.HD\) return 10_000_000/);
  assert.match(camera,/return 20_000_000/);
  assert.match(camera,/Quality\.HD/);
  assert.match(camera,/putString\(QUALITY_KEY, next\)/);
  assert.match(camera,/qualityButton\.setText\(qualityLabel\(savedQuality\(\)\)\)/);
});

test('recording quality only offers what the camera can actually encode and labels the bound quality',()=>{
  assert.match(camera,/Recorder\.getVideoCapabilities\([\s\S]*?getSupportedQualities\(DynamicRange\.SDR\)/);
  assert.match(camera,/cameraProvider = future\.get\(\);\s*loadSupportedQualities\(\);/);
  assert.match(camera,/String current = selectedQuality\(\), next = nextQuality\(current\);/);
  assert.match(camera,/if \(!bindRecording\(cameraProvider, cameraQuality\(quality\)\)\) continue;\s*qualityButton\.setText\(qualityLabel\(quality\)\);/);
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
  assert.match(source,/void openBroadcastCamera\(\) \{\s*if \(cameraLaunchPending\) return;\s*Intent intent = new Intent\(this, LoopCameraActivity\.class\)\s*\.addFlags\(Intent\.FLAG_ACTIVITY_SINGLE_TOP \| Intent\.FLAG_ACTIVITY_CLEAR_TOP\);/);
  assert.match(manifest,/android:name="\.LoopCameraActivity"[^>]*android:launchMode="singleTop"/);
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
  assert.match(camera,/event instanceof VideoRecordEvent\.Start\) \{\s*broadcastFileStartedAt = System\.currentTimeMillis\(\);\s*pauses\.clear\(\);\s*if \(broadcastStartReported\) return;\s*broadcastStartReported = true;/);
  assert.match(camera,/markBroadcastRecordingStarted\(System\.currentTimeMillis\(\)/);
});

test('queues every saved broadcast file for YouTube upload with its own start time',()=>{
  assert.match(camera,/long fileStartedAt = broadcastFileStartedAt;\s*long fileEndedAt = System\.currentTimeMillis\(\);\s*if \(success\) queueSavedRecording\(savedUri, fileStartedAt, fileEndedAt, filePauses\);/);
  assert.match(camera,/RecordingUploadStore\.add\(app, savedUri, roomId, startedAt, endedAt, filePauses\)/);
  assert.doesNotMatch(camera,/YouTubeUploadScheduler\.schedule\(app\);/);
});

test('aligns the video to the microphone clock before a saved file is queued for upload',()=>{
  assert.match(camera,/savedRecordingExecutor\.execute\(\(\) -> \{\s*alignAudioClock\(app, savedUri\);\s*RecordingUploadStore\.add\(/);
  assert.match(camera,/AudioClockAligner\.align\(app\.getContentResolver\(\), savedUri\)/);
});

test('uploads start only after the recording screen closes',()=>{
  assert.match(camera,/static boolean isRecordingSessionOpen\(\) \{\s*return OPEN_SESSIONS\.get\(\) > 0;/);
  assert.match(camera,/sessionCounted = true;\s*OPEN_SESSIONS\.incrementAndGet\(\);/);
  assert.match(camera,/OPEN_SESSIONS\.decrementAndGet\(\);[\s\S]*?savedRecordingExecutor\.execute\(\(\) -> YouTubeUploadScheduler\.scheduleIfPending\(app\)\);\s*savedRecordingExecutor\.shutdown\(\);/);
});

test('pauses and resumes the broadcast recording and keeps pauses out of the timeline',()=>{
  assert.match(camera,/pauseButton\.setText\("暫停"\);[^\n]*pauseButton\.setOnClickListener\(v -> togglePause\(\)\)/);
  assert.match(camera,/if \(paused\) recording\.resume\(\);\s*else recording\.pause\(\);/);
  assert.match(camera,/event instanceof VideoRecordEvent\.Pause\) \{\s*paused = true;\s*pauseStartedAt = System\.currentTimeMillis\(\);\s*pauseButton\.setText\("繼續"\);/);
  assert.match(camera,/event instanceof VideoRecordEvent\.Resume\) \{\s*closePause\(\);/);
  assert.match(camera,/closePause\(\);\s*List<long\[\]> filePauses = new ArrayList<>\(pauses\);\s*pauses\.clear\(\);/);
  const worker=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/YouTubeUploadWorker.java',import.meta.url),'utf8');
  assert.match(worker,/RecordingTimeline\.timeline\(RecordingTimeline\.matchesFromRoom\(room\), entry\.startMs, entry\.endMs, entry\.pauses\)/);
});

test('keeps the recording status away from the top-left score board',()=>{
  assert.match(camera,/new FrameLayout\.LayoutParams\(-2, -2, Gravity\.BOTTOM \| Gravity\.CENTER_HORIZONTAL\);\s*recordingStage\.addView\(status, statusParams\)/);
  assert.doesNotMatch(camera,/recordingStage\.addView\(status, new FrameLayout\.LayoutParams\(-2, -2, Gravity\.TOP \| Gravity\.START\)\)/);
});
