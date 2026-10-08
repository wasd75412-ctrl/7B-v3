import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { archiveCacheNeedsFullRefresh, archiveSyncCursor, mergeArchiveRows, readArchiveCache, writeArchiveCache } from '../src/match-archive.js';
import { isStaleMatchPressForCurrentMatch } from '../src/remote-command.js';
import { chatIndexKey, sortedChatMessages } from '../netlify/functions/chat-mention.mjs';
import { isUnchangedRefresh } from '../netlify/functions/push-subscription.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const main=read('../src/main.js');
const chat=read('../netlify/functions/chat-mention.mjs');
const media=read('../netlify/functions/chat-media.mjs');
const recordings=read('../android-remote/app/src/main/java/tw/club7b/scoreremote/RecordingsActivity.java');
const link=read('../android-remote/app/src/main/java/tw/club7b/scoreremote/LocalLinkClient.java');

function memoryStorage(){
  const values=new Map();
  return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}

test('match archive cache only asks Firestore for matches ended since the newest cached one',()=>{
  const storage=memoryStorage(),now=Date.parse('2026-10-04T12:00:00Z');
  assert.equal(archiveCacheNeedsFullRefresh(readArchiveCache(storage,'RTYBSJ'),now),true);
  writeArchiveCache(storage,'RTYBSJ',{rows:[{matchId:'a',endedAt:'2026-10-03T10:00:00.000Z'},{matchId:'b',endedAt:'2026-10-03T12:00:00.000Z'}],fullAt:now});
  const cache=readArchiveCache(storage,'RTYBSJ');
  assert.equal(archiveCacheNeedsFullRefresh(cache,now+60_000),false);
  assert.equal(archiveCacheNeedsFullRefresh(cache,now+8*24*60*60*1000),true);
  assert.equal(archiveSyncCursor(cache.rows),'2026-10-03T12:00:00.000Z');
  const merged=mergeArchiveRows(cache.rows,[{matchId:'b',endedAt:'2026-10-03T12:00:00.000Z',scoreA:21},{matchId:'c',endedAt:'2026-10-04T01:00:00.000Z'}]);
  assert.deepEqual(merged.map(row=>row.matchId),['a','b','c']);
  assert.equal(merged[1].scoreA,21);
});

test('web app reads the archive incrementally instead of the whole collection on every connect',()=>{
  const loader=main.match(/async function loadMatchArchive\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(loader,/getDocs\(cursor\?query\(matchHistoryCollection\(\),where\('endedAt','>=',cursor\)\):matchHistoryCollection\(\)\)/);
  assert.match(loader,/writeArchiveCache\(localStorage,archiveRoomId/);
});

test('a press stamped with the previous match counts only when made well after the current official start',()=>{
  const currentMatch={matchId:'m2',active:true,winner:null,startedAt:'2026-10-04T07:16:55.000Z'};
  const started=Date.parse(currentMatch.startedAt);
  const press=(offset,extra={})=>({id:'x',action:'teamAPlus',matchId:'m1',clientCreatedAt:started+offset,...extra});
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(9_000),currentMatch}),true);
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(2_000),currentMatch}),false);
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(-20_000),currentMatch}),false);
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(9_000,{matchId:'m2'}),currentMatch}),false);
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(9_000,{action:'useShuttle'}),currentMatch}),false);
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(9_000),currentMatch:{...currentMatch,startedAt:''}}),false);
  assert.equal(isStaleMatchPressForCurrentMatch({command:press(9_000),currentMatch:{...currentMatch,winner:0}}),false);
});

test('queued remote presses arriving with the winning point do not start the next match',()=>{
  const guard=main.match(/function isResultScreenBurstPress\(command\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(guard,/Date\.now\(\)-resultShownAt<RESULT_NEXT_MATCH_GUARD_MS/);
  assert.match(guard,/pressedAt-remoteFinishPressAt<RESULT_NEXT_MATCH_GUARD_MS/);
  assert.match(main,/resultShownAt=Date\.now\(\);/);
  assert.match(main,/if\(state\.match\.winner!==null\)remoteFinishPressAt=timestampMillis\(command\.clientCreatedAt\)\|\|0;/);
});

test('room, live score and remote listeners re-attach after Firestore errors',()=>{
  assert.match(main,/function resilientSnapshot\(target,options,onNext,onError,isCurrent\)/);
  assert.match(main,/unsubscribe=resilientSnapshot\(roomRef,/);
  assert.match(main,/liveScoreUnsubscribe=resilientSnapshot\(liveScoreRef,/);
  assert.match(main,/remoteActionUnsubscribe=resilientSnapshot\(remoteScoreQuery,/);
  assert.match(main,/remoteControlUnsubscribe=resilientSnapshot\(remoteControlRef,/);
});

test('chat keeps one KV index per room and seeds it from the previous host once',()=>{
  assert.equal(chatIndexKey('RTYBSJ'),'index/RTYBSJ');
  const rows=sortedChatMessages([
    {id:'b',text:'later',senderId:'p',senderName:'P',createdAt:'2026-10-04T02:00:00Z'},
    {id:'a',text:'first',senderId:'p',senderName:'P',createdAt:'2026-10-04T01:00:00Z'},
    {id:'a',text:'dup',senderId:'p',senderName:'P',createdAt:'2026-10-04T01:00:00Z'},
    {id:'c',text:'',senderId:'p',senderName:'P',createdAt:'2026-10-04T03:00:00Z'}
  ]);
  assert.deepEqual(rows.map(row=>row.id),['a','b']);
  const getHandler=chat.match(/if\(request\.method==='GET'\)\{[\s\S]*?\n  \}/)?.[0]||'';
  assert.match(getHandler,/readRoomMessages\(chatStore,roomId\)/);
  assert.doesNotMatch(getHandler,/\.list\(/);
  assert.doesNotMatch(chat,/netlify\.app/);
  assert.doesNotMatch(media,/netlify\.app/);
});

test('push subscription refresh skips the KV write when nothing changed',()=>{
  const subscription={endpoint:'https://push.example/1',keys:{p256dh:'k',auth:'a'}};
  const existing={subscription,clientHash:'h',playerId:'p',playerName:'Yo',updatedAt:'2026-10-04T00:00:00Z'};
  const now=Date.parse('2026-10-04T08:00:00Z');
  assert.equal(isUnchangedRefresh(existing,{subscription,clientHash:'h',playerId:'p',playerName:'Yo'},now),true);
  assert.equal(isUnchangedRefresh(existing,{subscription,clientHash:'h',playerId:'p',playerName:'New'},now),false);
  assert.equal(isUnchangedRefresh(existing,{subscription,clientHash:'h',playerId:'p',playerName:'Yo',packingReminderEnabled:true},now),false);
  assert.equal(isUnchangedRefresh(existing,{subscription,clientHash:'h',playerId:'p',playerName:'Yo'},now+8*24*60*60*1000),false);
  assert.equal(isUnchangedRefresh(null,{subscription},now),false);
});

test('Android recordings screen loads only matches near its recordings',()=>{
  assert.match(recordings,/MatchHistoryRooms\.load\(BackgroundScoreController\.firestore\(this\), roomId, earliestStart\(roomId\) - HISTORY_MARGIN_MS\)/);
  assert.match(recordings,/ROOM_RELOAD_MS = 5 \* 60_000L/);
  assert.doesNotMatch(recordings,/age > 15_000L/);
});

test('Android local link backs off instead of rewriting offers every few seconds',()=>{
  assert.match(link,/RETRY_MAX_DELAY_MS = 5 \* 60_000L/);
  assert.match(link,/handler\.postDelayed\(restartTask, retryDelay\(\)\)/);
  assert.match(link,/if \(current\.state\(\) == DataChannel\.State\.OPEN\) failedAttempts = 0;/);
});
