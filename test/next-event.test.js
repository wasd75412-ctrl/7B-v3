import test from 'node:test';
import assert from 'node:assert/strict';
import { eventAnnouncementBody, roomAnnouncementFromDocument } from '../netlify/functions/event-announcement.mjs';
import { calculatePerPersonFee } from '../src/next-event.js';

test('calculates and rounds the per-person fee up',()=>{
  assert.equal(calculatePerPersonFee(2400,12),200);
  assert.equal(calculatePerPersonFee(2400,11),219);
});

test('does not calculate a fee without valid totals',()=>{
  assert.equal(calculatePerPersonFee(0,12),0);
  assert.equal(calculatePerPersonFee(2400,0),0);
  assert.equal(calculatePerPersonFee('invalid',12),0);
});

test('includes participant count in the event push message',()=>{
  assert.equal(
    eventAnnouncementBody({date:'2026-07-24',time:'01:00',endTime:'04:00',location:'立羽球館',participantCount:12,perPersonFee:200}),
    '7/24（週五） 01:00–04:00｜立羽球館｜預計 12 人｜每人 200 元'
  );
});

test('reads participant count from the stored event announcement',()=>{
  const room=roomAnnouncementFromDocument({fields:{nextEvent:{mapValue:{fields:{participantCount:{integerValue:'12'}}}}}});
  assert.equal(room.event.participantCount,12);
});
