import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrangeTeamsWithTeammateLimit, consecutiveTeammateGames, lineupExceedsTeammateLimit, orientLineupToReference } from '../src/team-rotation.js';

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

test('keeps former teammates eligible but prefers a less-used pairing',()=>{
  const history=[
    game(['A','B'],['C','D']),
    game(['A','B'],['C','D']),
    game(['A','C'],['B','D'])
  ];
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0);
  assert.equal(consecutiveTeammateGames(history,'A','B'),0);
  assert.equal(lineupExceedsTeammateLimit(lineup,history),false);
  assert.deepEqual(pairs(lineup),['A|D','B|C']);
});

test('ignores games where one teammate was resting',()=>{
  const history=[game(['A','B'],['C','D']),game(['A','E'],['F','G'])];
  assert.equal(consecutiveTeammateGames(history,'A','B'),1);
});

test('prefers the least-used teammate pairing from today',()=>{
  const history=[
    game(['A','B'],['C','D']),
    game(['A','C'],['B','D'])
  ];
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0);
  assert.deepEqual(pairs(lineup),['A|D','B|C']);
});

test('randomizes only between pairings with the same repeat count',()=>{
  const history=[game(['A','B'],['C','D'])];
  const first=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0);
  const second=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,1);
  assert.notDeepEqual(pairs(first),pairs(second));
  assert.equal(pairs(first).includes('A|B'),false);
  assert.equal(pairs(second).includes('A|B'),false);
});

test('separates male players when fewer than three men are present',()=>{
  const genderByPlayer={A:'male',B:'male',C:'female',D:'female'};
  const history=[game(['A','C'],['B','D'])];
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0,2,{genderByPlayer,malePresentCount:2});
  assert.equal(pairs(lineup).includes('A|B'),false);
});

test('uses the four selected players for the three-men exception',()=>{
  const genderByPlayer={A:'male',B:'male',C:'female',D:'female',E:'male'};
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[],0,2,{genderByPlayer,malePresentCount:3});
  assert.equal(pairs(lineup).includes('A|B'),false);
});

test('uses the original teammate rules when gender grouping is disabled',()=>{
  const genderByPlayer={A:'male',B:'male',C:'female',D:'female'};
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[],0,2,{genderGroupingEnabled:false,genderByPlayer,malePresentCount:2});
  assert.deepEqual(pairs(lineup),['A|B','C|D']);
});

test('random court still prefers the least-used gender-safe pairing',()=>{
  const genderByPlayer={A:'male',B:'male',C:'female',D:'female'};
  const first=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[game(['A','C'],['B','D'])],0,2,{genderByPlayer,malePresentCount:2,randomizeAll:true});
  const second=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[game(['A','C'],['B','D'])],1,2,{genderByPlayer,malePresentCount:2,randomizeAll:true});
  assert.deepEqual(pairs(first),['A|D','B|C']);
  assert.deepEqual(pairs(second),['A|D','B|C']);
});

test('allows male teammates when three men are present',()=>{
  const genderByPlayer={A:'male',B:'male',C:'male',D:'female'};
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[],0,2,{genderByPlayer,malePresentCount:3});
  assert.equal(pairs(lineup).some(pair=>pair==='A|B'||pair==='A|C'||pair==='B|C'),true);
});

test('still prefers an unseen gender-safe pairing',()=>{
  const genderByPlayer={A:'male',B:'male',C:'female',D:'female'};
  const history=[game(['A','C'],['B','D'])];
  const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],history,0,2,{genderByPlayer,malePresentCount:2});
  assert.deepEqual(pairs(lineup),['A|D','B|C']);
});

test('keeps an unavoidable four-men lineup unchanged',()=>{
  const genderByPlayer={A:'male',B:'male',C:'male',D:'male'};
  for(const random of[0,1,2])assert.deepEqual(arrangeTeamsWithTeammateLimit(['A','B','C','D'],[],random,2,{genderByPlayer,keepLineup:true}),['A','B','C','D']);
});

test('keeps players on their previous team when re-pairing',()=>{
  assert.deepEqual(orientLineupToReference(['C','D','A','B'],['A','B','C','D']),['A','B','C','D']);
  assert.deepEqual(orientLineupToReference(['B','C','A','D'],['A','B','C','D']),['A','D','B','C']);
  assert.deepEqual(orientLineupToReference(['A','B','C','D'],['C','D','A','B']),['C','D','A','B']);
});

test('starts exactly the lineup shown and applies teammate rules while it is being picked',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const startMatch=source.match(/function startMatch\(\)\{[^\n]*/)?.[0]||'';
  const startNext=source.match(/function startNext\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(startMatch,/const ids=\[\.\.\.selected\];/);
  assert.match(startNext,/const vals=\[\.\.\.selected\];/);
  for(const body of[startMatch,startNext])assert.doesNotMatch(body,/teammateSafeLineup/);
  assert.match(source,/state\.court=state\.court\.filter\(Boolean\);if\(!singles&&state\.court\.length===4\)\{const safe=teammateSafeLineup\(state\.court\);/);
});

test('only reshuffles fixable gender lineups and keeps winners on their side',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/genderViolation=genderGroupingEnabled&&lineupMaleCount===2&&hasMalePair/);
  assert.match(source,/orientLineupToReference\(arrangeTeamsWithTeammateLimit\(randomize\?shuffle\(values\):values,[^)]*keepLineup:!randomize\}\),values\)/);
  assert.match(source,/teammateSafeLineup\(m\.winner===0\?\[\.\.\.winners,\.\.\.chosen\]:\[\.\.\.chosen,\.\.\.winners\],\{randomize:true\}\)/);
  assert.match(source,/lineup=m\.winner===1\?\[\.\.\.rotation\.players\]\.reverse\(\):rotation\.players/);
});
