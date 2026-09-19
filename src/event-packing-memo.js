export const EVENT_PACKING_MEMO_ITEMS = [
  '球拍', '毛巾', '襪子', '球鞋', 'i7', '三星手機', 'iPad', '藍芽遙控器',
  '隨身充電器', '磁吸充電座', '磁吸底盤', '球桶', '水壺'
];

export function normalizePackingItems(value) {
  const source=Array.isArray(value)?value:EVENT_PACKING_MEMO_ITEMS;
  const seen=new Set();
  return source.map(item=>String(item||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,30)).filter(item=>{
    const key=item.toLocaleLowerCase('zh-Hant');
    if(!item||seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,30);
}

export function normalizeEventPackingMemo(value) {
  const items=normalizePackingItems(value?.items);
  const checked = value && typeof value === 'object' && !Array.isArray(value)
    ? value.checked
    : [];
  const allowed = new Set(items);
  return {
    items,
    checked: [...new Set(Array.isArray(checked) ? checked : [])]
      .filter(item => allowed.has(item))
  };
}

export function eventPackingMemoProgress(value) {
  const memo = normalizeEventPackingMemo(value);
  return { checked: memo.checked.length, total: memo.items.length, remaining: memo.items.length - memo.checked.length };
}
