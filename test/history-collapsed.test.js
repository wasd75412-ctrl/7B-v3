import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderHistory=main.match(/function renderHistory\(\)\{[\s\S]*?\n\}/)?.[0]||'';

test('history month and date groups start collapsed and keep user-opened groups',()=>{
  assert.match(renderHistory,/const open=openDates\.has\(group\.dateKey\);/);
  assert.match(renderHistory,/const open=openMonths\.has\(month\.monthKey\),/);
  assert.doesNotMatch(renderHistory,/monthIndex===0|dateIndex===0/);
});
