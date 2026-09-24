import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDuration, formatTimelineOffset, groupMatchHistoryByDate, matchDayTimeline, youtubeTimelineText } from '../src/match-history.js';

test('groups match history by date newest first and preserves original indexes',()=>{
  const history=[
    {dateKey:'2026-09-24',startedAt:'2026-09-24T11:00:00.000Z'},
    {dateKey:'2026-09-25',startedAt:'2026-09-25T10:10:00.000Z'},
    {dateKey:'2026-09-25',startedAt:'2026-09-25T10:00:00.000Z'}
  ];
  const groups=groupMatchHistoryByDate(history,match=>match.dateKey);
  assert.deepEqual(groups.map(group=>group.dateKey),['2026-09-25','2026-09-24']);
  assert.deepEqual(groups[0].matches.map(entry=>entry.index),[2,1]);
});

test('builds YouTube offsets and full session duration from recorded timestamps',()=>{
  const timeline=matchDayTimeline([
    {match:{startedAt:'2026-09-25T10:00:00.000Z',endedAt:'2026-09-25T10:12:00.000Z'}},
    {match:{startedAt:'2026-09-25T10:18:30.000Z',endedAt:'2026-09-25T10:31:00.000Z'}}
  ]);
  assert.deepEqual(timeline.rows.map(row=>row.offsetSeconds),[0,1110]);
  assert.equal(timeline.durationSeconds,1860);
  assert.equal(formatTimelineOffset(1110),'00:18:30');
  assert.equal(formatDuration(1860),'31 分鐘');
});

test('creates a copyable YouTube chapter list from the recording start',()=>{
  const matches=[{match:{startedAt:'2026-09-25T01:22:34.000Z',teams:[['yoyo','jie'],['yu','xuan']],scores:[11,9]}}];
  assert.equal(youtubeTimelineText(matches,'2026-09-25T01:00:00.000Z',id=>({yoyo:'Yoyo',jie:'澐緁',yu:'建昱',xuan:'于萱'})[id]),'00:00:00 準備與熱身\n00:22:34 Game1 Yoyo／澐緁 11：9 建昱／于萱');
});

test('keeps legacy matches without start timestamps usable',()=>{
  const timeline=matchDayTimeline([{match:{endedAt:'2026-09-25T10:31:00.000Z'}}]);
  assert.equal(timeline.firstStart,null);
  assert.equal(timeline.durationSeconds,null);
  assert.equal(formatTimelineOffset(timeline.rows[0].offsetSeconds),'—');
});

test('uses the existing theme colors for the admin timeline',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.youtube-timeline\{[^}]*background:var\(--card\);color:var\(--ink\);border:1px solid var\(--line\)/);
  assert.match(css,/\.youtube-timeline-text\{[^}]*border:1px solid var\(--line\);[^}]*background:var\(--card\);color:var\(--ink\)/);
});
