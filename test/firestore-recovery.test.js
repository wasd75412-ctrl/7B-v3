import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRESTORE_RECOVERY_KEY,FIRESTORE_RECOVERY_REPEAT_MS,isFatalFirestoreError,nextFirestoreRecovery,readFirestoreRecovery,usesWebKitStorage} from '../src/firestore-recovery.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('every iPad, iPhone and Safari browser skips the IndexedDB cache',()=>{
  const ipadDesktop='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
  assert.equal(usesWebKitStorage({userAgent:ipadDesktop,platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(usesWebKitStorage({userAgent:ipadDesktop,platform:'MacIntel',maxTouchPoints:0}),true);
  assert.equal(usesWebKitStorage({userAgent:'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1'}),true);
  assert.equal(usesWebKitStorage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(usesWebKitStorage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',platform:'MacIntel',maxTouchPoints:0}),false);
  assert.equal(usesWebKitStorage({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',platform:'Win32'}),false);
  assert.equal(usesWebKitStorage({userAgent:'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36'}),false);
  assert.equal(usesWebKitStorage(),false);
});

test('recognizes the Firestore states that never recover without a reload',()=>{
  assert.equal(isFatalFirestoreError('Error: FIRESTORE (12.15.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) CONTEXT: {"el":"Error storing new key generator value in database"}'),true);
  assert.equal(isFatalFirestoreError('[2026-10-14T18:00:34.490Z] @firebase/firestore: Firestore (12.15.0): INTERNAL UNHANDLED ERROR: Error storing new key generator value in database'),true);
  assert.equal(isFatalFirestoreError('@firebase/firestore: Firestore (12.15.0): WebChannelConnection RPC \'Listen\' stream transport errored.'),false);
  assert.equal(isFatalFirestoreError('網路較慢，指令排隊中'),false);
  assert.equal(isFatalFirestoreError(''),false);
});

test('reloads with the disk cache first and drops it only when the failure returns quickly',()=>{
  const now=Date.parse('2026-10-14T18:00:35Z');
  assert.deepEqual(nextFirestoreRecovery({at:0,memory:false},now),{at:now,memory:false});
  assert.deepEqual(nextFirestoreRecovery({at:now-FIRESTORE_RECOVERY_REPEAT_MS-1,memory:false},now),{at:now,memory:false});
  assert.deepEqual(nextFirestoreRecovery({at:now-60_000,memory:false},now),{at:now,memory:true});
  assert.equal(nextFirestoreRecovery({at:now-60_000,memory:true},now),null);
  assert.deepEqual(nextFirestoreRecovery({at:now-FIRESTORE_RECOVERY_REPEAT_MS-1,memory:true},now),{at:now,memory:true});
});

test('reads a missing or damaged recovery marker as no previous recovery',()=>{
  const storage=value=>({getItem:key=>key===FIRESTORE_RECOVERY_KEY?value:null});
  assert.deepEqual(readFirestoreRecovery(storage(null)),{at:0,memory:false});
  assert.deepEqual(readFirestoreRecovery(storage('{bad')),{at:0,memory:false});
  assert.deepEqual(readFirestoreRecovery(storage('{"at":5,"memory":true}')),{at:5,memory:true});
  assert.deepEqual(readFirestoreRecovery({getItem(){throw new Error('blocked')}}),{at:0,memory:false});
});

test('the scorer saves its local copies and reloads once Firestore is dead',()=>{
  assert.match(main,/const firestoreRecovery=readFirestoreRecovery\(globalThis\.sessionStorage\);/);
  assert.match(main,/localCache:new URLSearchParams\(location\.search\)\.get\('androidRemote'\)==='1'\|\|firestoreRecovery\.memory\|\|usesWebKitStorage\(navigator\)\?memoryLocalCache\(\):persistentLocalCache/);
  assert.match(main,/function noteClientError\(kind,message,source=''\)\{[\s\S]*?if\(isFatalFirestoreError\(message\)\)recoverFromFatalFirestore\(\)/);
  const recover=main.match(/function recoverFromFatalFirestore\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(recover,/if\(firestoreRecoveryStarted\)return;firestoreRecoveryStarted=true;/);
  assert.match(recover,/persistMatchJournal\(\);persistHostSnapshot\(\)/);
  assert.match(recover,/rememberFailedArchives\(state\.history\.filter\(row=>row\?\.matchId&&!archivedHistory\.some\(item=>item\.matchId===row\.matchId\)\)\)/);
  assert.match(recover,/localStorage\.setItem\(ERROR_LOG_KEY,JSON\.stringify\(errorLog\)\)/);
  assert.match(recover,/sessionStorage\.setItem\(FIRESTORE_RECOVERY_KEY,JSON\.stringify\(next\)\)/);
  assert.match(recover,/setTimeout\(\(\)=>location\.reload\(\),FIRESTORE_RECOVERY_DELAY_MS\)/);
});
