const clean=(value,max)=>String(value||'').trim().slice(0,max);

export function normalizeAdminNotices(source){
  const rows=Array.isArray(source?.adminNotices)?source.adminNotices:(source?.adminNotice?.body?[source.adminNotice]:[]);
  const seen=new Set();
  return rows.filter(notice=>notice&&clean(notice.body,500)).map((notice,index)=>{
    const publishedAt=notice.publishedAt||'',fallbackId=`notice_${String(publishedAt||index).replace(/[^a-zA-Z0-9]/g,'').slice(-28)||index}`;
    return{
      id:String(notice.id||fallbackId),
      title:clean(notice.title||'事務通知',40)||'事務通知',
      body:clean(notice.body,500),
      publishedAt,
      ...(notice.autoTitle?{autoTitle:clean(notice.autoTitle,40)}:{}),
      ...(notice.autoBody?{autoBody:clean(notice.autoBody,500)}:{})
    };
  }).filter(notice=>{if(seen.has(notice.id))return false;seen.add(notice.id);return true}).slice(0,20);
}

export function syncManagedAdminNotice(source,generated){
  const notices=normalizeAdminNotices({adminNotices:source}),record={...generated,autoTitle:generated.title,autoBody:generated.body};
  const index=notices.findIndex(notice=>notice.id===generated.id);
  if(index<0)return normalizeAdminNotices({adminNotices:[record,...notices]});
  const old=notices[index],stillAutomatic=old.autoBody
    ?old.title===old.autoTitle&&old.body===old.autoBody
    :old.id==='shuttle-cost'&&old.title==='球費與球桶'&&old.body.startsWith('球費＝本場用球顆數');
  notices[index]=stillAutomatic?{...old,...record,publishedAt:old.publishedAt||generated.publishedAt}:{...old,autoTitle:record.autoTitle,autoBody:record.autoBody};
  return normalizeAdminNotices({adminNotices:notices});
}

export function moveAdminNotice(source,id,direction){
  const notices=normalizeAdminNotices({adminNotices:source}),from=notices.findIndex(notice=>notice.id===id),to=from+Math.sign(Number(direction)||0);
  if(from<0||to<0||to>=notices.length)return notices;
  [notices[from],notices[to]]=[notices[to],notices[from]];
  return notices;
}
