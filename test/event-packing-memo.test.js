import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_PACKING_MEMO_ITEMS, eventPackingMemoProgress, normalizeEventPackingMemo } from '../src/event-packing-memo.js';

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
