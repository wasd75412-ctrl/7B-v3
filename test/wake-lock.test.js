import test from 'node:test';
import assert from 'node:assert/strict';
import { wakeLockButtonIntent } from '../src/wake-lock.js';

test('retries a remembered wake lock instead of turning it off',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:false}),'retry');
});

test('toggles an active or intentionally disabled wake lock',()=>{
  assert.equal(wakeLockButtonIntent({wanted:true,active:true}),'disable');
  assert.equal(wakeLockButtonIntent({wanted:false,active:false}),'enable');
});
