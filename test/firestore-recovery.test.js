import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRESTORE_RECOVERY_KEY,FIRESTORE_RECOVERY_REPEAT_MS,isFatalFirestoreError,nextFirestoreRecovery,readFirestoreRecovery} from '../src/firestore-recovery.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

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
  assert.match(main,/localCache:new URLSearchParams\(location\.search\)\.get\('androidRemote'\)==='1'\|\|firestoreRecovery\.memory\?memoryLocalCache\(\):persistentLocalCache/);
  assert.match(main,/function noteClientError\(kind,message,source=''\)\{[\s\S]*?if\(isFatalFirestoreError\(message\)\)recoverFromFatalFirestore\(\)/);
  const recover=main.match(/function recoverFromFatalFirestore\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(recover,/if\(firestoreRecoveryStarted\)return;firestoreRecoveryStarted=true;/);
  assert.match(recover,/persistMatchJournal\(\)/);
  assert.match(recover,/rememberFailedArchives\(state\.history\.filter\(row=>row\?\.matchId&&!archivedHistory\.some\(item=>item\.matchId===row\.matchId\)\)\)/);
  assert.match(recover,/localStorage\.setItem\(ERROR_LOG_KEY,JSON\.stringify\(errorLog\)\)/);
  assert.match(recover,/sessionStorage\.setItem\(FIRESTORE_RECOVERY_KEY,JSON\.stringify\(next\)\)/);
  assert.match(recover,/setTimeout\(\(\)=>location\.reload\(\),FIRESTORE_RECOVERY_DELAY_MS\)/);
});
