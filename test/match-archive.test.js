import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELETED_MATCH_KEEP, ROOM_HISTORY_KEEP, decodeArchivedMatch, encodeArchivedMatch, mergeDeletedMatchIds, mergeMatchHistory, overflowHistory, readPendingArchives, recentHistory, shouldSkipFullRoomSync, writePendingArchives } from '../src/match-archive.js';

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('keeps only the latest room matches and archives the older ones',()=>{
  const history=Array.from({length:42},(_,index)=>({matchId:`m${index}`}));
  assert.equal(ROOM_HISTORY_KEEP,40);
  assert.deepEqual(recentHistory(history).map(row=>row.matchId),history.slice(-40).map(row=>row.matchId));
  assert.deepEqual(overflowHistory(history).map(row=>row.matchId),['m0','m1']);
});

test('merges archived matches ahead of the room copy without restoring deletions',()=>{
  const archived=[
    {matchId:'old',endedAt:'2026-09-01T00:00:00.000Z',teams:[['a'],['b']],scores:[11,8],winner:0},
    {matchId:'keep',endedAt:'2026-09-02T00:00:00.000Z'}
  ];
  const room=[{matchId:'keep',endedAt:'2026-09-02T00:00:00.000Z',scores:[11,9],winner:1},{matchId:'new',endedAt:'2026-09-03T00:00:00.000Z'}];
  const merged=mergeMatchHistory(room,archived,new Set(['old']));
  assert.deepEqual(merged.map(row=>row.matchId),['keep','new']);
  assert.deepEqual(merged[0].scores,[11,9]);
  const duplicate=mergeMatchHistory(
    [{matchId:'room-copy',startedAt:'2026-09-30T11:10:05.000Z',scores:[11,7]}],
    [{matchId:'archive-copy',startedAt:'2026-09-30T11:10:05.000Z',scores:[1,0]}],
    []
  );
  assert.equal(duplicate.length,1);
  assert.deepEqual(duplicate[0].scores,[11,7]);
});

test('deleted match ids merge across devices and stay bounded',()=>{
  assert.deepEqual(mergeDeletedMatchIds(['a','b'],new Set(['b','c']),[null,'',' d ']),['a','b','c','d']);
  const many=Array.from({length:DELETED_MATCH_KEEP+5},(_,index)=>`m${index}`);
  const kept=mergeDeletedMatchIds(many);
  assert.equal(kept.length,DELETED_MATCH_KEEP);
  assert.equal(kept.at(-1),`m${DELETED_MATCH_KEEP+4}`);
  const stale=[{matchId:'gone',endedAt:'2026-09-01T00:00:00.000Z'},{matchId:'kept',endedAt:'2026-09-02T00:00:00.000Z'}];
  assert.deepEqual(mergeMatchHistory(stale,[],new Set(mergeDeletedMatchIds(['gone']))).map(row=>row.matchId),['kept']);
});

test('deleted matches are synced through the room and purged from the local archive cache',()=>{
  assert.match(mainSource,/deletedMatchIds:mergeDeletedMatchIds\(src\.deletedMatchIds\)/);
  assert.match(mainSource,/next\.deletedMatchIds=mergeDeletedMatchIds\(state\.deletedMatchIds,next\.deletedMatchIds\);\s*next\.deletedMatchIds\.forEach\(id=>removedMatchIds\.add\(id\)\)/);
  const forget=mainSource.match(/function forgetArchivedMatches\(matchIds\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(forget,/state\.deletedMatchIds=mergeDeletedMatchIds\(state\.deletedMatchIds,ids\)/);
  assert.match(forget,/writeArchiveCache\(localStorage,roomId,\{rows:cache\.rows\.filter\(row=>!ids\.has\(row\.matchId\)\)/);
  const load=mainSource.match(/async function loadMatchArchive\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(load,/\.filter\(row=>!removedMatchIds\.has\(row\.matchId\)&&!settled\(row\)\);\s*writeArchiveCache/);
  assert.match(load,/deleteArchivedMatches\(staleIds\)/);
});

test('stores a flat match record that Firestore can write',()=>{
  const encoded=encodeArchivedMatch({matchId:'m1',teams:[['a','b'],['c']],scores:[11,7],winner:0,format:'singles',endedAt:'2026-09-30T00:00:00.000Z'});
  assert.equal(encoded.teamA1,'a');
  assert.equal(encoded.teamB2,'');
  assert.equal(Array.isArray(encoded.teams),false);
  assert.equal(decodeArchivedMatch(encoded).teams[0][0],'a');
});

test('lite mode skips full room writes only while a match is still open',()=>{
  assert.equal(shouldSkipFullRoomSync({mode:'lite',matchActive:true,matchOpen:true}),true);
  assert.equal(shouldSkipFullRoomSync({mode:'lite',matchActive:true,matchOpen:false}),false);
  assert.equal(shouldSkipFullRoomSync({mode:'full',matchActive:true,matchOpen:true}),false);
});

test('keeps failed archive writes for a later retry',()=>{
  const storage=new Map();
  const memory={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  writePendingArchives(memory,'ROOM1',[{matchId:'m1'}]);
  assert.deepEqual(readPendingArchives(memory,'ROOM1'),[{matchId:'m1'}]);
  writePendingArchives(memory,'ROOM1',[]);
  assert.deepEqual(readPendingArchives(memory,'ROOM1'),[]);
});

test('room sync keeps forty matches and can switch back to full sync',()=>{
  assert.match(mainSource,/encoded\.history=recentHistory\(encoded\.history\)/);
  assert.match(mainSource,/generalRoomStateWithoutMatch\(roomEncodedState\(\)\)/);
  assert.match(mainSource,/shouldSkipFullRoomSync\(\{mode:currentSyncMode\(\),matchActive:!!state\.match\?\.active,matchOpen:state\.match\?\.winner==null\}\)/);
  assert.match(mainSource,/await slimRoomHistoryIfNeeded\(\)/);
  assert.match(html,/id="syncModeLite"/);
  assert.match(html,/id="syncModeFull"/);
  assert.match(html,/>比賽中只同步比分</);
  assert.match(html,/>整包同步</);
});
