import test from 'node:test';
import assert from 'node:assert/strict';
import { POLL_DRAFT_TTL_MS, POLL_SLOT_CAPACITY, activePollDraftSelection, createPollDraft, pollSlotParticipantCount, pollWasFinalized } from '../src/poll.js';

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

const draftPoll={createdAt:'2026-10-05T07:00:05.330Z',autoCycle:'2026-10-05',options:[{id:'d1'},{id:'d2'},{id:'d3'},{id:'d4'}]};

test('unsent poll ticks survive a room snapshot re-render within the same round',()=>{
  const draft=createPollDraft(draftPoll,'ROOM01',['d1','d2','d3'],1000);
  assert.deepEqual(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM01',now:1000+60_000}),['d1','d2','d3']);
});

test('an intentionally emptied draft still overrides the saved vote',()=>{
  const draft=createPollDraft(draftPoll,'ROOM01',[],1000);
  assert.deepEqual(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM01',now:2000}),[]);
});

test('unsent poll ticks expire after the idle limit',()=>{
  const draft=createPollDraft(draftPoll,'ROOM01',['d1'],1000);
  assert.deepEqual(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM01',now:1000+POLL_DRAFT_TTL_MS-1}),['d1']);
  assert.equal(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM01',now:1000+POLL_DRAFT_TTL_MS}),null);
  assert.equal(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM01',now:500}),null);
});

test('unsent poll ticks are dropped for another room, a new round or a closed poll',()=>{
  const draft=createPollDraft(draftPoll,'ROOM01',['d1'],1000);
  assert.equal(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM02',now:1000}),null);
  assert.equal(activePollDraftSelection(draft,{...draftPoll,createdAt:'2026-10-12T07:00:00.000Z',autoCycle:'2026-10-12'},{roomId:'ROOM01',now:1000}),null);
  assert.equal(activePollDraftSelection(draft,draftPoll,{roomId:'ROOM01',closed:true,now:1000}),null);
  assert.equal(activePollDraftSelection(null,draftPoll,{roomId:'ROOM01',now:1000}),null);
});

test('unsent poll ticks drop options removed from the poll but keep the unavailable choice',()=>{
  const draft=createPollDraft(draftPoll,'ROOM01',['d1','d4','__unavailable__'],1000);
  const trimmed={...draftPoll,options:[{id:'d1'}]};
  assert.deepEqual(activePollDraftSelection(draft,trimmed,{roomId:'ROOM01',now:1000,extraIds:['__unavailable__']}),['d1','__unavailable__']);
});
