import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EVENT_PACKING_MEMO_ITEMS, eventPackingMemoProgress, normalizeEventPackingMemo } from '../src/event-packing-memo.js';

const styles=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('開團備忘錄包含指定的攜帶物品', () => {
  assert.deepEqual(EVENT_PACKING_MEMO_ITEMS, [
    '球拍', '毛巾', '襪子', '球鞋', 'i7', '三星手機', 'iPad', '藍芽遙控器',
    '隨身充電器', '磁吸充電座', '磁吸底盤', '球桶', '水壺'
  ]);
});

test('備忘錄只保留清單內的唯一勾選項目', () => {
  assert.deepEqual(normalizeEventPackingMemo({ checked: ['球拍', '球拍', '不明物品'] }), { checked: ['球拍'] });
  assert.deepEqual(eventPackingMemoProgress({ checked: ['球拍', '水壺'] }), { checked: 2, total: 13, remaining: 11 });
});

test('開團備忘錄與提醒 Bar 永遠使用明確的高對比底色與文字色',()=>{
  assert.match(styles,/body>\.modal \.packing-reminder-controls,[\s\S]*?body>\.modal \.event-packing-memo-item\{[\s\S]*?background:#0b2b43!important;[\s\S]*?color:#eefaff!important/);
  assert.match(styles,/body>\.modal \.event-packing-memo-item:has\(input:checked\)\{[\s\S]*?background:#dff7eb!important;[\s\S]*?color:#0d5437!important/);
});
