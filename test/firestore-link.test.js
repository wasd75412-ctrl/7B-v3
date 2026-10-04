import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRESTORE_LINK_COOLDOWN_MS, FIRESTORE_LINK_IDLE_MS, FIRESTORE_LINK_INTERVAL_MS, FIRESTORE_LINK_LIVE_IDLE_MS, FIRESTORE_LINK_PENDING_WRITE_MS, FIRESTORE_LINK_TIMEOUT_MS, firestoreLinkProbeVerdict, shouldProbeFirestoreLink } from '../src/firestore-link.js';

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('probes a visible room only after the listeners go quiet',()=>{
  const now=10*FIRESTORE_LINK_IDLE_MS;
  const ready={online:true,hidden:false,roomReady:true,now,lastServerActivityAt:now-FIRESTORE_LINK_IDLE_MS};
  assert.equal(shouldProbeFirestoreLink(ready),true);
  assert.equal(shouldProbeFirestoreLink({...ready,lastServerActivityAt:now-FIRESTORE_LINK_IDLE_MS+1}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,lastProbeAt:now-FIRESTORE_LINK_IDLE_MS+1}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,hidden:true}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,online:false}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,roomReady:false}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,probeInFlight:true}),false);
  assert.equal(shouldProbeFirestoreLink({...ready,cooldownUntil:now+1}),false);
});

test('a live match is probed sooner, and only while no server events arrive',()=>{
  const now=10*FIRESTORE_LINK_IDLE_MS,live={online:true,roomReady:true,now,matchLive:true};
  assert.equal(shouldProbeFirestoreLink({...live,lastServerActivityAt:now-FIRESTORE_LINK_LIVE_IDLE_MS}),true);
  assert.equal(shouldProbeFirestoreLink({...live,lastServerActivityAt:now-FIRESTORE_LINK_LIVE_IDLE_MS+1}),false);
  assert.equal(shouldProbeFirestoreLink({...live,matchLive:false,lastServerActivityAt:now-FIRESTORE_LINK_LIVE_IDLE_MS}),false);
});

test('writes stuck without a server ack are probed on the short interval',()=>{
  const now=10*FIRESTORE_LINK_IDLE_MS,busy={online:true,roomReady:true,now,lastServerActivityAt:now};
  assert.equal(shouldProbeFirestoreLink({...busy,pendingWritesSince:now-FIRESTORE_LINK_PENDING_WRITE_MS}),true);
  assert.equal(shouldProbeFirestoreLink({...busy,pendingWritesSince:now-FIRESTORE_LINK_PENDING_WRITE_MS+1}),false);
  assert.equal(shouldProbeFirestoreLink({...busy,pendingWritesSince:now-FIRESTORE_LINK_PENDING_WRITE_MS,lastProbeAt:now-FIRESTORE_LINK_INTERVAL_MS+1}),false);
});

test('a healthy idle viewer costs at most one probe read per idle window',()=>{
  const reads=[];let lastProbeAt=0;
  for(let now=FIRESTORE_LINK_IDLE_MS;now<=FIRESTORE_LINK_IDLE_MS+60*60*1000;now+=1000){
    if(shouldProbeFirestoreLink({online:true,roomReady:true,now,lastProbeAt}))reads.push(lastProbeAt=now);
  }
  assert.ok(reads.length<=Math.ceil(60*60*1000/FIRESTORE_LINK_IDLE_MS)+1);
  assert.match(mainSource,/lastServerActivityAt:firestoreLinkServerActivityAt/);
  assert.match(mainSource,/pendingWritesSince:firestoreLinkPendingWritesSince/);
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
