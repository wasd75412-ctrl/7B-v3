import test from 'node:test';
import assert from 'node:assert/strict';
import { nonVoterPlayerIds, recruitingMessage, recruitingSlots } from '../src/poll-recruiting.js';

const poll={
  options:[
    {id:'sep4',date:'2026-09-04',time:'01:00',endTime:'04:00',note:'立羽會館'},
    {id:'sep5',date:'2026-09-03',time:'01:00',endTime:'04:00',note:'立羽會館'},
    {id:'sep6',date:'2026-09-06',time:'01:00',endTime:'04:00',note:'立羽會館'}
  ],
  votes:{a:'sep4|sep5',b:'sep4|sep5',c:'sep4|sep5',d:'sep4',e:'sep6'},
  voterPlayers:{a:'p1',b:'p2',c:'p3',d:'p4',e:'p5'}
};

test('locks only poll slots with three or four unique participants',()=>{
  assert.deepEqual(recruitingSlots(poll).map(slot=>[slot.id,slot.participantCount]),[['sep5',3],['sep4',4]]);
});

test('requires at least five participants for Saturday and Sunday recruiting',()=>{
  const weekend={...poll,options:[...poll.options,{id:'sep6full',date:'2026-09-06',time:'11:00',endTime:'14:00'}],votes:{...poll.votes,f:'sep6full',g:'sep6full',h:'sep6full',i:'sep6full',j:'sep6full'},voterPlayers:{...poll.voterPlayers,f:'p6',g:'p7',h:'p8',i:'p9',j:'p10'}};
  assert.deepEqual(recruitingSlots(weekend).map(slot=>[slot.id,slot.participantCount]),[['sep5',3],['sep4',4],['sep6full',5]]);
  const four={...weekend,votes:{...weekend.votes,j:''}};
  assert.equal(recruitingSlots(four).some(slot=>slot.id==='sep6full'),false);
});

test('creates the requested conversational recruiting copy',()=>{
  assert.equal(recruitingMessage(poll),'哈囉～9/3 01–04我們有約羽球，目前3個人，你要不要一起來打🏸\n9/4 01–04也有一場，目前4個人，有空也可以一起來～');
});

test('does not create a message without a three-to-four-player slot',()=>{
  assert.equal(recruitingMessage({options:poll.options,votes:{a:'sep6'},voterPlayers:{a:'p1'}}),'');
});

test('includes only qualifying slots selected by the admin',()=>{
  assert.equal(recruitingMessage(poll,new Set(['sep5'])),'哈囉～9/3 01–04我們有約羽球，目前3個人，你要不要一起來打🏸');
  assert.equal(recruitingMessage(poll,new Set(['sep6'])),'');
});

test('lists roster players who did not submit a selection',()=>{
  assert.deepEqual(nonVoterPlayerIds({...poll,votes:{...poll.votes,f:''},voterPlayers:{...poll.voterPlayers,f:'p6'}},['p1','p2','p3','p4','p5','p6','p7']),['p6','p7']);
});
