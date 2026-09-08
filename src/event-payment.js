const cleanText=(value,max=80)=>String(value||'').trim().slice(0,max);

export function normalizeEventPayments(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return{};
  return Object.fromEntries(Object.entries(value).map(([playerId,payment])=>{
    const id=cleanText(playerId,128),status=payment?.status==='confirmed'?'confirmed':payment?.status==='pending'?'pending':'';
    if(!id||!status)return null;
    return[id,{status,reportedAt:cleanText(payment?.reportedAt,40),confirmedAt:cleanText(payment?.confirmedAt,40)}];
  }).filter(Boolean).slice(0,80));
}

export function eventPaymentStatus(event,playerId){
  return normalizeEventPayments(event?.payments)[cleanText(playerId,128)]?.status||'unpaid';
}

export function updateEventPayment(event,playerId,status,at=''){
  const id=cleanText(playerId,128),payments=normalizeEventPayments(event?.payments);
  if(!id||!['unpaid','pending','confirmed'].includes(status))return{...event,payments};
  if(status==='unpaid')delete payments[id];
  else{
    const previous=payments[id]||{};
    payments[id]={
      status,
      reportedAt:status==='pending'?cleanText(at,40):previous.reportedAt||cleanText(at,40),
      confirmedAt:status==='confirmed'?cleanText(at,40):''
    };
  }
  return{...event,payments};
}

export function pendingEventPaymentPlayerIds(event){
  return Object.entries(normalizeEventPayments(event?.payments)).filter(([,payment])=>payment.status==='pending').map(([playerId])=>playerId);
}
