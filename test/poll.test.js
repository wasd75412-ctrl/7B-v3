import test from 'node:test';
import assert from 'node:assert/strict';
import { pollWasFinalized } from '../src/poll.js';

test('a deadline-closed poll with candidates can still be announced by the admin',()=>{
  assert.equal(pollWasFinalized({status:'closed',options:[{id:'date-1'}]}),false);
});

test('a closed poll with cleared candidates was already published',()=>{
  assert.equal(pollWasFinalized({status:'closed',options:[]}),true);
});
