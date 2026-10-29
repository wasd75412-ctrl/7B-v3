import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REMOTE_COMMAND_MAX_AGE_MS,isQueuedRepeatPress,officialStartArrivedAfterAttach,shouldAcceptOfficialStart,shouldAcceptRemoteCommand,timestampMillis} from '../src/remote-command.js';

const now=Date.parse('2026-09-05T12:00:00.000Z');
const currentMatch={matchId:'current-match',startedAt:new Date(now-10_000).toISOString()};
const command={id:'press-1',createdAt:new Date(now-1000).toISOString()};
const accept=(changes={})=>shouldAcceptRemoteCommand({command,currentMatch,now,...changes});

test('a start pressed while the remote channel is still attaching is not a baseline command',()=>{
  assert.equal(officialStartArrivedAfterAttach(now-1000,now),true);
  assert.equal(officialStartArrivedAfterAttach(now-REMOTE_COMMAND_MAX_AGE_MS,now),true);
  assert.equal(officialStartArrivedAfterAttach(now-REMOTE_COMMAND_MAX_AGE_MS-1,now),false);
  assert.equal(officialStartArrivedAfterAttach(Number.NaN,now),false);
});

test('normalizes accepted command timestamps for the official start marker',()=>{
  assert.equal(timestampMillis(command.createdAt),now-1000);
  assert.equal(timestampMillis({toMillis:()=>now-2000}),now-2000);
  assert.equal(Number.isNaN(timestampMillis('invalid')),true);
});

test('accepts fresh legacy Android and web commands without a match id',()=>{
  const formats=[
    new Date(now-1000).toISOString(),
    new Date(now-1000),
    now-1000,
    {toMillis:()=>now-1000},
    {seconds:Math.floor(now/1000)-1,nanoseconds:500_000_000}
  ];
  for(const createdAt of formats)assert.equal(accept({command:{...command,createdAt}}),true);
});

test('never replays a stored command during initial server synchronization',()=>{
  // An empty cache must leave the listener in its initial state until the server arrives.
  assert.equal(accept({command:null,initial:true,fromCache:true}),false);
  assert.equal(accept({initial:true,fromCache:false}),false);
  assert.equal(accept({command:{...command,id:'new-press'},initial:false}),true);
});

test('ignores cached and unacknowledged commands',()=>{
  assert.equal(accept({fromCache:true}),false);
  assert.equal(accept({hasPendingWrites:true}),false);
  assert.equal(accept({command:{createdAt:command.createdAt}}),false);
  assert.equal(shouldAcceptRemoteCommand(),false);
});

test('rejects previous-game commands even if they are only seconds old',()=>{
  assert.equal(accept({command:{...command,createdAt:new Date(now-11_000).toISOString()}}),false);
  assert.equal(accept({command:{...command,createdAt:currentMatch.startedAt}}),true);
});

test('matches explicitly scoped commands to the current match, including idle state',()=>{
  assert.equal(accept({command:{...command,matchId:'current-match'}}),true);
  assert.equal(accept({command:{...command,matchId:'previous-match'}}),false);
  assert.equal(accept({command:{...command,matchId:''}}),false);
  assert.equal(accept({currentMatch:{active:false},command:{...command,matchId:''}}),true);
  assert.equal(accept({currentMatch:{active:false},command:{...command,matchId:'current-match'}}),false);
});

test('expires old commands and limits clock skew, even without a match start',()=>{
  for(const offset of [-15_001,5_001])assert.equal(accept({currentMatch:{},command:{...command,createdAt:now+offset}}),false);
  for(const offset of [-15_000,5_000])assert.equal(accept({currentMatch:{},command:{...command,createdAt:now+offset}}),true);
});

test('accepts a correctly scoped opening rally with small cross-device clock skew',()=>{
  assert.equal(accept({currentMatch:{matchId:'B',startedAt:new Date(now-1000).toISOString()},
    command:{...command,matchId:'B',createdAt:now,clientCreatedAt:now-2000}}),true);
});

test('does not freshen an offline command when the server finally acknowledges it',()=>{
  assert.equal(accept({command:{...command,createdAt:{toMillis:()=>now},clientCreatedAt:now-60_000}}),false);
  assert.equal(accept({command:{...command,clientCreatedAt:now-11_000}}),false);
  assert.equal(accept({command:{...command,clientCreatedAt:now-2000}}),true);
});

test('accepts commands from a phone whose clock runs ahead of the host',()=>{
  assert.equal(accept({command:{...command,matchId:'current-match',clientCreatedAt:now+6400}}),true);
  assert.equal(accept({command:{...command,createdAt:now+5001,clientCreatedAt:now}}),false);
});

test('official start for the match on screen lands even when the press looks old',()=>{
  const waiting={matchId:'current-match',active:true,winner:null,startedAt:''};
  const start={id:'start-1',matchId:'current-match',clientCreatedAt:now-60_000,createdAt:now-60_000};
  assert.equal(shouldAcceptOfficialStart({command:start,currentMatch:waiting,now,initial:false,matchShownAt:now-120_000}),true);
  assert.equal(shouldAcceptOfficialStart({command:start,currentMatch:waiting,now,initial:true,matchShownAt:now-120_000}),true);
  assert.equal(shouldAcceptOfficialStart({command:start,currentMatch:{...waiting,startedAt:new Date(now-10_000).toISOString()},now,initial:true}),false);
  assert.equal(shouldAcceptOfficialStart({command:{...start,id:'start-2'},currentMatch:{...waiting,startedAt:new Date(now-10_000).toISOString()},now,initial:false}),true);
});

test('official start does not carry onto the match that replaced it',()=>{
  const waiting={matchId:'next-match',active:true,winner:null,startedAt:''};
  const carried={id:'start-old',matchId:'previous-match',clientCreatedAt:now-500};
  assert.equal(shouldAcceptOfficialStart({command:carried,currentMatch:waiting,now,matchShownAt:now-100,replacedMatchId:'previous-match'}),false);
  const stalePhone={id:'start-stale',matchId:'older-match',clientCreatedAt:now-500};
  assert.equal(shouldAcceptOfficialStart({command:stalePhone,currentMatch:waiting,now,matchShownAt:now-10_000,replacedMatchId:'previous-match'}),true);
  assert.equal(shouldAcceptOfficialStart({command:{...stalePhone,clientCreatedAt:now-20_000},currentMatch:waiting,now,matchShownAt:now-10_000,replacedMatchId:'previous-match'}),false);
});

test('a direct official start with no server timestamp still uses the phone clock',()=>{
  const direct={id:'start-1',matchId:'current-match',clientCreatedAt:now-500};
  assert.equal(accept({command:direct}),true);
  assert.equal(accept({command:{...direct,clientCreatedAt:now+6400}}),true);
  assert.equal(accept({command:{...direct,clientCreatedAt:now-20_000}}),false);
  assert.equal(accept({command:{id:'start-1',matchId:'current-match'}}),false);
});

test('rejects missing or malformed timestamps instead of treating them as fresh',()=>{
  const malformed=[undefined,null,'','invalid',NaN,Infinity,-1,Math.floor(now/1000),{},
    {toMillis:()=>{throw new Error('invalid timestamp')}},
    {toMillis:()=>String(now)},
    {seconds:now/1000,nanoseconds:1_000_000_000},
    {seconds:now/1000,nanoseconds:-1}];
  for(const createdAt of malformed)assert.equal(accept({command:{...command,createdAt}}),false);
  assert.equal(accept({command:{...command,clientCreatedAt:null}}),false);
  assert.equal(accept({now:NaN}),false);
  assert.equal(accept({currentMatch:{startedAt:'unknown'}}),true);
});

// Replays the stall seen in one match: one team pressed five times about a second apart while the
// network was stuck, then every press landed in the same instant.
function replay(presses){
  const trail={},applied=[];
  for(const press of presses){
    if(press.action==='undo'){for(const key of Object.keys(trail))delete trail[key];applied.push('undo');continue}
    const repeat=isQueuedRepeatPress({...press,previous:trail[press.action]});
    trail[press.action]=press;
    if(!repeat)applied.push(press.action);
  }
  return applied;
}

test('presses stuck behind a network stall count once per team',()=>{
  const landed=52_500;
  const stalled=[41_700,43_700,44_700,45_800,47_800].map((pressedAt,index)=>({action:'teamAPlus',pressedAt,arrivedAt:landed+index}));
  assert.deepEqual(replay([...stalled.slice(0,3),{action:'teamBPlus',pressedAt:44_900,arrivedAt:landed+3},...stalled.slice(3)]),['teamAPlus','teamBPlus']);
});

test('presses that arrive as they are made always count',()=>{
  const live=[0,2_000,4_000].map(pressedAt=>({action:'teamAPlus',pressedAt,arrivedAt:pressedAt+80}));
  assert.deepEqual(replay(live),['teamAPlus','teamAPlus','teamAPlus']);
  assert.deepEqual(replay([{action:'teamAPlus',pressedAt:0,arrivedAt:9_000},{action:'teamAPlus',pressedAt:12_000,arrivedAt:9_010}]),['teamAPlus','teamAPlus']);
});

test('an undo between queued presses keeps the correction',()=>{
  assert.deepEqual(replay([
    {action:'teamAPlus',pressedAt:0,arrivedAt:9_000},
    {action:'undo'},
    {action:'teamAPlus',pressedAt:1_500,arrivedAt:9_010},
  ]),['teamAPlus','undo','teamAPlus']);
  assert.equal(isQueuedRepeatPress({action:'undo',pressedAt:1,arrivedAt:1,previous:{action:'undo',pressedAt:0,arrivedAt:0}}),false);
  assert.equal(isQueuedRepeatPress({action:'teamAPlus',pressedAt:NaN,arrivedAt:1,previous:{action:'teamAPlus',pressedAt:0,arrivedAt:0}}),false);
});

test('the host skips queued repeat presses before scoring them',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/if\(isOfficialStartScoreEcho\(action,command\)\)return true;\s*if\(skipQueuedRepeatPress\(action,command\)\)return true;\s*if\(performScoreRemoteAction\(action\)\)/);
  assert.match(main,/if\(action==='undo'\)\{remotePressTrail\.presses=\{\};return false\}/);
  assert.match(main,/arrivedAt:Date\.now\(\)/);
});




