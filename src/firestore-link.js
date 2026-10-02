export const FIRESTORE_LINK_INTERVAL_MS=5000;
export const FIRESTORE_LINK_TIMEOUT_MS=4000;
export const FIRESTORE_LINK_COOLDOWN_MS=10000;

export function shouldProbeFirestoreLink({
  online=false,
  hidden=false,
  roomReady=false,
  probeInFlight=false,
  now=0,
  lastProbeAt=0,
  cooldownUntil=0
}={}){
  if(!online||hidden||!roomReady||probeInFlight||now<cooldownUntil)return false;
  return now-lastProbeAt>=FIRESTORE_LINK_INTERVAL_MS;
}

export function firestoreLinkProbeVerdict({timedOut=false,errorCode=''}={}){
  const code=String(errorCode||'').replace(/^firestore\//,'');
  if(timedOut||code==='unavailable'||code==='deadline-exceeded')return'stuck';
  return'up';
}
