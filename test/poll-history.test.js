import test from 'node:test';
import assert from 'node:assert/strict';
import { POLL_UNAVAILABLE, prunePollHistoryRows } from '../src/poll-history.js';

test('removes only expired dates and keeps the remaining previous-poll choices',()=>{
  const rows=[{id:'previous',options:[
    {id:'past',date:'2026-09-28'},
    {id:'today',date:'2026-09-29'},
    {id:'future',date:'2026-10-04'}
  ],votes:{a:'past|future',b:'past',c:`today|${POLL_UNAVAILABLE}`},voterPlayers:{a:'p1',b:'p2',c:'p3'},manualParticipants:{past:['p4'],future:['p5']}}];
  const result=prunePollHistoryRows(rows,'2026-09-29');
  assert.deepEqual(result[0].options.map(option=>option.id),['today','future']);
  assert.deepEqual(result[0].votes,{a:'future',c:`today|${POLL_UNAVAILABLE}`});
  assert.deepEqual(result[0].voterPlayers,{a:'p1',c:'p3'});
  assert.deepEqual(result[0].manualParticipants,{future:['p5']});
});

test('deletes a previous poll only after every date in it has expired',()=>{
  const rows=[{id:'previous',options:[{id:'last-day',date:'2026-10-04'}],votes:{a:'last-day'},voterPlayers:{a:'p1'}}];
  assert.equal(prunePollHistoryRows(rows,'2026-10-04').length,1);
  assert.equal(prunePollHistoryRows(rows,'2026-10-05').length,0);
});
