import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('records broadcast video straight into MediaStore without temporary clips',()=>{
  assert.match(source,/new MediaStoreOutputOptions\.Builder\(/);
  assert.match(source,/Environment\.DIRECTORY_MOVIES \+ "\/7B控制台\/比賽轉播"/);
  assert.match(source,/Environment\.getExternalStoragePublicDirectory\(Environment\.DIRECTORY_MOVIES\)/);
  assert.match(source,/"7B控制台\/比賽轉播"/);
  assert.match(source,/MediaStore\.Video\.Media\.DATA, new File\(outputDirectory, displayName\)\.getAbsolutePath\(\)/);
  assert.match(source,/MediaStore\.Video\.Media\.DATE_TAKEN, capturedAt/);
  assert.match(source,/MediaStore\.Video\.Media\.DATE_ADDED, capturedAt \/ 1000L/);
  assert.match(source,/MediaStore\.Video\.Media\.DATE_MODIFIED, capturedAt \/ 1000L/);
  assert.doesNotMatch(source,/FileOutputOptions|MediaMuxer|mergeSegments|persistSegments|SEGMENT_LIMIT/);
});

test('finishes the recording screen before upload bookkeeping can block the main thread',()=>{
  assert.match(source,/private final ExecutorService savedRecordingExecutor = Executors\.newSingleThreadExecutor\(\);/);
  assert.match(source,/if \(success\) queueSavedRecording\(savedUri, fileStartedAt, fileEndedAt, filePauses\);/);
  assert.match(source,/savedRecordingExecutor\.execute\(\(\) -> \{/);
  assert.match(source,/savedRecordingExecutor\.shutdown\(\);/);
});
