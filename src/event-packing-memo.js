export const EVENT_PACKING_MEMO_ITEMS = [
  '球拍', '毛巾', '襪子', '球鞋', 'i7', '三星手機', 'iPad', '藍芽遙控器',
  '隨身充電器', '磁吸充電座', '磁吸底盤', '球桶', '水壺'
];

export function normalizeEventPackingMemo(value, items = EVENT_PACKING_MEMO_ITEMS) {
  const checked = value && typeof value === 'object' && !Array.isArray(value)
    ? value.checked
    : [];
  const allowed = new Set(items);
  return {
    checked: [...new Set(Array.isArray(checked) ? checked : [])]
      .filter(item => allowed.has(item))
  };
}

export function eventPackingMemoProgress(value, items = EVENT_PACKING_MEMO_ITEMS) {
  const memo = normalizeEventPackingMemo(value, items);
  return { checked: memo.checked.length, total: items.length, remaining: items.length - memo.checked.length };
}
