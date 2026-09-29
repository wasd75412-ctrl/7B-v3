import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
  createLiveScoreData,createMatchCheckpointData,decodeLiveMatch,encodeLiveMatch,
  matchSessionEpoch,nextMatchEpoch,shouldApplyIncomingLiveMatch
} from '../src/live-score.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function productionFunction(name){
  const declaration=new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(main);
  assert.ok(declaration,`Production function ${name} must exist`);
  const rest=main.slice(declaration.index+declaration[0].length);
  const next=/^(?:async )?function \w+\(/m.exec(rest);
  assert.ok(next,`Production function ${name} must have a following declaration`);
  return main.slice(declaration.index,declaration.index+declaration[0].length+next.index);
}

const start=Date.parse('2026-09-05T12:00:00.000Z');
function match(id,offset,extra={}){
  return{
    active:true,matchId:id,syncEpoch:start+offset,startedAt:new Date(start+offset).toISOString(),
    players:[['a','b'],['c','d']],positions:[[0,1],[0,1]],serving:0,
    scores:[3,2],rallies:[0,1,0,1,0],winner:null,...extra
  };
}
const previous=match('A',0,{scores:[11,8],winner:0});
const current=match('B',60_000);
const future=match('C',120_000,{scores:[0,0],rallies:[]});
const idle=()=>({active:false,matchId:null,startedAt:'',players:[[],[]],positions:[[0,1],[0,1]],scores:[0,0],rallies:[],winner:null});
function roomState(liveMatch){
  return{
    match:structuredClone(liveMatch),rules:{target:11,cap:15,deuce:true},roster:[],history:[],
    court:['a','b','c','d'],nextCall:{players:['e','f','g','h'],createdAt:'current'},
    matchRollback:null,waitingQueue:['e','f','g','h'],queueDraftChosen:['e','f'],
    priority:'e',lastLoserReplayPlayerId:'a'
  };
}

function harness(liveMatch=current,overrides={}){
  const calls={finish:0,render:0,publish:0,batches:[],sync:[],errors:[]};
  const context=vm.createContext({
    state:roomState(liveMatch),structuredClone,console,clearTimeout,
    initialState:()=>roomState(idle()),isHost:true,requestedAndroidRemote:false,scoreViewRequested:true,
    liveScoreWriteScheduled:false,pendingLiveScoreWrites:0,liveScoreSaveTimer:null,saveTimer:null,roomWriteScheduled:false,
    applying:false,liveScoreAvailable:true,liveScoreReady:false,latestLiveMatch:null,
    roomRef:'room/current',liveScoreRef:'room/current/liveScore/current',db:{},
    shouldApplyIncomingLiveMatch,decodeLiveMatch,createMatchCheckpointData,nextMatchEpoch,
    normalizeFinishedMatchRollback:value=>value??null,
    normalizeRetiredPlayers:value=>value??[],normalizeMatchReplayTitle:value=>value??'',
    normalizeYouTubePlaylistUrl:value=>value??'',cleanManualPollParticipants:value=>value??{},
    cleanPollHistory:value=>value??[],cleanNextEvent:value=>value??null,
    normalizeNextEvents:value=>value.nextEvents??[],normalizeAdminNotices:value=>value.adminNotices??[],
    enforceLegacyActiveShuttleTube:value=>value??[],
    renderAll:()=>calls.render++,renderScore:()=>calls.render++,renderDashboard:()=>calls.render++,
    renderAndroidRemote:()=>calls.render++,announceSyncedScore:()=>{},
    finishMatch:()=>calls.finish++,saveLiveScoreSoon:()=>calls.publish++,saveSoon:()=>calls.publish++,
    setDoc:()=>{calls.publish++;return Promise.resolve()},
    serverTimestamp:()=>({serverTimestamp:true}),updateSyncBadge:()=>{},
    setSync:(...args)=>calls.sync.push(args),setError:error=>calls.errors.push(error),formatError:error=>error.message,
    writeBatch:()=>{
      const batch={writes:[],commits:0};calls.batches.push(batch);
      return{
        set:(ref,data,options)=>batch.writes.push({ref,data,options}),
        commit:()=>{batch.commits++;return Promise.resolve()}
      };
    },
    ...overrides
  });
  context.payload=()=>{
    const {match:_match,...general}=structuredClone(context.state);
    return{...general,liveScoreEnabled:true};
  };
  for(const name of ['decodeState','cleanState','matchScoreSignature','canApplyMatch','applyState',
    'applyLiveScoreState','rememberLatestLiveMatch','saveNewMatchCheckpointNow','adoptRestoredState']){
    vm.runInContext(productionFunction(name),context,{filename:`main.js:${name}`});
  }
  return{context,calls};
}

test('actual live handler rejects old finished game after all new-game writes have settled',()=>{
  for(const isHost of [true,false]){
    const {context,calls}=harness(current,{isHost});
    assert.equal(context.pendingLiveScoreWrites,0);
    assert.equal(context.applyLiveScoreState({...createLiveScoreData(previous),updatedAt:new Date(start+180_000)}),false);
    assert.equal(context.state.match.matchId,'B');
    assert.equal(context.state.match.winner,null);
    assert.equal(calls.finish,0);
    assert.equal(calls.render,0);
  }
});

test('actual room handler preserves current game and rotation when an old fallback arrives without republishing it',()=>{
  const {context,calls}=harness();
  const before=structuredClone(context.state);
  const stale={...roomState(previous),court:['old-a','old-b','old-c','old-d'],
    nextCall:null,waitingQueue:['old-waiter'],queueDraftChosen:[],priority:'old-waiter',
    matchRollback:{match:previous},lastLoserReplayPlayerId:'old-a',adminNotices:[{title:'new notice'}]};
  context.applyState(stale);
  for(const key of ['match','court','nextCall','waitingQueue','queueDraftChosen','priority','matchRollback','lastLoserReplayPlayerId']){
    assert.deepEqual(structuredClone(context.state[key]),before[key],key);
  }
  assert.deepEqual(structuredClone(context.state.adminNotices),stale.adminNotices);
  assert.equal(calls.finish,0);
  assert.equal(calls.publish,0);
  assert.equal(calls.batches.length,0);
});

test('actual live handler finishes the current game once and accepts undo within the same game',()=>{
  const {context,calls}=harness();
  const finished=createLiveScoreData({...current,winner:0,scores:[11,8]});
  assert.equal(context.applyLiveScoreState(finished),true);
  assert.equal(context.state.match.winner,0);
  assert.equal(calls.finish,1);
  assert.equal(context.applyLiveScoreState(finished),true);
  assert.equal(calls.finish,1);
  assert.equal(context.applyLiveScoreState(createLiveScoreData(current)),true);
  assert.equal(context.state.match.winner,null);
  assert.deepEqual(context.state.match.scores,[3,2]);
  assert.equal(calls.finish,1);
});

test('actual live handler accepts a genuinely newer game and then rejects both earlier games',()=>{
  const {context,calls}=harness();
  assert.equal(context.applyLiveScoreState(createLiveScoreData(future)),true);
  assert.equal(context.state.match.matchId,'C');
  assert.equal(context.applyLiveScoreState(createLiveScoreData(current)),false);
  assert.equal(context.applyLiveScoreState(createLiveScoreData(previous)),false);
  assert.equal(context.state.match.matchId,'C');
  assert.equal(calls.finish,0);
});

test('cold startup keeps newer room game B when the first live snapshot is finished game A',()=>{
  const {context,calls}=harness(idle());
  context.applyState(roomState(current));
  assert.equal(context.state.match.matchId,'B');
  assert.equal(context.liveScoreReady,false);
  assert.equal(context.applyLiveScoreState(createLiveScoreData(previous),{announce:false}),false);
  assert.equal(context.state.match.matchId,'B');
  assert.equal(context.state.match.winner,null);
  assert.equal(context.applyLiveScoreState(createLiveScoreData(current),{announce:false}),true);
  assert.equal(context.liveScoreReady,true);
  assert.equal(calls.finish,0);
  assert.equal(calls.publish,0);
});

test('checkpoint commits matching room and live epochs together with the new rotation',async()=>{
  let resolveCommit;
  const {context,calls}=harness(current,{
    writeBatch:()=>{
      const batch={writes:[],commits:0};calls.batches.push(batch);
      return{
        set:(ref,data,options)=>batch.writes.push({ref,data,options}),
        commit:()=>{batch.commits++;return new Promise(resolve=>{resolveCommit=resolve})}
      };
    }
  });
  const rotation=structuredClone(context.state);
  const saving=context.saveNewMatchCheckpointNow();
  assert.equal(calls.batches.length,1);
  assert.equal(calls.batches[0].commits,1);
  assert.equal(context.pendingLiveScoreWrites,1);
  const writes=calls.batches[0].writes;
  assert.equal(writes.length,2);
  const live=writes.find(write=>write.ref===context.liveScoreRef);
  const room=writes.find(write=>write.ref===context.roomRef);
  assert.deepEqual(structuredClone(live.data.match),structuredClone(room.data.match));
  assert.equal(live.data.match.matchId,'B');
  assert.equal(live.data.match.syncEpoch,current.syncEpoch);
  assert.equal(room.data.liveScoreEnabled,true);
  for(const key of ['court','nextCall','waitingQueue','queueDraftChosen','priority']){
    assert.deepEqual(structuredClone(room.data[key]),rotation[key],key);
  }
  context.state.match=structuredClone(future);
  resolveCommit();await saving;
  assert.equal(context.pendingLiveScoreWrites,0);
  assert.equal(live.data.match.matchId,'B');
  assert.equal(calls.publish,0);
});

test('checkpoint failure reports the error and releases the pending write guard',async()=>{
  const failure=new Error('offline');
  const {context,calls}=harness(current,{writeBatch:()=>({set:()=>{},commit:()=>Promise.reject(failure)})});
  await assert.rejects(context.saveNewMatchCheckpointNow(),failure);
  assert.equal(context.pendingLiveScoreWrites,0);
  assert.deepEqual(calls.errors,['offline']);
});

test('Android remote cannot publish a match checkpoint',async()=>{
  const {context,calls}=harness(current,{requestedAndroidRemote:true});
  await context.saveNewMatchCheckpointNow();
  assert.equal(calls.batches.length,0);
  assert.equal(calls.publish,0);
});

test('session epochs use a stable match timestamp and increase even if the local clock moves backwards',()=>{
  assert.equal(matchSessionEpoch({startedAt:current.startedAt}),current.syncEpoch);
  assert.equal(matchSessionEpoch({...current,startedAt:previous.startedAt}),current.syncEpoch);
  assert.equal(nextMatchEpoch(current,start),current.syncEpoch+1);
  assert.equal(nextMatchEpoch(current,future.syncEpoch),future.syncEpoch);
  assert.equal(nextMatchEpoch(current,current.syncEpoch),current.syncEpoch+1);
});

test('match encode/decode retains epochs for a session without borrowing them for a different legacy session',()=>{
  assert.equal(encodeLiveMatch(current).syncEpoch,current.syncEpoch);
  assert.equal(decodeLiveMatch(createLiveScoreData(current)).syncEpoch,current.syncEpoch);
  const legacySame={...current};delete legacySame.syncEpoch;
  assert.equal(decodeLiveMatch({match:legacySame},current).syncEpoch,current.syncEpoch);
  const legacyPrevious={...previous};delete legacyPrevious.syncEpoch;
  const decoded=decodeLiveMatch({match:legacyPrevious},current);
  assert.equal(decoded.syncEpoch,0);
  assert.equal(matchSessionEpoch(decoded),previous.syncEpoch);
  assert.equal(shouldApplyIncomingLiveMatch({currentMatch:current,incomingMatch:decoded}),false);
});

test('pure session guard orders different matches after pending clears and allows same-session score undo',()=>{
  for(const isHost of [true,false]){
    const options={isHost,writePending:false,currentMatch:current};
    assert.equal(shouldApplyIncomingLiveMatch({...options,incomingMatch:previous}),false);
    assert.equal(shouldApplyIncomingLiveMatch({...options,incomingMatch:future}),true);
    assert.equal(shouldApplyIncomingLiveMatch({...options,incomingMatch:{...current,winner:0}}),true);
    assert.equal(shouldApplyIncomingLiveMatch({...options,currentMatch:{...current,winner:0},incomingMatch:current}),true);
    assert.equal(shouldApplyIncomingLiveMatch({...options,incomingMatch:{...current,syncEpoch:previous.syncEpoch}}),false);
  }
});

test('a genuinely newer match wins even while a previous score write is still pending',()=>{
  const {context}=harness(current,{pendingLiveScoreWrites:1});
  assert.equal(context.applyLiveScoreState(createLiveScoreData(future)),true);
  assert.equal(context.state.match.matchId,'C');
});

test('room fallback can update the same match when the live channel is unavailable, but never an older match',()=>{
  const {context}=harness(current,{liveScoreAvailable:false,liveScoreReady:false,latestLiveMatch:current});
  context.applyState(roomState({...current,scores:[4,2]}));
  assert.deepEqual(structuredClone(context.state.match.scores),[4,2]);
  context.applyState(roomState(previous));
  assert.equal(context.state.match.matchId,'B');
});

test('explicit backup restore and session end get a fresh epoch instead of allowing old snapshots back',()=>{
  for(const restored of [previous,idle()]){
    const {context}=harness();
    context.adoptRestoredState(roomState(restored));
    assert.ok(context.state.match.syncEpoch>current.syncEpoch);
    assert.equal(context.applyLiveScoreState(createLiveScoreData(current)),false);
    assert.equal(context.state.match.matchId,restored.matchId);
    assert.equal(context.latestLiveMatch.syncEpoch,context.state.match.syncEpoch);
  }
});

test('a newer finished match renders its own result and lineup without replaying completion writes',()=>{
  const nodes=new Map();
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'old A result',value:'old-player',classList:{toggle:()=>{}}});
    return nodes.get(id);
  };
  const {context,calls}=harness(current,{$:element,lastRoomSnapshotData:roomState(previous),
    options:id=>id,updatePriority:()=>{},updateUseShuttleButtons:()=>{},projectedQueueForLineup:()=>[],queueLabel:()=>'',pname:id=>id});
  vm.runInContext(productionFunction('renderFinishedMatchResult'),context);
  context.applyLiveScoreState(createLiveScoreData({...future,winner:1,scores:[8,11],players:[['w','x'],['y','z']]}));
  context.renderFinishedMatchResult();
  assert.equal(element('winnerTitle').textContent,'B隊獲勝');
  assert.equal(element('finalScore').textContent,'8：11');
  assert.deepEqual([0,1,2,3].map(i=>element('n'+i).value),['w','x','y','z']);
  assert.equal(calls.finish,0);
  assert.equal(calls.publish,0);
  context.lastRoomSnapshotData=roomState(context.state.match);
  context.state.nextCall={players:['y','z','w','x']};
  context.renderFinishedMatchResult();
  assert.deepEqual([0,1,2,3].map(i=>element('n'+i).value),['y','z','w','x']);
});
