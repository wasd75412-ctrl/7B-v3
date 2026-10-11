import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFinishedMatchRollback, createPreviousMatchSnapshot, inferFinishedMatchRollback, previousMatchToRestore, reopenFinishedMatchState } from '../src/match-correction.js';

test('reopening a newly finished match removes its result and restores scheduling exactly',()=>{
  const before={
    waitingQueue:['p5','p6','p7'],queueDraftChosen:[],priority:'p5',nextCall:null,
    court:['p1','p2','p3','p4']
  };
  const rollback=createFinishedMatchRollback(before,'match-1');
  const finished={
    ...before,
    history:[{matchId:'older'},{matchId:'match-1',teams:[['p1','p2'],['p3','p4']],winner:0}],
    waitingQueue:['p7','p3','p4'],queueDraftChosen:['p5','p6'],priority:'p7',
    nextCall:{players:['p1','p5','p2','p6'],createdAt:'now'},matchRollback:rollback
  };
  const result=reopenFinishedMatchState(finished,'match-1');
  assert.equal(result.reopened,true);
  assert.deepEqual(result.history,[{matchId:'older'}]);
  assert.deepEqual(result.waitingQueue,before.waitingQueue);
  assert.deepEqual(result.queueDraftChosen,[]);
  assert.equal(result.priority,'p5');
  assert.equal(result.nextCall,null);
  assert.deepEqual(result.court,before.court);
  assert.equal(result.matchRollback,null);
});

test('older finished matches can infer their pre-finish queue without rollback metadata',()=>{
  const record={matchId:'legacy',teams:[['p1','p2'],['p3','p4']],winner:0};
  const rollback=inferFinishedMatchRollback({
    match:{matchId:'legacy',winner:0,players:record.teams},
    nextCall:{players:['p2','p6','p1','p5']},
    waitingQueue:['p7','p3','p4']
  },record);
  assert.equal(rollback.inferred,true);
  assert.deepEqual(rollback.waitingQueue,['p6','p5','p7']);
  assert.equal(rollback.priority,'p6');
  assert.deepEqual(rollback.court,['p1','p2','p3','p4']);
});

test('reopen is safe when there is no matching finished result',()=>{
  assert.deepEqual(reopenFinishedMatchState({history:[{matchId:'other'}]},'missing'),{reopened:false});
});

const finishedMatch=()=>({active:true,matchId:'match-1',winner:0,players:[['p1','p2'],['p3','p4']],scores:[11,9],rallies:[0,1,0],startedAt:'2026-10-10T10:00:00.000Z'});

test('starting the next match keeps the finished match and its pre-finish queue',()=>{
  const before={waitingQueue:['p5','p6'],queueDraftChosen:[],priority:'p5',nextCall:null,court:['p1','p2','p3','p4']};
  const state={...before,match:finishedMatch(),history:[{matchId:'match-1',teams:[['p1','p2'],['p3','p4']],winner:0}],matchRollback:createFinishedMatchRollback(before,'match-1'),waitingQueue:['p3','p4'],nextCall:{players:['p1','p2','p5','p6']}};
  const snapshot=createPreviousMatchSnapshot(state,'match-2');
  assert.equal(snapshot.nextMatchId,'match-2');
  assert.deepEqual(snapshot.match.rallies,[0,1,0]);
  assert.deepEqual(snapshot.rollback.waitingQueue,['p5','p6']);
  state.match.rallies.push(1);
  assert.deepEqual(snapshot.match.rallies,[0,1,0]);
});

test('the previous match can be restored only while the next match is still being played',()=>{
  const before={waitingQueue:['p5','p6'],queueDraftChosen:[],priority:'p5',nextCall:null,court:['p1','p2','p3','p4']};
  const snapshot=createPreviousMatchSnapshot({...before,match:finishedMatch(),history:[],matchRollback:createFinishedMatchRollback(before,'match-1')},'match-2');
  const restore=previousMatchToRestore(snapshot,{active:true,matchId:'match-2',winner:null,rallies:[1,1]});
  assert.equal(restore.match.matchId,'match-1');
  assert.deepEqual(restore.match.rallies,[0,1,0]);
  assert.deepEqual(restore.rollback.court,['p1','p2','p3','p4']);
  assert.equal(previousMatchToRestore(snapshot,{active:true,matchId:'match-2',winner:1,rallies:[1]}),null);
  assert.equal(previousMatchToRestore(snapshot,{active:true,matchId:'match-3',winner:null,rallies:[]}),null);
  assert.equal(previousMatchToRestore(snapshot,{active:false,winner:null}),null);
});

test('a finished match without rollback metadata still infers its queue for a later restore',()=>{
  const state={match:finishedMatch(),history:[{matchId:'match-1',teams:[['p1','p2'],['p3','p4']],winner:0}],nextCall:{players:['p1','p2','p5','p6']},waitingQueue:['p7','p3','p4']};
  const snapshot=createPreviousMatchSnapshot(state,'match-2');
  assert.equal(snapshot.rollback.inferred,true);
  assert.deepEqual(snapshot.rollback.waitingQueue,['p5','p6','p7']);
});

test('no snapshot is kept for a match that never finished',()=>{
  assert.equal(createPreviousMatchSnapshot({match:{...finishedMatch(),winner:null}},'match-2'),null);
  assert.equal(createPreviousMatchSnapshot({match:finishedMatch()},''),null);
});

test('the score view offers a confirmed return to the previous match',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(html,/id="returnPreviousMatch"/);
  assert.match(source,/const nextMatchId=randomToken\(\);savePreviousMatchSnapshot\(createPreviousMatchSnapshot\(state,nextMatchId\)\);/);
  const handler=source.match(/function returnToPreviousMatch\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(handler,/confirm\(/);
  assert.match(handler,/state\.matchRollback=restore\.rollback;\s*performScoreRemoteAction\('undo'\)/);
});
