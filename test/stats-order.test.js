import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('shows career, today and month records in the requested order',()=>{
  const tableHeader=html.match(/<table class="stats-table">[\s\S]*?<thead><tr>([\s\S]*?)<\/tr>/)?.[1]||'';
  assert.ok(tableHeader.indexOf('<th>生涯</th>')<tableHeader.indexOf('<th>今日</th>'));
  assert.ok(tableHeader.indexOf('<th>今日</th>')<tableHeader.indexOf('<th>本月</th>'));
  assert.match(html,/生涯／今日／本月戰績/);
});

test('offers career, today and month sorting in the same order',()=>{
  const select=html.match(/<select id="statsSort"[\s\S]*?<\/select>/)?.[0]||'';
  assert.ok(select.indexOf('career-record')<select.indexOf('today-record'));
  assert.ok(select.indexOf('today-record')<select.indexOf('month-record'));
  assert.match(source,/sortKey=.*\|\|'career-record'/);
  assert.match(source,/sortKey\.startsWith\('today'\)\?'t':'mo'/);
});

test('shows the hot-streak bar only for an active winning streak',()=>{
  assert.match(html,/id="hotColdStats" class="leader-grid hidden"/);
  assert.match(html,/<th>目前連勝<\/th>/);
  assert.match(source,/kind==='W'&&x\.s\.streak>=2/);
  assert.match(source,/classList\.toggle\('hidden',!hot\)/);
  assert.doesNotMatch(source,/手感冰冷|調整中|連敗/);
});
