function fieldString(field){return field?.stringValue||field?.timestampValue||''}
function eventFromMap(value){
  const fields=value?.mapValue?.fields||{};
  const date=fieldString(fields.date),time=fieldString(fields.time);
  if(!date||!time)return null;
  return{id:fieldString(fields.id)||fieldString(fields.publishedAt)||`${date}_${time}`,date,time,location:fieldString(fields.location)};
}

export function firestoreEventsFromDocument(document){
  const fields=document?.fields||{},rows=(fields.nextEvents?.arrayValue?.values||[]).map(eventFromMap).filter(Boolean),legacy=eventFromMap(fields.nextEvent);
  if(legacy&&!rows.some(event=>event.id===legacy.id))rows.push(legacy);
  return rows;
}

export function eventStartMs(event){
  const value=Date.parse(`${event?.date||''}T${event?.time||''}:00+08:00`);
  return Number.isFinite(value)?value:0;
}

export const PACKING_EVENTS_STORE='7b-packing-events';

export async function cachedRoomEvents(store,roomId){
  const value=await store.get(roomId,{type:'json'}).catch(()=>null);
  return Array.isArray(value?.events)?value.events:null;
}

// KV writes have a small daily quota, so the cache is only rewritten when the schedule changes.
export async function cacheRoomEvents(store,roomId,events,cached){
  if(cached!==undefined&&JSON.stringify(cached)===JSON.stringify(events))return false;
  await store.setJSON(roomId,{events,updatedAt:new Date().toISOString()});
  return true;
}

// Firestore can hit its daily read quota, so the last known schedule keeps reminders working.
export async function roomEventsWithFallback(store,roomId,readEvents){
  const cached=await cachedRoomEvents(store,roomId);
  try{
    const events=await readEvents(roomId);
    await cacheRoomEvents(store,roomId,events,cached??undefined).catch(error=>console.warn(`Packing events cache ${roomId}`,error?.message||error));
    return events;
  }catch(error){
    if(cached)return cached;
    throw error;
  }
}

export function duePackingEvent(events,lastEventId='',minutes=60,now=Date.now()){
  const leadMs=([30,60,90,120].includes(Number(minutes))?Number(minutes):60)*60*1000;
  return (Array.isArray(events)?events:[]).filter(event=>{const start=eventStartMs(event),remaining=start-now;return start&&remaining>0&&remaining<=leadMs&&event.id!==lastEventId}).sort((a,b)=>eventStartMs(a)-eventStartMs(b))[0]||null;
}
