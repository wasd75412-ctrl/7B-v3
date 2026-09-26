import test from 'node:test';
import assert from 'node:assert/strict';
import { playedParticipantIds } from '../src/session-participants.js';

test('counts every player who completed a match once for the session fee',()=>{
  const matches=[
    {teams:[['p1','p2'],['p3','p4']]},
    {teams:[['p1','p5'],['p3','p6']]},
    {teams:[['p7'],['p8']],testMode:true}
  ];
  assert.deepEqual(playedParticipantIds(matches),['p1','p2','p3','p4','p5','p6']);
});

test('keeps earlier players counted after they leave later lineups',()=>{
  const matches=[
    {teams:[['early','p2'],['p3','p4']]},
    {teams:[['late','p2'],['p3','p4']]}
  ];
  assert.deepEqual(playedParticipantIds(matches),['early','p2','p3','p4','late']);
});
