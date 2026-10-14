import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../android-remote/app/src/main/java/tw/club7b/scoreremote/${path}`,import.meta.url),'utf8');
const camera=read('LoopCameraActivity.java');
const imports=read('RecordingImports.java');
const store=read('RecordingUploadStore.java');
const recordings=read('RecordingsActivity.java');

test('a recording stopped by leaving the camera screen is still queued for upload',()=>{
  assert.match(camera,/boolean success = savedUri != null && !android\.net\.Uri\.EMPTY\.equals\(savedUri\)\s*&& FinishedRecording\.keepsFootage\(finalized\.hasError\(\), finalized\.getError\(\)\);/);
  assert.match(camera,/if \(finalized\.hasError\(\)\) \{\s*ErrorLog\.record\(this, "recording", "錄影結束代碼 " \+ finalized\.getError\(\), finalized\.getCause\(\)\);/);
  assert.match(camera,/if \(success\) queueSavedRecording\(savedUri, fileStartedAt, fileEndedAt, filePauses\);/);
});

test('merged videos staged by adb join the upload queue without extra screens',()=>{
  assert.match(imports,/app\.getExternalFilesDir\(FOLDER\)/);
  assert.match(imports,/name\.endsWith\("\.json"\)/);
  assert.match(imports,/Environment\.DIRECTORY_MOVIES \+ "\/7B控制台\/比賽轉播"/);
  assert.match(imports,/RecordingUploadStore\.addMerged\(app, saved, manifest\.optString\("roomId"\), startMs, endMs, pauses\)/);
  assert.match(imports,/YouTubeUploadScheduler\.scheduleIfPending\(app\);/);
  assert.match(recordings,/RecordingImports\.run\(this, \(\) -> handler\.post\(\(\) -> renderList\(true\)\)\);/);
  assert.match(store,/if \(supersededBy\(entries\.get\(i\), startMs, endMs\)\) entries\.remove\(i\);/);
  assert.match(store,/entry\.status != Status\.UPLOADED/);
});

test('a piece still uploading cannot overwrite the merged video that replaced it',()=>{
  assert.match(store,/return a\.id\.equals\(b\.id\) && a\.uri\.equals\(b\.uri\);/);
  assert.match(store,/if \(sameRecording\(entries\.get\(i\), updated\)\) \{/);
});
