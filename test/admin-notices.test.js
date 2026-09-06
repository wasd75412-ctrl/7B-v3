import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureShuttleCostNotice,moveAdminNotice,normalizeAdminNotices} from '../src/admin-notices.js';

test('preserves the saved announcement order',()=>{
  const rows=[
    {id:'older',title:'置頂',body:'第一則',publishedAt:'2026-01-01T00:00:00Z'},
    {id:'newer',title:'第二',body:'第二則',publishedAt:'2026-02-01T00:00:00Z'}
  ];
  assert.deepEqual(normalizeAdminNotices({adminNotices:rows}).map(row=>row.id),['older','newer']);
  assert.deepEqual(moveAdminNotice(rows,'newer',-1).map(row=>row.id),['newer','older']);
});

test('publishes only the fixed shuttle fee formula',()=>{
  const notice=ensureShuttleCostNotice([],'2026-09-06T00:00:00Z')[0];
  assert.equal(notice.title,'球費計算方式');
  assert.equal(notice.body,'球費＝本場使用顆數 ×（球桶價格 ÷ 12）÷ 本場參與人數，購球者有參與也計入人數。');
  assert.doesNotMatch(notice.body,/剩餘|每顆 \d|本場 \d/);
});

test('does not change the formula announcement again after a manual edit',()=>{
  const automatic=ensureShuttleCostNotice([],'2026-09-06T00:00:00Z')[0];
  const edited={...automatic,title:'球費說明',body:'自訂說明'};
  assert.deepEqual(ensureShuttleCostNotice([edited],'2026-09-07T00:00:00Z')[0],edited);
});

test('migrates the old linked shuttle announcement to the fixed formula once',()=>{
  const old={id:'shuttle-cost',title:'球費與球桶',body:'球費＝本場用球顆數 × 每顆 60 元。本場 1 顆。',publishedAt:'2026-09-06T00:00:00Z'};
  const migrated=ensureShuttleCostNotice([old],'2026-09-07T00:00:00Z')[0];
  assert.equal(migrated.title,'球費計算方式');
  assert.equal(migrated.systemVersion,1);
  assert.equal(migrated.publishedAt,old.publishedAt);
});
