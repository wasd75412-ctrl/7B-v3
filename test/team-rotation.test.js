import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrangeTeamsWithTeammateLimit, balanceLineupSides, consecutiveTeammateGames, genderGroupingActive, lineupExceedsTeammateLimit, orientLineupToReference } from '../src/team-rotation.js';

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

test('gender grouping turns back on after the day it was disabled',()=>{
  assert.equal(genderGroupingActive({},'2026-10-11'),true);
  assert.equal(genderGroupingActive({genderGroupingEnabled:false},'2026-10-11'),true);
  assert.equal(genderGroupingActive({genderGroupingEnabled:false,genderGroupingOffDate:'2026-10-10'},'2026-10-11'),true);
  assert.equal(genderGroupingActive({genderGroupingEnabled:false,genderGroupingOffDate:'2026-10-11'},'2026-10-11'),false);
});

test('regrouping the court changes pairings without breaking gender grouping',()=>{
  const genderByPlayer={A:'male',B:'female',C:'male',D:'female'};
  for(const random of[0,1,2]){
    const lineup=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[],random,2,{genderByPlayer,avoidLineup:['A','B','C','D']});
    assert.deepEqual(pairs(lineup),['A|D','B|C']);
  }
  const free=arrangeTeamsWithTeammateLimit(['A','B','C','D'],[],0,2,{genderGroupingEnabled:false,genderByPlayer,avoidLineup:['A','B','C','D']});
  assert.notDeepEqual(pairs(free),['A|B','C|D']);
});

test('regroup button only re-pairs the players already on court',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(html,/id="regroupCourt"/);
  const handler=source.match(/\$\('regroupCourt'\)\.onclick=\(\)=>\{[\s\S]*?\n\};/)?.[0]||'';
  assert.match(handler,/teammateSafeLineup\(court,\{randomize:true,regroup:true\}\)/);
  assert.doesNotMatch(handler,/selectablePlayerIds|attendance|waitingQueue\[/);
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
  const startMatch=source.match(/function startMatch\(\{practice=false\}=\{\}\)\{[^\n]*/)?.[0]||'';
  const startNext=source.match(/function startNext\(\{practice=false\}=\{\}\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(startMatch,/const ids=\[\.\.\.selected\];/);
  assert.match(startNext,/const vals=\[\.\.\.selected\];/);
  for(const body of[startMatch,startNext])assert.doesNotMatch(body,/teammateSafeLineup/);
  assert.match(source,/state\.court=state\.court\.filter\(Boolean\);if\(!singles&&state\.court\.length===4\)\{const safe=teammateSafeLineup\(state\.court\);/);
});

test('keeps the winner side as the tie-break and balances unequal A and B counts',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/genderViolation=genderGroupingEnabled&&lineupMaleCount===2&&hasMalePair/);
  assert.match(source,/balanceLineupSides\(arrangeTeamsWithTeammateLimit\(randomize\?shuffle\(values\):values,[^)]*keepLineup:!randomize,avoidLineup:regroup\?values:null\}\),values,todayHistory\)/);
  assert.match(source,/teammateSafeLineup\(m\.winner===0\?\[\.\.\.winners,\.\.\.chosen\]:\[\.\.\.chosen,\.\.\.winners\],\{randomize:true\}\)/);
  assert.match(source,/lineup=m\.winner===1\?\[\.\.\.rotation\.players\]\.reverse\(\):rotation\.players/);
});

test('puts the pair that has stood on A more often onto B',()=>{
  const history=[game(['W0','W1'],['C0','C1']),game(['W0','W1'],['C0','C1'])];
  const balanced=balanceLineupSides(['W0','W1','C0','C1'],['W0','W1','C0','C1'],history);
  assert.deepEqual(pairs(balanced),['C0|C1','W0|W1']);
});

test('keeps winners on their side when A and B counts are tied',()=>{
  const history=[game(['W0','W1'],['C0','C1']),game(['C0','C1'],['W0','W1'])];
  const balanced=balanceLineupSides(['C0','C1','W0','W1'],['W0','W1','C0','C1'],history);
  assert.deepEqual(balanced.slice(0,2).sort(),['W0','W1']);
  assert.deepEqual(balanced.slice(2,4).sort(),['C0','C1']);
});

test('side balance keeps mixed pairs intact',()=>{
  const history=[game(['M1','F1'],['M2','F2'])];
  const balanced=balanceLineupSides(['M1','F1','M2','F2'],['M1','F1','M2','F2'],history);
  assert.deepEqual(pairs(balanced),['F2|M2','F1|M1']);
});


