import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinishedMatchRollback, inferFinishedMatchRollback, reopenFinishedMatchState } from '../src/match-correction.js';

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
