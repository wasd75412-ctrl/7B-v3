import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('keeps the recording controls inside the Android remote view container',()=>{
  const view=index.match(/<section id="androidRemoteView"[^>]*>([\s\S]*?)<\/section>/)?.[1]||'';
  assert.match(view,/id="androidRemoteRecording"/);
  assert.match(view,/id="androidRemoteOpenBroadcast"/);
  assert.match(view,/id="androidLocalHub"/);
  assert.match(view,/id="androidRemoteMatch"/);
});

test('Android remote view no longer shows the remote photo or button guide',()=>{
  assert.doesNotMatch(index,/yunteng-remote-guide|android-remote-help|remote-help-card|遙控器按鍵說明/);
  assert.doesNotMatch(styles,/android-remote-help|remote-help-card|remote-key-label/);
  assert.equal(existsSync(new URL('../public/assets/yunteng-remote-guide.png',import.meta.url)),false);
});
