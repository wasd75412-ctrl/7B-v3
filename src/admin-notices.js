const clean=(value,max)=>String(value||'').trim().slice(0,max);
const SHUTTLE_NOTICE={id:'shuttle-cost',title:'球費計算方式',body:'球費＝本場使用顆數 ×（球桶價格 ÷ 12）÷ 本場參與人數，購球者有參與也計入人數。',systemVersion:1};

export function normalizeAdminNotices(source){
  const rows=Array.isArray(source?.adminNotices)?source.adminNotices:(source?.adminNotice?.body?[source.adminNotice]:[]);
  const seen=new Set();
  return rows.filter(notice=>notice&&clean(notice.body,500)).map((notice,index)=>{
    const publishedAt=notice.publishedAt||'',fallbackId=`notice_${String(publishedAt||index).replace(/[^a-zA-Z0-9]/g,'').slice(-28)||index}`;
    const record={
      id:String(notice.id||fallbackId),
      title:clean(notice.title||'事務通知',40)||'事務通知',
      body:clean(notice.body,500),
      publishedAt,
      ...(Number(notice.systemVersion)>0?{systemVersion:Number(notice.systemVersion)}:{})
    };
    return record.id===SHUTTLE_NOTICE.id&&!record.systemVersion?{...record,...SHUTTLE_NOTICE,publishedAt:record.publishedAt}:record;
  }).filter(notice=>{if(seen.has(notice.id))return false;seen.add(notice.id);return true}).slice(0,20);
}

export function ensureShuttleCostNotice(source,publishedAt=''){
  const notices=normalizeAdminNotices({adminNotices:source}),index=notices.findIndex(notice=>notice.id==='shuttle-cost');
  const record={...SHUTTLE_NOTICE,publishedAt};
  if(index<0)return normalizeAdminNotices({adminNotices:[record,...notices]});
  if(Number(notices[index].systemVersion)>=1)return notices;
  notices[index]={...record,publishedAt:notices[index].publishedAt||publishedAt};
  return normalizeAdminNotices({adminNotices:notices});
}

export function moveAdminNotice(source,id,direction){
  const notices=normalizeAdminNotices({adminNotices:source}),from=notices.findIndex(notice=>notice.id===id),to=from+Math.sign(Number(direction)||0);
  if(from<0||to<0||to>=notices.length)return notices;
  [notices[from],notices[to]]=[notices[to],notices[from]];
  return notices;
}
