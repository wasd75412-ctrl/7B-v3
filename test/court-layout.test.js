import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('keeps the match settings in dedicated responsive rounded cards',()=>{
  assert.match(html,/class="rules court-rules"/);
  assert.match(css,/#app #page3 \.court-rules\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/#app #page3 \.court-rules \.field\{[\s\S]*border-radius:16px/);
  assert.match(css,/@media\(max-width:620px\)\{[\s\S]*#app #page3 \.court-rules/);
});
