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

test('places chat second and marks court as hidden for viewers',()=>{
  const pages=[...nav.matchAll(/data-page="(\d+)"/g)].map(match=>match[1]);
  assert.deepEqual(pages.slice(0,2),['0','8']);
  assert.match(nav,/class="tab viewer-hidden-tab" data-page="3">場上/);
});

test('opens backup center from the more menu',()=>{
  assert.match(html,/id="backupCenterBtn"[^>]*>☁️ 備份中心<\/button>/);
});

test('opens admin shuttle tube management from the more menu',()=>{
  assert.match(html,/id="shuttleTubeManagerBtn"[^>]*host-only[^>]*>🏸 球桶管理<\/button>/);
  assert.match(html,/id="shuttleTubeModal"/);
});

test('chat identity is claimed and cannot be selected from a player list',()=>{
  assert.match(html,/id="chatIdentity"/);
  assert.match(html,/id="chatClaimHelp"/);
  assert.doesNotMatch(html,/id="chatPlayer"/);
});
