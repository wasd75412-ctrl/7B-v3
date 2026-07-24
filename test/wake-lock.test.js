import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldRequestNativeWakeLock, wakeLockButtonIntent, wakeLockControlIsActive } from '../src/wake-lock.js';

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const packageSource=readFileSync(new URL('../package.json',import.meta.url),'utf8');

test('retries a remembered wake lock instead of turning it off',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:false}),'retry');
});

test('toggles an active or intentionally disabled wake lock',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:true}),'disable');
  assert.equal(wakeLockButtonIntent({wanted:false,active:false}),'enable');
});

test('allows an unsupported device to turn off a remembered wake lock preference',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:false,supported:false}),'disable');
});

test('only treats a real native wake lock as active',()=>{
  assert.equal(wakeLockControlIsActive({nativeActive:false}),false);
  assert.equal(wakeLockControlIsActive({nativeActive:true}),true);
});

test('does not create or bundle a video-based wake lock fallback',()=>{
  assert.doesNotMatch(mainSource,/createElement\(['"]video['"]\)|nosleep|fallbackNoSleep/i);
  assert.doesNotMatch(packageSource,/nosleep/i);
});

test('keeps requesting the native wake lock when it is missing',()=>{
  assert.equal(shouldRequestNativeWakeLock({wanted:true,nativeSupported:true,nativeActive:false,requestPending:false}),true);
  assert.equal(shouldRequestNativeWakeLock({wanted:true,nativeSupported:true,nativeActive:true,requestPending:false}),false);
  assert.equal(shouldRequestNativeWakeLock({wanted:true,nativeSupported:true,nativeActive:false,requestPending:true}),false);
  assert.equal(shouldRequestNativeWakeLock({wanted:true,hidden:true,nativeSupported:true,nativeActive:false,requestPending:false}),false);
});
