import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartPersistentVideoWakeLock, wakeLockButtonIntent } from '../src/wake-lock.js';

test('retries a remembered wake lock instead of turning it off',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:false}),'retry');
});

test('toggles an active or intentionally disabled wake lock',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:true}),'disable');
  assert.equal(wakeLockButtonIntent({wanted:false,active:false}),'enable');
});

test('starts the persistent video fallback on the first interaction on every device',()=>{
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:true,videoActive:false}),true);
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:false,videoActive:false}),false);
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:false,userActivated:true,videoActive:false}),false);
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:true,videoActive:true}),false);
});
