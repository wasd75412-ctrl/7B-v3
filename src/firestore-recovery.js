export const FIRESTORE_RECOVERY_KEY='bcmFirestoreRecoveryV1';
export const FIRESTORE_RECOVERY_DELAY_MS=1500;
export const FIRESTORE_RECOVERY_REPEAT_MS=10*60_000;

// After these the SDK rejects every read and write until the page is loaded again.
export function isFatalFirestoreError(message){
  const text=String(message||'');
  return /firestore/i.test(text)&&/INTERNAL (?:ASSERTION FAILED|UNHANDLED ERROR)/.test(text);
}

export function readFirestoreRecovery(storage){
  try{
    const value=JSON.parse(storage?.getItem(FIRESTORE_RECOVERY_KEY)||'null');
    return {at:Number(value?.at)||0,memory:value?.memory===true};
  }catch{
    return {at:0,memory:false};
  }
}

// A second failure soon after a reload points at the browser's IndexedDB, so that tab drops the disk cache.
export function nextFirestoreRecovery(previous={},now=Date.now()){
  const at=Number(previous?.at)||0,memory=previous?.memory===true;
  const repeated=at>0&&now-at<FIRESTORE_RECOVERY_REPEAT_MS;
  if(repeated&&memory)return null;
  return {at:now,memory:memory||repeated};
}
