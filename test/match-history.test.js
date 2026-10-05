import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRecordingStartLocalValue, formatDuration, formatTimelineOffset, groupHistoryDatesByMonth, groupMatchHistoryByDate, matchDayTimeline, withLiveTimelineDate, withLiveTimelineMatch, youtubeTimelineText } from '../src/match-history.js';

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
  assert.equal(youtubeTimelineText(matches,'2026-09-25T01:00:00.000Z',id=>({yoyo:'Yoyo',jie:'澐緁',yu:'建昱',xuan:'于萱'})[id]),'00:00:00  準備與熱身\n00:22:34  Game1 Yoyo／澐緁 11：9 建昱／于萱');
});

test('includes an official start in the timeline before that match ends',()=>{
  const finished=[{match:{matchId:'done',startedAt:'2026-09-25T01:10:00.000Z',teams:[['yoyo','jie'],['yu','xuan']],scores:[11,8]}}];
  const live={matchId:'live',startedAt:'2026-09-25T01:40:00.000Z',teams:[['yu','xuan'],['yoyo']],scores:[3,2]};
  const rows=withLiveTimelineMatch(finished,live);
  assert.equal(rows.length,2);
  assert.equal(youtubeTimelineText(rows,'2026-09-25T01:00:00.000Z',id=>({yoyo:'Yoyo',jie:'澐緁',yu:'建昱',xuan:'于萱'})[id]),'00:00:00  準備與熱身\n00:10:00  Game1 Yoyo／澐緁 11：8 建昱／于萱\n00:40:00  Game2 建昱／于萱 3：2 Yoyo');
  assert.equal(withLiveTimelineMatch(rows,live).length,2);
  assert.deepEqual(withLiveTimelineMatch([],{startedAt:'2026-09-25T01:40:00.000Z',testMode:true}),[]);
  assert.deepEqual(withLiveTimelineDate([{dateKey:'2026-09-24',matches:[]}],{...live,dateKey:'2026-09-25'}).map(group=>group.dateKey),['2026-09-25','2026-09-24']);
});

test('lists one chapter when the same official start is loaded twice',()=>{
  const start='2026-09-30T11:10:05.000Z';
  const twice=[
    {match:{matchId:'room',startedAt:start,teams:[['yoyo','jie'],['yu','xuan']],scores:[11,7]}},
    {match:{matchId:'archive',startedAt:start,teams:[['yoyo','jie'],['yu','xuan']],scores:[11,7]}}
  ];
  const text=youtubeTimelineText(twice,'2026-09-30T11:00:00.000Z',id=>({yoyo:'Yoyo',jie:'澐緁',yu:'建昱',xuan:'于萱'})[id]);
  assert.equal(text,'00:00:00  準備與熱身\n00:10:05  Game1 Yoyo／澐緁 11：7 建昱／于萱');
  assert.equal(text.split('Game').length-1,1);
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

test('match records no longer carry the YouTube timeline panel',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.doesNotMatch(source,/timelinePanel|data-save-timeline|data-copy-timeline|data-delete-timeline|YouTube 比賽時間軸/);
  assert.doesNotMatch(css,/\.youtube-timeline/);
});

test('each record date can delete all of its matches after confirmation',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/group\.matches\.length\?`<div class="history-date-actions host-only"><button class="btn danger-outline" type="button" data-delete-history-date="\$\{esc\(group\.dateKey\)\}">全部刪除<\/button><\/div>`:''/);
  assert.match(source,/all\('\[data-delete-history-date\]'\)\.forEach\(btn=>btn\.onclick=\(\)=>deleteHistoryDate\(btn\.dataset\.deleteHistoryDate\)\)/);
  const remove=source.match(/function deleteHistoryDate\(dateKey\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(remove,/if\(!isHost\)return;/);
  assert.match(remove,/if\(!confirm\(`確定刪除 \$\{historyDateLabel\(dateKey\)\} 全部 \$\{rows\.length\} 筆戰績？`\)\)return;/);
  assert.match(remove,/forgetArchivedMatches\(ids\)/);
  assert.match(remove,/state\.history=state\.history\.filter\(h=>!rows\.includes\(h\)\);renderAll\(\);saveHistoryDeletion\(\)/);
  assert.match(remove,/deleteArchivedMatches\(ids\)/);
});

test('match record deletions write the room immediately even in lite sync during a match',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(source,/function saveHistoryDeletion\(\)\{if\(isHost&&roomRef\)void saveNow\(\)\.catch\(\(\)=>saveSoon\(\)\)\}/);
  for(const name of ['deleteHistoryRecord','deleteHistoryDate','clearAllHistory']){
    const body=source.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n(?=function )`))?.[0]||'';
    assert.match(body,/saveHistoryDeletion\(\)/,name);
    assert.doesNotMatch(body,/\bsaveSoon\(\)/,name);
  }
});

test('keeps match record dates readable on themed cards',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.history-date-group\{[^}]*background:var\(--card\)/);
  assert.doesNotMatch(css,/\.history-date-group\{[^}]*background:rgba\(255,255,255,\.42\)/);
  assert.match(css,/#app \.history-item \.history-main>\.sub\{color:var\(--sport-ink\)!important;opacity:\.82\}/);
  assert.match(css,/#app \.history-date-group>summary span:last-of-type,#app \.history-date-group>summary:after\{color:var\(--sport-ink\)!important;opacity:\.9\}/);
  assert.match(css,/#app \.history-month-group>summary span:last-of-type,#app \.history-month-group>summary:after\{color:var\(--sport-ink\)!important;opacity:\.9\}/);
});
