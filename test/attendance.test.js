import test from 'node:test';
import assert from 'node:assert/strict';
import { updateAttendanceState } from '../src/attendance.js';

test('checking in adds the player to attendance and waiting queue',()=>{
  const next=updateAttendanceState({attendance:['p1'],court:['p1'],waitingQueue:[]},'p2',true);
  assert.deepEqual(next.attendance,['p1','p2']);
  assert.deepEqual(next.waitingQueue,['p2']);
  assert.equal(next.priority,'p2');
});

test('checking out removes the player from every future lineup',()=>{
  const next=updateAttendanceState({
    attendance:['p1','p2','p3'],
    court:['p1','p2'],
    waitingQueue:['p3','p2'],
    queueDraftChosen:['p2'],
    priority:'p3',
    nextCall:{players:['p2','p3','p4','p5']}
  },'p2',false);
  assert.deepEqual(next.attendance,['p1','p3']);
  assert.deepEqual(next.court,['p1']);
  assert.deepEqual(next.waitingQueue,['p3']);
  assert.deepEqual(next.queueDraftChosen,[]);
  assert.equal(next.priority,'p3');
  assert.equal(next.nextCall,null);
});
