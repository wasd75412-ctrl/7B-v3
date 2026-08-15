import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldOpenWeeklyPoll, taipeiWeekSchedule, weeklyPollFirestoreValue } from '../netlify/functions/lib/weekly-poll.mjs';

test('builds next week Monday through Sunday in Taipei with Saturday noon deadline',()=>{
  const now=Date.parse('2026-08-09T16:00:00.000Z'); // Monday 00:00 in Taipei
  const schedule=taipeiWeekSchedule(now);
  assert.equal(schedule.cycle,'2026-08-10');
  assert.equal(schedule.deadlineAt,'2026-08-15T04:00:00.000Z');
  assert.deepEqual(schedule.options.map(option=>option.date),['2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-22','2026-08-23']);
  assert.ok(schedule.options.every(option=>option.time==='01:00'&&option.endTime==='04:00'&&option.note==='立羽會館'));
});

test('opens once during the weekly voting window',()=>{
  const now=Date.parse('2026-08-10T03:00:00.000Z');
  assert.equal(shouldOpenWeeklyPoll({},now),true);
  const value=weeklyPollFirestoreValue(now);
  assert.equal(value.mapValue.fields.autoCycle.stringValue,'2026-08-10');
  assert.equal(shouldOpenWeeklyPoll({fields:{weeklyPollCycle:{stringValue:'2026-08-10'}}},now),false);
  assert.equal(shouldOpenWeeklyPoll({},Date.parse('2026-08-15T04:00:00.000Z')),false);
});
