import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_UPDATE_IDLE_MS, canReloadForUpdate, isNewerVersion, shouldAdoptVersion } from '../src/app-update.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const viteConfig=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');

test('only a strictly newer deployed version counts as an update',()=>{
  assert.equal(isNewerVersion('3.2.22','3.2.21'),true);
  assert.equal(isNewerVersion('3.3.0','3.2.49'),true);
  assert.equal(isNewerVersion('4.0.0','3.9.49'),true);
  assert.equal(isNewerVersion('3.2.21','3.2.21'),false);
  assert.equal(isNewerVersion('3.2.20','3.2.21'),false);
  assert.equal(isNewerVersion('','3.2.21'),false);
  assert.equal(isNewerVersion('3.2.x','3.2.21'),false);
});

test('a tab tries each deployed version once so a stale cache cannot loop reloads',()=>{
  assert.equal(shouldAdoptVersion('3.2.22','3.2.21',''),true);
  assert.equal(shouldAdoptVersion('3.2.22','3.2.21','3.2.22'),false);
  assert.equal(shouldAdoptVersion('3.2.23','3.2.21','3.2.22'),true);
});

test('the page reloads only when nothing is in progress',()=>{
  const idle={idleMs:APP_UPDATE_IDLE_MS};
  assert.equal(canReloadForUpdate(idle),true);
  assert.equal(canReloadForUpdate({hidden:true}),true);
  assert.equal(canReloadForUpdate({idleMs:APP_UPDATE_IDLE_MS-1}),false,'recent touch or key press');
  assert.equal(canReloadForUpdate({...idle,matchInPlay:true}),false);
  assert.equal(canReloadForUpdate({...idle,scoreVisible:true}),false);
  assert.equal(canReloadForUpdate({...idle,modalOpen:true}),false);
  assert.equal(canReloadForUpdate({...idle,editing:true}),false);
  assert.equal(canReloadForUpdate({hidden:true,matchInPlay:true}),false);
});

test('the build publishes a tiny version file that is always revalidated',()=>{
  assert.match(viteConfig,/fileName: 'version\.json', source: JSON\.stringify\(\{ version \}\)/);
  assert.match(headers,/\/version\.json\s+Cache-Control: no-cache/);
});

test('open pages check for a newer version and reload once pending writes are flushed',()=>{
  assert.match(main,/fetch\('\.\/version\.json',\{cache:'no-cache'\}\)/);
  assert.match(main,/if\(pendingAppVersion\|\|!location\.protocol\.startsWith\('http'\)\|\|!navigator\.onLine\|\|matchInPlay\(state\.match\)\)return;/);
  assert.match(main,/modalOpen:!!document\.querySelector\('\.modal:not\(\.hidden\)'\)/);
  assert.match(main,/const flushed=ready&&await Promise\.race\(\[waitForPendingWrites\(db\)\.then\(\(\)=>true,\(\)=>false\),wait\(5000\)\.then\(\(\)=>false\)\]\);/);
  assert.match(main,/sessionStorage\.setItem\(APP_UPDATE_ATTEMPT_KEY,pendingAppVersion\);\s*location\.reload\(\);/);
  assert.match(main,/setInterval\(checkForAppUpdate,APP_UPDATE_CHECK_MS\);/);
});
