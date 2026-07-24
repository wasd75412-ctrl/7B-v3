const cleanText=(value,maxLength)=>String(value||'').trim().slice(0,maxLength);

export function normalizeShuttleTubes(value,maxCount=20){
  const rows=Array.isArray(value)?value:[];
  return rows.map((tube,index)=>{
    const paidSource=tube?.paid&&typeof tube.paid==='object'?tube.paid:{};
    const paid={};
    for(const [playerId,payment] of Object.entries(paidSource)){
      if(!playerId)continue;
      paid[playerId]={
        paidAt:cleanText(payment?.paidAt,40),
        historyCount:Math.max(0,Number(payment?.historyCount)||0)
      };
    }
    return{
      id:cleanText(tube?.id,128)||`tube-${index}`,
      name:cleanText(tube?.name,60)||'未命名用球',
      price:Math.max(0,Math.round(Number(tube?.price)||0)),
      createdAt:cleanText(tube?.createdAt,40),
      paid
    };
  }).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)).slice(0,maxCount);
}

export function createShuttleTube({id='',name='',price=0,createdAt=''}={}){
  return normalizeShuttleTubes([{id,name,price,createdAt}])[0];
}

export function setShuttlePayment(tube,playerId,paid,{paidAt='',historyCount=0}={}){
  const normalized=normalizeShuttleTubes([tube])[0],id=String(playerId||'');
  if(!normalized||!id)return normalized;
  const payments={...normalized.paid};
  if(paid)payments[id]={paidAt:String(paidAt||''),historyCount:Math.max(0,Number(historyCount)||0)};
  else delete payments[id];
  return{...normalized,paid:payments};
}

export function playerPlayedSincePayment(history=[],playerId='',payment=null){
  if(!payment||!playerId)return false;
  const paidAt=Date.parse(payment.paidAt||''),baseline=Math.max(0,Number(payment.historyCount)||0);
  return (Array.isArray(history)?history:[]).some((match,index)=>{
    if(index<baseline)return false;
    const played=(match?.teams||[]).some(team=>(team||[]).includes(playerId));
    if(!played)return false;
    const endedAt=Date.parse(match?.endedAt||'');
    return !Number.isFinite(paidAt)||!Number.isFinite(endedAt)||endedAt>=paidAt;
  });
}

export function shuttlePaymentStatus(tube,history=[],playerId=''){
  const payment=tube?.paid?.[playerId];
  if(!payment)return'unpaid';
  return playerPlayedSincePayment(history,playerId,payment)?'paid-played':'paid-waiting';
}
