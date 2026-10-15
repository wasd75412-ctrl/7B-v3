import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOST_SNAPSHOT_MAX_AGE_MS,cloudMatchIsAhead,hostSnapshotEntry,hostSnapshotKey,hostSnapshotToRestore,readHostSnapshot} from '../src/host-snapshot.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const now=Date.parse('2026-10-15T02:00:34Z');
const state={court:['a','b','c','d'],waitingQueue:['e'],history:[{matchId:'m3'}],match:{matchId:'m4',active:true,winner:null,rallies:[]}};

test('a reload puts back the scorer state the cloud never received',()=>{
  const entry=hostSnapshotEntry({state,base:{adminPinHash:'pin',hostToken:'host'},cloudAt:1000,now});
  assert.equal(entry.dirty,true);
  assert.deepEqual(hostSnapshotToRestore(entry,{cloudAt:1000,now:now+5000}),state);
  assert.deepEqual(hostSnapshotToRestore(entry,{cloudAt:0,now:now+5000}),state);
});

test('the cloud copy wins once it moved on or the local copy was already saved',()=>{
  const entry=hostSnapshotEntry({state,cloudAt:1000,now});
  assert.equal(hostSnapshotToRestore(entry,{cloudAt:1001,now}),null);
  assert.equal(hostSnapshotToRestore({...entry,dirty:false},{cloudAt:1000,now}),null);
  assert.equal(hostSnapshotToRestore(entry,{cloudAt:1000,now:now+HOST_SNAPSHOT_MAX_AGE_MS+1}),null);
  assert.equal(hostSnapshotToRestore(null,{cloudAt:1000,now}),null);
});

test('an offline start opens the room from the scorer copy',()=>{
  const entry={...hostSnapshotEntry({state,base:{adminPinHash:'pin',hostToken:'host'},cloudAt:1000,now}),dirty:false};
  assert.deepEqual(hostSnapshotToRestore(entry,{cloudAt:null,now}),{adminPinHash:'pin',hostToken:'host',...state});
});

test('reads a missing or damaged copy as nothing to restore',()=>{
  const storage=value=>({getItem:key=>key===hostSnapshotKey('RTYBSJ')?value:null});
  assert.equal(readHostSnapshot(storage(null),'RTYBSJ'),null);
  assert.equal(readHostSnapshot(storage('{bad'),'RTYBSJ'),null);
  assert.equal(readHostSnapshot(storage('{"savedAt":1}'),'RTYBSJ'),null);
  assert.equal(readHostSnapshot({getItem(){throw new Error('blocked')}},'RTYBSJ'),null);
  assert.deepEqual(readHostSnapshot(storage(JSON.stringify({savedAt:1,state})),'RTYBSJ').state,state);
});

test('a live score is only taken over the restored copy when it is further along',()=>{
  const finished={matchId:'m3',winner:0,rallies:[0,1,0],syncEpoch:30};
  const open={matchId:'m3',winner:null,rallies:[0,1],syncEpoch:30};
  assert.equal(cloudMatchIsAhead(finished,{matchId:'m3',winner:null,rallies:[0,1,0,0],syncEpoch:30}),false);
  assert.equal(cloudMatchIsAhead(open,{matchId:'m3',winner:null,rallies:[0,1,0],syncEpoch:30}),true);
  assert.equal(cloudMatchIsAhead(open,{matchId:'m3',winner:null,rallies:[0],syncEpoch:30}),false);
  assert.equal(cloudMatchIsAhead(finished,{matchId:'m2',syncEpoch:20}),false);
  assert.equal(cloudMatchIsAhead(finished,{matchId:'m4',syncEpoch:40}),true);
  assert.equal(cloudMatchIsAhead(finished,{}),false);
});

test('the scorer keeps its copy current and restores it before listening again',()=>{
  for(const name of ['saveSoon(delay=120)','async function saveNow()','async function saveNewMatchCheckpointNow()','async function persistLineupNow()']){
    const body=main.slice(main.indexOf(name),main.indexOf('\n}',main.indexOf(name)));
    assert.match(body,/persistHostSnapshot\(\)/,name);
    assert.match(body,/markHostSnapshotSynced\(/,name);
  }
  assert.match(main,/const offlineRoom=roomInitial\.status==='rejected'\|\|\(!roomInitial\.value\.exists\(\)&&roomInitial\.value\.metadata\.fromCache\)\?hostSnapshotToRestore\(savedHost,\{cloudAt:null\}\):null;/);
  assert.match(main,/applyState\(unsyncedHost\?\{\.\.\.data,\.\.\.unsyncedHost\}:data\);/);
  assert.match(main,/if\(!restoredHost\|\|cloudMatchIsAhead\(state\.match,decodeLiveMatch\(liveData,state\.match\)\)\)applyLiveScoreState\(liveData,\{announce:false\}\);/);
  assert.match(main,/restoreJournaledMatch\(\);\s*if\(restoredHost\)\{void saveNow\(\)\.catch\(\(\)=>\{\}\);checkpointNewMatch\(\)\}/);
  assert.match(main,/lastRoomSnapshotData=s\.data\(\);\s*noteHostCloudSnapshot\(s\);/);
});
