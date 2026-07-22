import test from 'node:test';
import assert from 'node:assert/strict';
import { canAutoSyncPlayerIdentity } from '../src/device-sync.js';

test('allows identity sync only from a confirmed server snapshot',()=>{
  assert.equal(canAutoSyncPlayerIdentity({roomReady:true,hasIdentity:true}),true);
});

test('blocks identity writes from stale cache or pending local data',()=>{
  assert.equal(canAutoSyncPlayerIdentity({roomReady:true,hasIdentity:true,fromCache:true}),false);
  assert.equal(canAutoSyncPlayerIdentity({roomReady:true,hasIdentity:true,hasPendingWrites:true}),false);
});

test('blocks identity sync without a room or device identity',()=>{
  assert.equal(canAutoSyncPlayerIdentity({hasIdentity:true}),false);
  assert.equal(canAutoSyncPlayerIdentity({roomReady:true}),false);
  assert.equal(canAutoSyncPlayerIdentity({roomReady:true,hasIdentity:true,syncing:true}),false);
});
