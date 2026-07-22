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

test('starts the persistent video fallback on the first Apple touch interaction',()=>{
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:true,appleTouchDevice:true,videoActive:false}),true);
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:false,appleTouchDevice:true,videoActive:false}),false);
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:true,appleTouchDevice:false,videoActive:false}),false);
  assert.equal(shouldStartPersistentVideoWakeLock({wanted:true,userActivated:true,appleTouchDevice:true,videoActive:true}),false);
});
