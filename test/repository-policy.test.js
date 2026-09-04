import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const agents=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/project-policy.yml',import.meta.url),'utf8');

test('requires every completed branch to continue through production release',()=>{
  assert.match(agents,/本規則適用於目前所有分支及日後新增的每一個分支/);
  assert.match(agents,/不得在 commit、push、pull request 或 Deploy Preview 階段停下等待下一道指令/);
  assert.match(agents,/確認 Netlify 正式站已載入新版本與新雜湊資產/);
  assert.match(agents,/合併完成後必須刪除遠端功能分支/);
});

test('runs the shared policy workflow for every pushed branch and pull request',()=>{
  assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- ['"]\*\*['"]/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/run: npm test/);
  assert.match(workflow,/run: npm run build/);
});

test('keeps interface copy concise across current and future branches',()=>{
  assert.match(agents,/介面文字保持簡潔/);
  assert.match(agents,/不得自行新增教學式、重複式、宣傳式或長篇功能備註/);
  assert.match(agents,/危險操作確認及實際結果/);
  assert.match(agents,/新增功能應優先以清楚命名與版面呈現，不以額外備註補救/);
});
