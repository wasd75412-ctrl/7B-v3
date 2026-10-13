import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeArchivedMatch, encodeArchivedMatch, mergeMatchHistory } from '../src/match-archive.js';
import { decodeLiveMatch, encodeLiveMatch } from '../src/live-score.js';
import { playedParticipantIds } from '../src/session-participants.js';
import { emptyStatsLedger, ledgerHasPlayer, ledgerTotalGames, settleMatches } from '../src/stats-ledger.js';

const timeline=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RecordingTimeline.java',import.meta.url),'utf8');
const practiceRow={matchId:'p1',dateKey:'2026-10-13',startedAt:'2026-10-13T03:00:00.000Z',endedAt:'2026-10-13T03:15:00.000Z',format:'doubles',teams:[['a','b'],['c','d']],scores:[11,7],winner:0,practice:true};

test('practice matches stay in the archived history the recording timeline reads',()=>{
  const archived=encodeArchivedMatch(practiceRow);
  assert.equal(archived.practice,true);
  assert.equal('testMode' in archived,false);
  assert.equal(decodeArchivedMatch(archived).practice,true);
  assert.deepEqual(mergeMatchHistory([practiceRow],[],new Set()).map(row=>row.matchId),['p1']);
  assert.doesNotMatch(timeline,/practice/);
});

test('practice matches never reach the stats ledger',()=>{
  const ledger=settleMatches(emptyStatsLedger(),[practiceRow],'2026-11',row=>row.dateKey.slice(0,7));
  assert.equal(ledgerTotalGames(ledger),0);
  assert.equal(ledgerHasPlayer(ledger,'a'),false);
});

test('practice players still count as having played that session',()=>{
  assert.deepEqual(playedParticipantIds([practiceRow]),['a','b','c','d']);
});

test('live score keeps the practice flag and turns a leftover test match into practice',()=>{
  assert.equal(decodeLiveMatch({match:encodeLiveMatch({...practiceRow,active:true})}).practice,true);
  assert.equal(decodeLiveMatch({match:{active:true,testMode:true}}).practice,true);
  assert.equal(decodeLiveMatch({match:{active:true}}).practice,false);
});
