import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EVENT_PACKING_MEMO_ITEMS, eventPackingMemoProgress, mergePackingMemos, normalizeEventPackingMemo, normalizePackingItems } from '../src/event-packing-memo.js';

const styles=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('開團備忘錄包含指定的攜帶物品', () => {
  assert.deepEqual(EVENT_PACKING_MEMO_ITEMS, [
    '球拍', '毛巾', '襪子', '球鞋', 'i7', '三星手機', 'iPad', '藍芽遙控器',
    '隨身充電器', '磁吸充電座', '磁吸底盤', '球桶', '水壺'
  ]);
});

test('備忘錄只保留清單內的唯一勾選項目', () => {
  assert.deepEqual(normalizeEventPackingMemo({ checked: ['球拍', '球拍', '不明物品'] }), { items:EVENT_PACKING_MEMO_ITEMS,checked: ['球拍'],updatedAt:0 });
  assert.deepEqual(eventPackingMemoProgress({ checked: ['球拍', '水壺'] }), { checked: 2, total: 13, remaining: 11 });
});

test('備忘錄可新增與編輯本機物品並排除重複',()=>{
  assert.deepEqual(normalizePackingItems([' 球拍 ','球拍','毛巾','']),['球拍','毛巾']);
  assert.deepEqual(normalizeEventPackingMemo({items:['雨傘','水壺'],checked:['雨傘','球拍']}),{items:['雨傘','水壺'],checked:['雨傘'],updatedAt:0});
});

test('裝置同步採用最後編輯的備忘錄',()=>{
  const older={items:['球拍'],checked:[],updatedAt:10},newer={items:['球拍','水壺'],checked:['水壺'],updatedAt:20};
  assert.deepEqual(mergePackingMemos(older,newer),normalizeEventPackingMemo(newer));
  assert.deepEqual(mergePackingMemos(newer,older),normalizeEventPackingMemo(newer));
  assert.match(main,/packingMemo:mergedPacking/);
  assert.match(main,/applyCloudPackingMemo\(profile\.packingMemo\)/);
});

test('開團備忘錄與提醒 Bar 永遠使用明確的高對比底色與文字色',()=>{
  assert.match(styles,/body>\.modal \.packing-reminder-controls,[\s\S]*?body>\.modal \.event-packing-memo-item\{[\s\S]*?background:#0b2b43!important;[\s\S]*?color:#eefaff!important/);
  assert.match(styles,/body>\.modal \.event-packing-memo-item:has\(input:checked\)\{[\s\S]*?background:#dff7eb!important;[\s\S]*?color:#0d5437!important/);
  assert.match(styles,/body>\.modal \.event-packing-item-actions \.danger-outline\{[^}]*background:#7b2634!important;[^}]*color:#fff!important/);
});
