import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MATCH_JOURNAL_MAX_AGE_MS, journaledMatchToRestore, matchInProgress, matchJournalEntry, matchJournalKey } from '../src/match-journal.js';

const now=Date.parse('2026-10-04T12:00:00.000Z');
const match=(overrides={})=>({active:true,format:'doubles',players:[['a','b'],['c','d']],scores:[2,1],rallies:[0,0,1],serving:1,positions:[[1,0],[0,1]],winner:null,matchId:'m2',syncEpoch:now-1000,scorerDevice:'ipad',startedAt:'2026-10-04T11:59:00.000Z',...overrides});
const entry=(overrides={},savedAt=now)=>matchJournalEntry(match(overrides),savedAt);

test('journals only matches that are being played',()=>{
  assert.equal(matchInProgress(match()),true);
  assert.equal(matchInProgress(match({rallies:[],startedAt:''})),false);
  assert.equal(matchInProgress(match({winner:0})),false);
  assert.equal(matchJournalEntry(match({winner:1}),now),null);
});

test('restores the journaled match when the cloud reverted to the previous finished match',()=>{
  const previous=match({matchId:'m1',players:[['a','c'],['b','d']],winner:0,scores:[11,5],syncEpoch:now-600000});
  const restored=journaledMatchToRestore(entry(),previous,{deviceId:'ipad',now});
  assert.equal(restored.matchId,'m2');
  assert.deepEqual(restored.players,[['a','b'],['c','d']]);
  assert.deepEqual(restored.scores,[2,1]);
});

test('restores lost points of the same match but never reopens a finished one',()=>{
  assert.deepEqual(journaledMatchToRestore(entry(),match({rallies:[0],scores:[1,0]}),{deviceId:'ipad',now}).rallies,[0,0,1]);
  assert.equal(journaledMatchToRestore(entry(),match({rallies:[0,0,1,1],scores:[2,2]}),{deviceId:'ipad',now}),null);
  assert.equal(journaledMatchToRestore(entry(),match({winner:0,scores:[11,3]}),{deviceId:'ipad',now}),null);
});

test('keeps a newer cloud match, another device\'s match and stale journals',()=>{
  assert.equal(journaledMatchToRestore(entry(),match({matchId:'m3',syncEpoch:now}),{deviceId:'ipad',now}),null);
  assert.equal(journaledMatchToRestore(entry(),match({matchId:'m1',winner:0,syncEpoch:now-600000}),{deviceId:'phone',now}),null);
  assert.equal(journaledMatchToRestore(entry({},now-MATCH_JOURNAL_MAX_AGE_MS-1),match({matchId:'m1',winner:0,syncEpoch:1}),{deviceId:'ipad',now}),null);
});

test('reloaded scoring device brings back the match it was scoring and republishes it',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const startIndex=main.indexOf('function restoreJournaledMatch(');
  const source=main.slice(startIndex,main.indexOf('function saveLiveScoreSoon(',startIndex));
  const calls={checkpoint:0,render:0};
  const resultModal={classList:{hidden:false,add(){this.hidden=true}}};
  const storage={'bcmLiveMatchJournalV1:ROOM01':JSON.stringify(entry({},Date.now()))};
  const context=vm.createContext({
    requestedAndroidRemote:false,isHost:true,roomId:'ROOM01',scoreDeviceId:'ipad',
    state:{match:match({matchId:'m1',players:[['a','c'],['b','d']],winner:0,scores:[11,5],syncEpoch:1}),court:['a','c','b','d'],nextCall:{players:['a','b','c','d']},matchRollback:{matchId:'m1'}},
    localStorage:{getItem:key=>storage[key]??null},JSON,structuredClone,matchJournalKey,
    journaledMatchToRestore:(value,current,options)=>journaledMatchToRestore(value,current,{...options,now:Date.now()}),
    reconcileWaitingQueue:()=>{},checkpointNewMatch:()=>calls.checkpoint++,renderAll:()=>calls.render++,
    $:()=>resultModal,latestLiveMatch:null,liveScoreReady:false,scoreViewRequested:false,dismissedResultKey:'x'
  });
  vm.runInContext(`${source};globalThis.restored=restoreJournaledMatch();`,context);
  assert.equal(context.restored,true);
  assert.equal(context.state.match.matchId,'m2');
  assert.deepEqual(context.state.match.players,[['a','b'],['c','d']]);
  assert.deepEqual(context.state.court,['a','b','c','d']);
  assert.equal(context.state.nextCall,null);
  assert.equal(context.scoreViewRequested,true);
  assert.equal(resultModal.classList.hidden,true);
  assert.equal(calls.checkpoint,1);
});

test('scoring device journals every score change and restores it before listening',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(source,/function saveLiveScoreSoon\(\)\{\n\s*if\(requestedAndroidRemote\|\|!isHost\|\|applying\|\|!roomRef\)return;\n\s*persistMatchJournal\(\);/);
  assert.match(source,/async function saveNewMatchCheckpointNow\(\)\{\n[^\n]*\n\s*persistMatchJournal\(\);/);
  const connect=source.slice(source.indexOf('async function connectRoom'));
  assert.ok(connect.indexOf('restoreJournaledMatch();')>0&&connect.indexOf('restoreJournaledMatch();')<connect.indexOf('unsubscribe=resilientSnapshot(roomRef'));
  assert.match(source,/function startMatch\(\)\{if\(matchInProgress\(state\.match\)&&!confirm\(/);
});
