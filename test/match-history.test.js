import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRecordingStartLocalValue, formatDuration, formatTimelineOffset, groupHistoryDatesByMonth, groupMatchHistoryByDate, matchDayTimeline, youtubeTimelineText } from '../src/match-history.js';

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

test('groups date sections into newest month with date and match totals',()=>{
  const dates=[
    {dateKey:'2026-08-26',matches:[{},{}]},
    {dateKey:'2026-08-24',matches:[{}]},
    {dateKey:'2026-07-31',matches:[{},{},{}]}
  ];
  assert.deepEqual(groupHistoryDatesByMonth(dates),[
    {monthKey:'2026-08',dates:dates.slice(0,2),matchCount:3},
    {monthKey:'2026-07',dates:dates.slice(2),matchCount:3}
  ]);
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

test('defaults overnight recordings to 01:00 and daytime recordings to 11:00',()=>{
  assert.equal(defaultRecordingStartLocalValue([{match:{startedAt:'2026-09-25T17:20:00.000Z'}}],'2026-09-26'),'2026-09-26T01:00:00');
  assert.equal(defaultRecordingStartLocalValue([{match:{startedAt:'2026-09-26T04:20:00.000Z'}}],'2026-09-26'),'2026-09-26T11:00:00');
});

test('saves a complete recording date and time only after explicit confirmation',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/data-save-timeline=/);
  assert.match(source,/儲存時間/);
  assert.doesNotMatch(source,/\[data-timeline-start\][^\n]*\.onchange=/);
});

test('uses the existing theme colors for the admin timeline',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.youtube-timeline\{[^}]*background:var\(--card\);color:var\(--ink\);border:1px solid var\(--line\)/);
  assert.match(css,/\.youtube-timeline-text\{[^}]*border:1px solid var\(--line\);[^}]*background:var\(--card\);color:var\(--ink\)/);
});

test('keeps match record dates readable on themed cards',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.history-date-group\{[^}]*background:var\(--card\)/);
  assert.doesNotMatch(css,/\.history-date-group\{[^}]*background:rgba\(255,255,255,\.42\)/);
  assert.match(css,/#app \.history-item \.history-main>\.sub\{color:var\(--sport-ink\)!important;opacity:\.82\}/);
  assert.match(css,/#app \.history-date-group>summary span:last-of-type,#app \.history-date-group>summary:after\{color:var\(--sport-ink\)!important;opacity:\.9\}/);
  assert.match(css,/#app \.history-month-group>summary span:last-of-type,#app \.history-month-group>summary:after\{color:var\(--sport-ink\)!important;opacity:\.9\}/);
});
