import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('Android remote view no longer shows the remote photo or button guide',()=>{
  assert.doesNotMatch(index,/yunteng-remote-guide|android-remote-help|remote-help-card|遙控器按鍵說明/);
  assert.doesNotMatch(styles,/android-remote-help|remote-help-card|remote-key-label/);
  assert.equal(existsSync(new URL('../public/assets/yunteng-remote-guide.png',import.meta.url)),false);
});
