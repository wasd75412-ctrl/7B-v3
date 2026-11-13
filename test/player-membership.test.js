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

test('normalizes unknown membership values to member', () => {
  assert.equal(normalizePlayerType(), PLAYER_TYPE_MEMBER);
  assert.equal(normalizePlayerType('unknown'), PLAYER_TYPE_MEMBER);
  assert.equal(normalizePlayerType(PLAYER_TYPE_GUEST), PLAYER_TYPE_GUEST);
});

test('no longer treats any player as a guest in the UI', () => {
  assert.equal(isGuestPlayer({name:'舊球員'}), false);
  assert.equal(isGuestPlayer({memberType:PLAYER_TYPE_GUEST}), false);
});

test('keeps the whole roster in one membership section', () => {
  const players = [
    {id:'member', name:'固定團員'},
    {id:'guest', name:'臨打球友', memberType:PLAYER_TYPE_GUEST}
  ];
  const sections = splitPlayersByMembership(players);
  assert.deepEqual(sections.members.map(player => player.id), ['member', 'guest']);
  assert.deepEqual(sections.guests, []);
});

test('every roster player stays eligible for shuttle purchases', () => {
  const players = [
    {id:'m1', memberType:PLAYER_TYPE_MEMBER},
    {id:'g1', memberType:PLAYER_TYPE_GUEST},
    {id:'m2'}
  ];
  assert.deepEqual(shuttleEligiblePlayers(players).map(player => player.id), ['m1', 'g1', 'm2']);
});
