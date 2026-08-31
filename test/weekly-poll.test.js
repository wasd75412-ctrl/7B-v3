import test from 'node:test';
import assert from 'node:assert/strict';
import { archivePollHistoryFirestoreValue, shouldOpenWeeklyPoll, taipeiWeekSchedule, weeklyPollFirestoreValue, weeklyPollPushPayload } from '../netlify/functions/lib/weekly-poll.mjs';

test('builds next week Monday through Sunday in Taipei with Saturday noon deadline',()=>{
  const now=Date.parse('2026-08-09T16:00:00.000Z'); // Monday 00:00 in Taipei
  const schedule=taipeiWeekSchedule(now);
  assert.equal(schedule.cycle,'2026-08-10');
  assert.equal(schedule.opensAt,'2026-08-10T04:00:00.000Z');
  assert.equal(schedule.deadlineAt,'2026-08-15T04:00:00.000Z');
  assert.equal(schedule.options.length,14);
  assert.deepEqual([...new Set(schedule.options.map(option=>option.date))],['2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-21','2026-08-22','2026-08-23']);
  for(const date of [...new Set(schedule.options.map(option=>option.date))]){
    const slots=schedule.options.filter(option=>option.date===date).map(option=>`${option.time}-${option.endTime}`);
    assert.deepEqual(slots,['01:00-04:00','11:00-13:00']);
  }
  assert.ok(schedule.options.filter(option=>option.time==='01:00').every(option=>option.note==='立羽會館'));
  assert.ok(schedule.options.filter(option=>option.time==='11:00').every(option=>option.note==='飛颺'));
  assert.equal(new Set(schedule.options.map(option=>option.id)).size,14);
});

test('opens once at Monday noon in Taipei during the weekly voting window',()=>{
  assert.equal(shouldOpenWeeklyPoll({},Date.parse('2026-08-10T03:59:59.999Z')),false);
  const now=Date.parse('2026-08-10T04:00:00.000Z');
  assert.equal(shouldOpenWeeklyPoll({},now),true);
  const value=weeklyPollFirestoreValue(now);
  assert.equal(value.mapValue.fields.autoCycle.stringValue,'2026-08-10');
  assert.equal(shouldOpenWeeklyPoll({fields:{weeklyPollCycle:{stringValue:'2026-08-10'}}},now),false);
  assert.equal(shouldOpenWeeklyPoll({},Date.parse('2026-08-15T04:00:00.000Z')),false);
});

test('announces the new weekly poll and links directly to voting',()=>{
  const payload=weeklyPollPushPayload({siteUrl:'https://example.com',roomId:'7B room',cycle:'2026-08-10'});
  assert.equal(payload.title,'🏸 新投票開始了');
  assert.equal(payload.body,'下週球局投票已開放，請前往投票。');
  assert.equal(payload.url,'https://example.com/?room=7B%20room&page=poll');
  assert.equal(payload.tag,'7b-weekly-poll-7B room-2026-08-10');
});

test('archives the previous poll before a new weekly poll overwrites it',()=>{
  const oldPoll={mapValue:{fields:{createdAt:{stringValue:'2026-08-24T04:00:00.000Z'},autoCycle:{stringValue:'2026-08-24'},options:{arrayValue:{values:[{mapValue:{fields:{id:{stringValue:'old-slot'}}}}]}},votes:{mapValue:{fields:{device:{stringValue:'old-slot'}}}}}}};
  const result=archivePollHistoryFirestoreValue({fields:{schedulePoll:oldPoll}},Date.parse('2026-08-31T04:00:00.000Z'));
  assert.equal(result.arrayValue.values.length,1);
  assert.equal(result.arrayValue.values[0].mapValue.fields.id.stringValue,'2026-08-24');
  assert.equal(result.arrayValue.values[0].mapValue.fields.votes.mapValue.fields.device.stringValue,'old-slot');
});
