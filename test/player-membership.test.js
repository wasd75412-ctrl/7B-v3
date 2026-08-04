import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAYER_TYPE_GUEST,
  PLAYER_TYPE_MEMBER,
  isGuestPlayer,
  normalizePlayerType,
  shuttleEligiblePlayers,
  splitPlayersByMembership
} from '../src/player-membership.js';

test('existing players default to fixed members',()=>{
  assert.equal(normalizePlayerType(),PLAYER_TYPE_MEMBER);
  assert.equal(normalizePlayerType('unknown'),PLAYER_TYPE_MEMBER);
  assert.equal(isGuestPlayer({name:'舊球員'}),false);
});

test('separates fixed members and guest players without losing records',()=>{
  const players=[
    {id:'member',name:'固定團員'},
    {id:'guest',name:'臨打球友',memberType:PLAYER_TYPE_GUEST}
  ];
  const sections=splitPlayersByMembership(players);
  assert.deepEqual(sections.members.map(player=>player.id),['member']);
  assert.deepEqual(sections.guests.map(player=>player.id),['guest']);
});

test('guest players are excluded from shuttle purchase choices',()=>{
  const players=[
    {id:'m1',memberType:PLAYER_TYPE_MEMBER},
    {id:'g1',memberType:PLAYER_TYPE_GUEST},
    {id:'m2'}
  ];
  assert.deepEqual(shuttleEligiblePlayers(players).map(player=>player.id),['m1','m2']);
});
