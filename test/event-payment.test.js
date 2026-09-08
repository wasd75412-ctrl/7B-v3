import test from 'node:test';
import assert from 'node:assert/strict';
import { eventPaymentStatus, normalizeEventPayments, pendingEventPaymentPlayerIds, updateEventPayment } from '../src/event-payment.js';

test('球友繳費回報綁定球局內的球員並先進入待確認',()=>{
  const event=updateEventPayment({id:'event-1'},'player-1','pending','2026-09-08T10:00:00.000Z');
  assert.equal(eventPaymentStatus(event,'player-1'),'pending');
  assert.deepEqual(pendingEventPaymentPlayerIds(event),['player-1']);
});

test('管理員可確認或取消單一球員繳費且不影響其他人',()=>{
  let event={id:'event-1',payments:{p1:{status:'pending',reportedAt:'a'},p2:{status:'confirmed',reportedAt:'b',confirmedAt:'c'}}};
  event=updateEventPayment(event,'p1','confirmed','d');
  assert.equal(eventPaymentStatus(event,'p1'),'confirmed');
  assert.equal(eventPaymentStatus(event,'p2'),'confirmed');
  event=updateEventPayment(event,'p1','unpaid');
  assert.equal(eventPaymentStatus(event,'p1'),'unpaid');
  assert.equal(eventPaymentStatus(event,'p2'),'confirmed');
});

test('無效繳費資料不會進入球局狀態',()=>{
  assert.deepEqual(normalizeEventPayments({p1:{status:'unknown'},'':{status:'pending'},p2:{status:'confirmed'}}),{p2:{status:'confirmed',reportedAt:'',confirmedAt:''}});
});
