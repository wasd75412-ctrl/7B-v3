import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeTeamsWithTeammateLimit, consecutiveTeammateGames, lineupExceedsTeammateLimit } from '../src/team-rotation.js';

const game=(teamA,teamB)=>({teams:[teamA,teamB]});
const pairs=lineup=>[lineup.slice(0,2).sort().join('|'),lineup.slice(2,4).sort().join('|')];

test('allows teammates to repeat once',()=>{
  const history=[game(['A','B'],['C','D'])];
  assert.equal(consecutiveTeammateGames(history,'A','B'),1);
  assert.equal(lineupExceedsTeammateLimit(['A','B','C','D'],history),false);
});

test('splits teammates before a third consecutive game',()=>{
  const history=[game(['A','B'],['C','D']),game(['A','B'],['C','D'])];
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0);
  assert.equal(lineupExceedsTeammateLimit(['A','B','C','D'],history),true);
  assert.equal(pairs(lineup).includes('A|B'),false);
  assert.equal(pairs(lineup).includes('C|D'),false);
});

test('allows former teammates again after they have been split',()=>{
  const history=[
    game(['A','B'],['C','D']),
    game(['A','B'],['C','D']),
    game(['A','C'],['B','D'])
  ];
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0);
  assert.equal(consecutiveTeammateGames(history,'A','B'),0);
  assert.deepEqual(pairs(lineup),['A|B','C|D']);
});

test('ignores games where one teammate was resting',()=>{
  const history=[game(['A','B'],['C','D']),game(['A','E'],['F','G'])];
  assert.equal(consecutiveTeammateGames(history,'A','B'),1);
});
