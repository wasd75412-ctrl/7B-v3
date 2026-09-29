import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('Android remote view explains every YUNTENG button with the supplied photo',()=>{
  assert.match(index,/yunteng-remote-guide\.png/);
  assert.match(index,/＋／− 任一鍵[\s\S]*?快速連按兩下：正式開始比賽[\s\S]*?比賽結束後按一下：進入下一場/);
  assert.match(index,/＋ 加號鍵[\s\S]*?遠端球場加分/);
  assert.match(index,/− 減號鍵[\s\S]*?靠近觀眾席球場加分/);
  assert.match(index,/📷 相機鍵[\s\S]*?點擊一下：撤回一分[\s\S]*?點擊兩下：使用一顆球[\s\S]*?長按：加回一顆球/);
  assert.match(styles,/\.remote-key-label\.minus[\s\S]*?\.remote-key-label\.plus[\s\S]*?\.remote-key-label\.camera/);
});
