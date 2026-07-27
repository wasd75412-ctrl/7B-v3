const cleanText=(value,maxLength)=>String(value||'').trim().slice(0,maxLength);
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Math.round(Number(value)||0)));
const validStatus=value=>['pending','active','finished','deleted'].includes(value)?value:'';

export function normalizeShuttleTubes(value,maxCount=20){
  const rows=Array.isArray(value)?value:[];
  const normalized=rows.map((tube,index)=>{
    const paidSource=tube?.paid&&typeof tube.paid==='object'?tube.paid:{};
    const paid={};
    for(const [playerId,payment] of Object.entries(paidSource)){
      if(!playerId)continue;
      paid[playerId]={
        paidAt:cleanText(payment?.paidAt,40),
        historyCount:Math.max(0,Number(payment?.historyCount)||0),
        ...(typeof payment?.playedOverride==='boolean'?{playedOverride:payment.playedOverride}:{})
      };
    }
    const totalShuttles=clamp(tube?.totalShuttles||12,1,100);
    return{
      id:cleanText(tube?.id,128)||`tube-${index}`,
      name:cleanText(tube?.name,60)||'未命名用球',
      price:Math.max(0,Math.round(Number(tube?.price)||0)),
      createdAt:cleanText(tube?.createdAt,40),
      status:validStatus(tube?.status),
      totalShuttles,
      remainingShuttles:clamp(tube?.remainingShuttles??totalShuttles,0,totalShuttles),
      activatedAt:cleanText(tube?.activatedAt,40),
      activationHistoryCount:Math.max(0,Number(tube?.activationHistoryCount)||0),
      finishedAt:cleanText(tube?.finishedAt,40),
      deletedAt:cleanText(tube?.deletedAt,40),
      previousStatus:validStatus(tube?.previousStatus),
      paid
    };
  }).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)).slice(0,maxCount);
  const hasExplicitActive=normalized.some(tube=>tube.status==='active');
  let activeClaimed=false;
  return normalized.map(tube=>{
    let status=tube.status;
    if(!status)status=!hasExplicitActive&&!activeClaimed?'active':'finished';
    if(status==='active'){
      if(activeClaimed)status='finished';
      else activeClaimed=true;
    }
    const remainingShuttles=!tube.status&&status==='finished'?0:tube.remainingShuttles;
    return{...tube,status,remainingShuttles};
  });
}

export function createShuttleTube({id='',name='',price=0,createdAt='',totalShuttles=12,status='pending'}={}){
  return normalizeShuttleTubes([{id,name,price,createdAt,totalShuttles,remainingShuttles:totalShuttles,status}])[0];
}

export function setShuttlePayment(tube,playerId,paid,{paidAt='',historyCount=0}={}){
  const normalized=normalizeShuttleTubes([tube])[0],id=String(playerId||'');
  if(!normalized||!id)return normalized;
  const payments={...normalized.paid};
  if(paid)payments[id]={paidAt:String(paidAt||''),historyCount:Math.max(0,Number(historyCount)||0)};
  else delete payments[id];
  return{...normalized,paid:payments};
}

export function setShuttlePaymentStatus(tube,playerId,status,{paidAt='',historyCount=0}={}){
  const normalized=normalizeShuttleTubes([tube])[0],id=String(playerId||'');
  if(!normalized||!id||!['unpaid','paid-waiting','paid-played'].includes(status))return normalized;
  const payments={...normalized.paid};
  if(status==='unpaid')delete payments[id];
  else{
    const existing=payments[id]||{};
    payments[id]={
      paidAt:existing.paidAt||String(paidAt||''),
      historyCount:Math.max(0,Number(existing.historyCount??historyCount)||0),
      playedOverride:status==='paid-played'
    };
  }
  return{...normalized,paid:payments};
}

export function setShuttleRemaining(tube,remainingShuttles=0){
  const normalized=normalizeShuttleTubes([tube])[0];
  if(!normalized)return normalized;
  return{...normalized,remainingShuttles:clamp(remainingShuttles,0,normalized.totalShuttles)};
}

export function updateShuttleTube(tube,changes={}){
  const normalized=normalizeShuttleTubes([tube])[0];
  if(!normalized)return normalized;
  const totalShuttles=changes.totalShuttles===undefined?normalized.totalShuttles:clamp(changes.totalShuttles,1,100);
  const remainingSource=changes.remainingShuttles===undefined?normalized.remainingShuttles:changes.remainingShuttles;
  return normalizeShuttleTubes([{
    ...normalized,
    ...changes,
    totalShuttles,
    remainingShuttles:clamp(remainingSource,0,totalShuttles)
  }])[0];
}

export function softDeleteShuttleTube(tubes=[],tubeId='',deletedAt=''){
  const id=String(tubeId||'');
  return normalizeShuttleTubes(tubes).map(tube=>tube.id===id?{
    ...tube,
    previousStatus:tube.status,
    status:'deleted',
    deletedAt:String(deletedAt||'')
  }:tube);
}

export function restoreShuttleTube(tubes=[],tubeId=''){
  const normalized=normalizeShuttleTubes(tubes),id=String(tubeId||'');
  const activeExists=normalized.some(tube=>tube.status==='active');
  const pendingExists=normalized.some(tube=>tube.status==='pending');
  return normalizeShuttleTubes(normalized.map(tube=>{
    if(tube.id!==id||tube.status!=='deleted')return tube;
    let status=tube.previousStatus||'finished';
    if(status==='active'&&activeExists)status='finished';
    if(status==='pending'&&pendingExists)status='finished';
    if(status==='deleted')status='finished';
    return{...tube,status,deletedAt:'',previousStatus:''};
  }));
}

export function activateShuttleTube(tubes=[],tubeId='',{activatedAt='',historyCount=0}={}){
  const normalized=normalizeShuttleTubes(tubes),id=String(tubeId||'');
  if(!normalized.some(tube=>tube.id===id&&tube.status==='pending'))return normalized;
  const startedAt=String(activatedAt||''),baseline=Math.max(0,Number(historyCount)||0);
  return normalizeShuttleTubes(normalized.map(tube=>{
    if(tube.id===id)return{...tube,status:'active',activatedAt:startedAt,activationHistoryCount:baseline,finishedAt:''};
    if(tube.status==='active')return{...tube,status:'finished',finishedAt:startedAt};
    return tube;
  }));
}

export function playerPlayedSincePayment(history=[],playerId='',payment=null,tube={}){
  if(!payment||!playerId||tube?.status==='pending')return false;
  const paidAt=Date.parse(payment.paidAt||''),activatedAt=Date.parse(tube?.activatedAt||'');
  const finishedAt=Date.parse(tube?.finishedAt||'');
  const baseline=Math.max(0,Number(payment.historyCount)||0,Number(tube?.activationHistoryCount)||0);
  const starts=[paidAt,activatedAt].filter(Number.isFinite),startedAt=starts.length?Math.max(...starts):NaN;
  return (Array.isArray(history)?history:[]).some((match,index)=>{
    if(index<baseline)return false;
    const played=(match?.teams||[]).some(team=>(team||[]).includes(playerId));
    if(!played)return false;
    const endedAt=Date.parse(match?.endedAt||'');
    if(Number.isFinite(startedAt)&&Number.isFinite(endedAt)&&endedAt<startedAt)return false;
    if(Number.isFinite(finishedAt)&&Number.isFinite(endedAt)&&endedAt>finishedAt)return false;
    return true;
  });
}

export function shuttlePaymentStatus(tube,history=[],playerId=''){
  const payment=tube?.paid?.[playerId];
  if(!payment)return'unpaid';
  if(typeof payment.playedOverride==='boolean')return payment.playedOverride?'paid-played':'paid-waiting';
  return playerPlayedSincePayment(history,playerId,payment,tube)?'paid-played':'paid-waiting';
}
