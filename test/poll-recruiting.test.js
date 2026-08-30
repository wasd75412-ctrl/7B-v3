import test from 'node:test';
import assert from 'node:assert/strict';
import { recruitingMessage, recruitingSlots } from '../src/poll-recruiting.js';

const poll={
  options:[
    {id:'sep4',date:'2026-09-04',time:'01:00',endTime:'04:00',note:'立羽會館'},
    {id:'sep5',date:'2026-09-05',time:'01:00',endTime:'04:00',note:'立羽會館'},
    {id:'sep6',date:'2026-09-06',time:'01:00',endTime:'04:00',note:'立羽會館'}
  ],
  votes:{a:'sep4|sep5',b:'sep4|sep5',c:'sep4|sep5',d:'sep4',e:'sep6'},
  voterPlayers:{a:'p1',b:'p2',c:'p3',d:'p4',e:'p5'}
};

test('locks only poll slots with three or four unique participants',()=>{
  assert.deepEqual(recruitingSlots(poll).map(slot=>[slot.id,slot.participantCount]),[['sep4',4],['sep5',3]]);
});

test('creates the requested conversational recruiting copy',()=>{
  assert.equal(recruitingMessage(poll),'哈囉～9/4 01–04我們有約羽球，目前4個人，你要不要一起來打🏸\n9/5 01–04也有一場，目前3個人，有空也可以一起來～');
});

test('does not create a message without a three-to-four-player slot',()=>{
  assert.equal(recruitingMessage({options:poll.options,votes:{a:'sep6'},voterPlayers:{a:'p1'}}),'');
});
