import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const activity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const service=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const camera=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LoopCameraActivity.java',import.meta.url),'utf8');

test('Android remote remembers its room and loads authoritative server match state',()=>{
  assert.match(source,/else if\(!skipAutoOnce&&localStorage\.getItem\(ROOM_AUTO_KEY\)==='1'\)/);
  assert.match(source,/if\(lastId\)setTimeout\(\(\)=>openSavedRoom\(lastId\),180\)/);
  assert.match(source,/getDocFromServer\(ref\)/);
  assert.match(source,/get\('androidRemote'\)==='1'\?memoryLocalCache\(\)/);
  assert.match(source,/if\(liveScoreSnapshotFromCache&&\(liveServerReady\|\|requestedAndroidRemote\)\)/);
});

test('Android warms Firestore before the first remote press on every input surface',()=>{
  assert.match(activity,/onResume\(\)[\s\S]*?scoreController\(\)\.warmUp/);
  assert.match(service,/onServiceConnected\(\)[\s\S]*?scoreController\(\)\.warmUp/);
  assert.match(camera,/onCreate\(Bundle state\)[\s\S]*?remoteScoreController\.warmUp/);
});
