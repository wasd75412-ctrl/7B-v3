import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('首頁房間代碼欄的深色底色能蓋過淺色表面規則，避免白底白字',()=>{
  assert.match(css,/#landing :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),select,textarea\)\{border-color:var\(--sport-line\);background:rgba\(1,17,30,\.76\);color:var\(--sport-ink\)/);
  assert.match(css,/#landing :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),select,textarea\)\{\s*border-color:rgba\(var\(--sport-tint-rgb\),\.20\);\s*background:linear-gradient/);
  assert.match(css,/#landing :is\(input,textarea\)::placeholder\{color:#a9bfd2\}/);
});
