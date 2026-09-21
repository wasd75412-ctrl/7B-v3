import test from 'node:test';
import assert from 'node:assert/strict';
import { POLL_SLOT_CAPACITY, pollSlotParticipantCount, pollWasFinalized } from '../src/poll.js';

test('a deadline-closed poll with candidates can still be announced by the admin',()=>{
  assert.equal(pollWasFinalized({status:'closed',options:[{id:'date-1'}]}),false);
});

test('a closed poll with cleared candidates was already published',()=>{
  assert.equal(pollWasFinalized({status:'closed',options:[]}),true);
});

test('counts unique players toward the six-person poll slot limit',()=>{
  const poll={
    votes:{a:'slot-1',b:'slot-1',c:'slot-1|slot-2',d:'slot-1',e:'slot-1'},
    voterPlayers:{a:'p1',b:'p2',c:'p3',d:'p3',e:'p4'},
    manualParticipants:{'slot-1':['p5','p6','p6']}
  };
  assert.equal(POLL_SLOT_CAPACITY,6);
  assert.equal(pollSlotParticipantCount(poll,'slot-1'),6);
  assert.equal(pollSlotParticipantCount(poll,'slot-2'),1);
});
