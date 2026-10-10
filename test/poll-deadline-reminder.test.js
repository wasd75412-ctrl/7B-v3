import test from 'node:test';
import assert from 'node:assert/strict';
import { isReminderDue, reminderStartMs, reminderTitle } from '../netlify/functions/poll-deadline-reminder.mjs';

const weeklyPoll={status:'open',deadlineAt:'2026-08-16T14:00:00.000Z',optionCount:14};
const saturdayNoon=Date.parse('2026-08-15T04:00:00.000Z');

test('reminds for a Sunday 22:00 Taipei deadline starting Saturday 12:00',()=>{
  assert.equal(reminderStartMs(weeklyPoll.deadlineAt),saturdayNoon);
  assert.equal(isReminderDue(weeklyPoll,'',saturdayNoon-60*1000),false);
  assert.equal(isReminderDue(weeklyPoll,'',saturdayNoon),true);
  assert.equal(isReminderDue(weeklyPoll,weeklyPoll.deadlineAt,saturdayNoon),false);
  assert.equal(isReminderDue(weeklyPoll,'',Date.parse(weeklyPoll.deadlineAt)),false);
  assert.equal(reminderTitle(weeklyPoll.deadlineAt,saturdayNoon),'🔥投票明日截止🔥');
});

test('uses the last Saturday 12:00 in Taipei before any other deadline',()=>{
  assert.equal(reminderStartMs('2026-08-15T15:00:00.000Z'),saturdayNoon);
  assert.equal(reminderStartMs('2026-08-15T04:00:00.000Z'),saturdayNoon-7*24*60*60*1000);
  assert.equal(reminderStartMs('2026-08-19T10:00:00.000Z'),saturdayNoon);
  assert.equal(reminderTitle('2026-08-15T15:00:00.000Z',saturdayNoon),'🔥投票今日截止🔥');
  assert.equal(reminderTitle('2026-08-19T10:00:00.000Z',saturdayNoon),'🔥投票即將截止🔥');
  const poll={status:'open',deadlineAt:'2026-08-19T10:00:00.000Z',optionCount:1};
  assert.equal(isReminderDue({...poll,status:'closed'},'',saturdayNoon),false);
  assert.equal(isReminderDue({...poll,optionCount:0},'',saturdayNoon),false);
  assert.equal(isReminderDue({...poll,deadlineAt:''},'',saturdayNoon),false);
});
