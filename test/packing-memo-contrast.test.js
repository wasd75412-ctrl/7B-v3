import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('開團備忘錄在深淺主題都使用成對的背景與文字色',()=>{
  assert.match(css,/\.packing-reminder-controls\{[^}]*background:var\(--card\);color:var\(--ink\)/);
  assert.match(css,/\.event-packing-memo-item\{[^}]*background:var\(--card\);color:var\(--ink\)/);
});
