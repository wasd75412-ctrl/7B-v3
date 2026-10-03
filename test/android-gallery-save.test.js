import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('records broadcast video straight into MediaStore without temporary clips',()=>{
  assert.match(source,/new MediaStoreOutputOptions\.Builder\(/);
  assert.match(source,/Environment\.DIRECTORY_MOVIES \+ "\/7B羽球"/);
  assert.doesNotMatch(source,/FileOutputOptions|MediaMuxer|mergeSegments|persistSegments|SEGMENT_LIMIT/);
});
