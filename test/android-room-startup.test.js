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

test('Android console loads the current Cloudflare site and reopens the saved room',()=>{
  assert.match(activity,/APP_HOST = "7b-v3\.pages\.dev"/);
  assert.doesNotMatch(activity,/netlify\.app/);
  assert.match(activity,/webView\.loadUrl\(startUrl\(\)\)/);
  assert.match(activity,/APP_URL \+ "&room=" \+ roomId/);
});

test('Android console draws only the latest score after resuming from recording',()=>{
  assert.match(source,/if\(requestedAndroidRemote\)scheduleAndroidRemoteRender\(true\);else\{applying=true;renderAll\(\);applying=false\}/);
  assert.match(source,/if\(requestedAndroidRemote\)scheduleAndroidRemoteRender\(\);else\{applying=true;renderScore\(\);renderDashboard\(\);renderAndroidRemote\(\);applying=false\}/);
  assert.match(source,/function scheduleAndroidRemoteRender\(full=false\)\{[\s\S]*?if\(androidRemoteRenderFrame\)return;[\s\S]*?requestAnimationFrame/);
});

test('Android warms Firestore before the first remote press on every input surface',()=>{
  assert.match(activity,/onResume\(\)[\s\S]*?scoreController\(\)\.warmUp/);
  assert.match(service,/onServiceConnected\(\)[\s\S]*?scoreController\(\)\.warmUp/);
  assert.match(camera,/onCreate\(Bundle state\)[\s\S]*?remoteScoreController\.warmUp/);
});
