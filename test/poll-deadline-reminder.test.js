import test from 'node:test';
import assert from 'node:assert/strict';
import { isReminderDue, reminderLeadMs } from '../netlify/functions/poll-deadline-reminder.mjs';

const weeklyPoll={status:'open',deadlineAt:'2026-08-15T15:00:00.000Z',optionCount:14};
const fridayNoon=Date.parse('2026-08-14T04:00:00.000Z');

test('reminds for a Saturday 23:00 Taipei deadline starting Friday 12:00',()=>{
  assert.equal(reminderLeadMs(weeklyPoll.deadlineAt),35*60*60*1000);
  assert.equal(isReminderDue(weeklyPoll,'',fridayNoon-60*1000),false);
  assert.equal(isReminderDue(weeklyPoll,'',fridayNoon),true);
  assert.equal(isReminderDue(weeklyPoll,weeklyPoll.deadlineAt,fridayNoon),false);
  assert.equal(isReminderDue(weeklyPoll,'',Date.parse(weeklyPoll.deadlineAt)),false);
});

test('keeps a 24-hour reminder for deadlines that are not the weekly Saturday night close',()=>{
  const deadlineAt='2026-08-16T10:00:00.000Z';
  const poll={status:'open',deadlineAt,optionCount:1};
  assert.equal(reminderLeadMs(deadlineAt),24*60*60*1000);
  assert.equal(isReminderDue(poll,'',Date.parse(deadlineAt)-35*60*60*1000),false);
  assert.equal(isReminderDue(poll,'',Date.parse(deadlineAt)-24*60*60*1000),true);
  assert.equal(isReminderDue({...poll,status:'closed'},'',Date.parse(deadlineAt)-60*1000),false);
  assert.equal(isReminderDue({...poll,optionCount:0},'',Date.parse(deadlineAt)-60*1000),false);
});
