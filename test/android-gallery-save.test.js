import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('writes the merged replay directly to MediaStore without a second full copy',()=>{
  assert.match(source,/mergeDirectlyToGallery\(snapshot, group\)/);
  assert.match(source,/new MediaMuxer\(destination\.getFileDescriptor\(\)/);
  assert.doesNotMatch(source,/FileInputStream|copyToGallery/);
});
