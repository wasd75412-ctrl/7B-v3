import test from 'node:test';
import assert from 'node:assert/strict';
import { deletePlayerFromState } from '../src/player-deletion.js';

const baseState=()=>({
  roster:[{id:'p1',name:'保留者'},{id:'p2',name:'已刪球員'}],retiredPlayers:[],adminPlayerIds:['p2'],
  attendance:['p1','p2'],court:['p1','p2'],waitingQueue:['p2'],queueDraftChosen:['p2'],priority:'p2',
  nextCall:{players:['p1','p2','p3','p4'],createdAt:'now'},lastLoserReplayPlayerId:'p2',
  match:{active:false,winner:1,players:[['p1','p2'],['p3','p4']]},
  matchRollback:{matchId:'m1',waitingQueue:['p2'],queueDraftChosen:['p2'],court:['p1','p2'],priority:'p2',nextCall:{players:['p1','p2','p3','p4']}},
  history:[{teams:[['p1','p2'],['p3','p4']]}],shuttleTubes:[],
  schedulePoll:{votes:{device:'choice'},voterPlayers:{device:'p2'}}
});

test('deleting a player cleans every active scheduling reference and keeps history identity',()=>{
  const result=deletePlayerFromState(baseState(),'p2');
  assert.equal(result.deleted,true);
  assert.deepEqual(result.state.roster,[{id:'p1',name:'保留者'}]);
  assert.deepEqual(result.state.retiredPlayers,[{id:'p2',name:'已刪球員',avatar:''}]);
  assert.deepEqual(result.state.adminPlayerIds,[]);
  assert.deepEqual(result.state.attendance,['p1']);
  assert.deepEqual(result.state.court,['p1']);
  assert.deepEqual(result.state.waitingQueue,[]);
  assert.equal(result.state.priority,null);
  assert.equal(result.state.nextCall,null);
  assert.equal(result.state.lastLoserReplayPlayerId,null);
  assert.deepEqual(result.state.schedulePoll,{votes:{},voterPlayers:{}});
  assert.equal(result.state.history.length,1);
});

test('does not delete a player from an unfinished live match',()=>{
  const state=baseState();state.match={active:true,winner:null,players:[['p1','p2'],['p3','p4']]};
  const result=deletePlayerFromState(state,'p2');
  assert.equal(result.deleted,false);
  assert.equal(result.reason,'active-match');
  assert.equal(result.state,state);
});
