import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEST_MODE_IDLE_MS, testModeIdleExpired, testModeLastActiveMs, testModeOn } from '../src/test-mode.js';

const enabledAt=Date.parse('2026-10-10T07:36:01.000Z');

test('keeps test mode on while it was used within the idle window',()=>{
  const room={testMode:true,testModeRevision:enabledAt,testModeActiveAt:0};
  assert.equal(testModeOn(room,enabledAt+TEST_MODE_IDLE_MS-1),true);
  assert.equal(testModeIdleExpired(room,enabledAt+TEST_MODE_IDLE_MS-1),false);
});

test('turns test mode off after an hour without test activity',()=>{
  const room={testMode:true,testModeRevision:enabledAt,testModeActiveAt:0};
  assert.equal(TEST_MODE_IDLE_MS,60*60*1000);
  assert.equal(testModeIdleExpired(room,enabledAt+TEST_MODE_IDLE_MS),true);
  assert.equal(testModeOn(room,enabledAt+TEST_MODE_IDLE_MS),false);
});

test('extends the idle window from the latest test match activity',()=>{
  const activeAt=enabledAt+50*60*1000,room={testMode:true,testModeRevision:enabledAt,testModeActiveAt:activeAt};
  assert.equal(testModeLastActiveMs(room),activeAt);
  assert.equal(testModeOn(room,enabledAt+TEST_MODE_IDLE_MS+60*1000),true);
  assert.equal(testModeIdleExpired(room,activeAt+TEST_MODE_IDLE_MS),true);
});

test('is off by default and never expires when already off',()=>{
  assert.equal(testModeOn({}),false);
  assert.equal(testModeIdleExpired({testMode:false,testModeRevision:0}),false);
});

test('persists test mode fields with the new-match checkpoint so turning it off sticks',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/testMode:!!state\.testMode,testModeRevision:Number\(state\.testModeRevision\)\|\|0,testModeActiveAt:Number\(state\.testModeActiveAt\)\|\|0,\.\.\.checkpoint\.room/);
  assert.match(source,/testMode:false,testModeRevision:0,testModeActiveAt:0,/);
  assert.match(source,/testMode:testModeOn\(state\),scorerDevice:scoreDeviceId/);
});
