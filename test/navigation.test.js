import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nav=html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/)?.[1]||'';

test('keeps exactly eight primary navigation tabs',()=>{
  assert.equal((nav.match(/class="tab/g)||[]).length,8);
});

test('keeps chat in primary navigation and removes backup from it',()=>{
  assert.match(nav,/data-page="8">聊天/);
  assert.doesNotMatch(nav,/data-page="7"/);
});

test('opens backup center from the more menu',()=>{
  assert.match(html,/id="backupCenterBtn"[^>]*>☁️ 備份中心<\/button>/);
});
