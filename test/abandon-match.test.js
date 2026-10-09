import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const abandon=main.match(/function abandonMatch\(\)\{[\s\S]*?\n\}/)?.[0]||'';

test('score screen offers a host-only abandon button next to exit',()=>{
  assert.match(index,/<button id="abandonMatch" class="btn host-only"[^>]*>放棄<\/button>\s*<button id="exitScore"/);
  assert.match(main,/\$\('abandonMatch'\)\.onclick=abandonMatch/);
  assert.match(main,/\$\('abandonMatch'\)\?\.classList\.toggle\('hidden',!\(m\.active&&m\.winner===null&&isHost&&!requestedAndroidRemote\)\)/);
});

test('abandoning clears only the open match and syncs it as a new epoch',()=>{
  assert.match(abandon,/!m\.active\|\|m\.winner!==null\)return/);
  assert.match(abandon,/confirm\('確定放棄本場？目前比分不會記錄。'\)/);
  assert.match(abandon,/state\.match=\{\.\.\.initialState\(\)\.match,format:normalizeMatchFormat\(m\.format\),syncEpoch:nextMatchEpoch\(m\)\}/);
  assert.match(abandon,/checkpointNewMatch\(\)/);
  assert.doesNotMatch(abandon,/state\.history/);
  for(const key of['attendance','court','waitingQueue','nextCall'])assert.doesNotMatch(abandon,new RegExp(`state\\.${key}=`));
});
