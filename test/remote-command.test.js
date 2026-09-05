import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAcceptRemoteCommand} from '../src/remote-command.js';

const now=Date.parse('2026-09-05T12:00:00.000Z');
const currentMatch={matchId:'current-match',startedAt:new Date(now-10_000).toISOString()};
const command={id:'press-1',createdAt:new Date(now-1000).toISOString()};
const accept=(changes={})=>shouldAcceptRemoteCommand({command,currentMatch,now,...changes});

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
  assert.equal(accept({command:{...command,clientCreatedAt:now+6000}}),false);
  assert.equal(accept({command:{...command,clientCreatedAt:now-2000}}),true);
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
