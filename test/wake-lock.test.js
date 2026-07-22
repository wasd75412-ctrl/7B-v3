import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequestNativeWakeLock, shouldStartPersistentVideoWakeLock, wakeLockButtonIntent, wakeLockControlIsActive } from '../src/wake-lock.js';

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

test('does not treat the video fallback as confirmed when native wake lock is supported',()=>{
  assert.equal(wakeLockControlIsActive({nativeSupported:true,nativeActive:false,fallbackActive:true}),false);
  assert.equal(wakeLockControlIsActive({nativeSupported:true,nativeActive:true,fallbackActive:true}),true);
  assert.equal(wakeLockControlIsActive({nativeSupported:false,nativeActive:false,fallbackActive:true}),true);
});

test('keeps requesting native wake lock even while the video fallback is playing',()=>{
  assert.equal(shouldRequestNativeWakeLock({wanted:true,nativeSupported:true,nativeActive:false,requestPending:false}),true);
  assert.equal(shouldRequestNativeWakeLock({wanted:true,nativeSupported:true,nativeActive:true,requestPending:false}),false);
  assert.equal(shouldRequestNativeWakeLock({wanted:true,nativeSupported:true,nativeActive:false,requestPending:true}),false);
  assert.equal(shouldRequestNativeWakeLock({wanted:true,hidden:true,nativeSupported:true,nativeActive:false,requestPending:false}),false);
});
