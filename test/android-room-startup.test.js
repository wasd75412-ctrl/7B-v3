import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('Android remote remembers its room and loads authoritative server match state',()=>{
  assert.match(source,/else if\(!skipAutoOnce&&localStorage\.getItem\(ROOM_AUTO_KEY\)==='1'\)/);
  assert.match(source,/if\(lastId\)setTimeout\(\(\)=>openSavedRoom\(lastId\),180\)/);
  assert.match(source,/getDocFromServer\(ref\)/);
  assert.match(source,/get\('androidRemote'\)==='1'\?memoryLocalCache\(\)/);
  assert.match(source,/if\(liveScoreSnapshotFromCache&&\(liveServerReady\|\|requestedAndroidRemote\)\)/);
});
