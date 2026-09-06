import test from 'node:test';
import assert from 'node:assert/strict';
import {moveAdminNotice,normalizeAdminNotices,syncManagedAdminNotice} from '../src/admin-notices.js';

test('preserves the saved announcement order',()=>{
  const rows=[
    {id:'older',title:'置頂',body:'第一則',publishedAt:'2026-01-01T00:00:00Z'},
    {id:'newer',title:'第二',body:'第二則',publishedAt:'2026-02-01T00:00:00Z'}
  ];
  assert.deepEqual(normalizeAdminNotices({adminNotices:rows}).map(row=>row.id),['older','newer']);
  assert.deepEqual(moveAdminNotice(rows,'newer',-1).map(row=>row.id),['newer','older']);
});

test('keeps manual shuttle announcement edits during automatic usage sync',()=>{
  const generated={id:'shuttle-cost',title:'球費與球桶',body:'球費＝本場用球顆數 × 每顆 60 元。',publishedAt:'2026-09-06T00:00:00Z'};
  const automatic=syncManagedAdminNotice([],generated)[0];
  const edited={...automatic,title:'我的球費公告',body:'請依總覽金額付款。'};
  const synced=syncManagedAdminNotice([edited],{...generated,body:'球費＝本場用球顆數 × 每顆 60 元。本場 2 顆。'});
  assert.equal(synced[0].title,'我的球費公告');
  assert.equal(synced[0].body,'請依總覽金額付款。');
  assert.match(synced[0].autoBody,/本場 2 顆/);
});

test('continues refreshing an unedited automatic shuttle announcement',()=>{
  const old={id:'shuttle-cost',title:'球費與球桶',body:'球費＝本場用球顆數 × 每顆 60 元。',publishedAt:'2026-09-06T00:00:00Z'};
  const synced=syncManagedAdminNotice([old],{...old,body:'球費＝本場用球顆數 × 每顆 60 元。本場 1 顆。'});
  assert.match(synced[0].body,/本場 1 顆/);
});
