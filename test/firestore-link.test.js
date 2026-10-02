import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRESTORE_LINK_COOLDOWN_MS, FIRESTORE_LINK_INTERVAL_MS, FIRESTORE_LINK_TIMEOUT_MS, firestoreLinkProbeVerdict, shouldProbeFirestoreLink } from '../src/firestore-link.js';

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('probes a visible room on a steady interval',()=>{
  const ready={online:true,hidden:false,roomReady:true,now:FIRESTORE_LINK_INTERVAL_MS};
  assert.equal(shouldProbeFirestoreLink(ready),true);
  assert.equal(shouldProbeFirestoreLink({...ready,lastProbeAt:1}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,hidden:true}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,online:false}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,roomReady:false}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,probeInFlight:true}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,cooldownUntil:FIRESTORE_LINK_INTERVAL_MS+1}),false);
});

test('treats a hung or unreachable server read as a stuck listen socket',()=>{
  assert.equal(firestoreLinkProbeVerdict({timedOut:true}),'stuck');
  assert.equal(firestoreLinkProbeVerdict({errorCode:'unavailable'}),'stuck');
  assert.equal(firestoreLinkProbeVerdict({errorCode:'firestore/deadline-exceeded'}),'stuck');
  assert.equal(firestoreLinkProbeVerdict({}),'up');
  assert.equal(firestoreLinkProbeVerdict({errorCode:'permission-denied'}),'up');
  assert.equal(FIRESTORE_LINK_TIMEOUT_MS,4000);
  assert.equal(FIRESTORE_LINK_COOLDOWN_MS,10000);
});

test('kicks a stuck iPad listen socket and shows reconnecting on the score badge',()=>{
  assert.match(mainSource,/getDocFromServer\(ref\)/);
  assert.match(mainSource,/await disableNetwork\(db\)/);
  assert.match(mainSource,/await enableNetwork\(db\)/);
  assert.match(mainSource,/firestoreLinkRecovering\)\{setSync\('重新連線中','pending'\)/);
  assert.match(mainSource,/recoveringBadge\.textContent='重新連線'/);
  assert.match(mainSource,/visibilitychange[\s\S]*?recoverFirestoreLink\(\)/);
});
