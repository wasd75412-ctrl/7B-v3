import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveScoreData,decodeLiveMatch,encodeLiveMatch,liveMatchKey,shouldAnnounceSyncedLiveScore,LIVE_SCORE_SCHEMA_VERSION} from '../src/live-score.js';

test('encodes Firestore-safe live score without nested arrays',()=>{
  const data=createLiveScoreData({
    active:true,
    players:[['a','b'],['c','d']],
    scores:[10,9],
    rallies:[0,1,0],
    serving:1,
    positions:[[1,0],[0,1]],
    winner:null,
    startedAt:'2026-07-22T00:00:00.000Z'
  });

  assert.equal(data.schemaVersion,LIVE_SCORE_SCHEMA_VERSION);
  assert.deepEqual(data.match.teamA,['a','b']);
  assert.deepEqual(data.match.teamB,['c','d']);
  assert.equal(Array.isArray(data.match.teamA[0]),false);
  assert.equal(JSON.stringify(data).length<1000,true);
});

test('decodes live score while preserving compatible fallback fields',()=>{
  const fallback={active:false,players:[[],[]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null,custom:'keep'};
  const decoded=decodeLiveMatch({match:{active:true,teamA:['a','b'],teamB:['c','d'],scores:[11,8],rallies:[0,1],serving:0,posA:[1,0],posB:[0,1],winner:0,matchId:'m1',startedAt:'now'}},fallback);

  assert.deepEqual(decoded.players,[['a','b'],['c','d']]);
  assert.deepEqual(decoded.positions,[[1,0],[0,1]]);
  assert.deepEqual(decoded.scores,[11,8]);
  assert.equal(decoded.winner,0);
  assert.equal(decoded.custom,'keep');
});

test('normalizes malformed live score values',()=>{
  const encoded=encodeLiveMatch({scores:[-2,'4'],rallies:[0,2,1,'0'],serving:4,winner:3});
  assert.deepEqual(encoded.scores,[0,4]);
  assert.deepEqual(encoded.rallies,[0,1]);
  assert.equal(encoded.serving,0);
  assert.equal(encoded.winner,null);
});

test('creates the same compatibility key for encoded and decoded matches',()=>{
  const decoded={active:true,players:[['a','b'],['c','d']],scores:[3,2],rallies:[0,1,0,0,1],serving:1,positions:[[1,0],[0,1]],winner:null,matchId:'m1',startedAt:'now'};
  assert.equal(liveMatchKey(decoded),liveMatchKey(encodeLiveMatch(decoded)));
});

test('announces a remote score update on the visible iPad scoreboard',()=>{
  assert.equal(shouldAnnounceSyncedLiveScore({announce:true,snapshotReady:true,changed:true,scoreVisible:true,androidRemote:false,matchActive:true,voiceEnabled:true}),true);
});

test('does not announce initial, hidden, disabled, or Android remote snapshots',()=>{
  const ready={announce:true,snapshotReady:true,changed:true,scoreVisible:true,androidRemote:false,matchActive:true,voiceEnabled:true};
  for(const blocked of [
    {...ready,snapshotReady:false},
    {...ready,changed:false},
    {...ready,scoreVisible:false},
    {...ready,androidRemote:true},
    {...ready,matchActive:false},
    {...ready,voiceEnabled:false}
  ])assert.equal(shouldAnnounceSyncedLiveScore(blocked),false);
});
