import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('force-hides direct-win controls outside an active host test match',()=>{
  assert.match(mainSource,/showQuickWin=currentMatchIsTest&&isHost/);
  assert.match(mainSource,/quickWin\.hidden=!showQuickWin/);
  assert.match(mainSource,/quickWin\.setAttribute\('aria-hidden',showQuickWin\?'false':'true'\)/);
  assert.match(mainSource,/quickWin\.style\.setProperty\('display',showQuickWin\?'flex':'none','important'\)/);
});
