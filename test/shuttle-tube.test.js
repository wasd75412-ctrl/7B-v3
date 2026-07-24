import test from 'node:test';
import assert from 'node:assert/strict';
import { createShuttleTube, setShuttlePayment, shuttlePaymentStatus } from '../src/shuttle-tube.js';

test('tracks paid players separately from unpaid players',()=>{
  const tube=createShuttleTube({id:'tube-1',name:'AS-30',price:950,createdAt:'2026-07-24T01:00:00.000Z'});
  const paid=setShuttlePayment(tube,'p1',true,{paidAt:'2026-07-24T02:00:00.000Z',historyCount:1});
  assert.equal(shuttlePaymentStatus(paid,[],'p1'),'paid-waiting');
  assert.equal(shuttlePaymentStatus(paid,[],'p2'),'unpaid');
});

test('changes a paid player to played after a later match',()=>{
  const tube=setShuttlePayment(
    createShuttleTube({id:'tube-1',name:'AS-30',price:950,createdAt:'2026-07-24T01:00:00.000Z'}),
    'p1',
    true,
    {paidAt:'2026-07-24T02:00:00.000Z',historyCount:1}
  );
  const history=[
    {endedAt:'2026-07-24T01:30:00.000Z',teams:[['p1','p2'],['p3','p4']]},
    {endedAt:'2026-07-24T03:00:00.000Z',teams:[['p1','p3'],['p2','p4']]}
  ];
  assert.equal(shuttlePaymentStatus(tube,history,'p1'),'paid-played');
});
