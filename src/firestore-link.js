export const FIRESTORE_LINK_INTERVAL_MS=5000;
export const FIRESTORE_LINK_TIMEOUT_MS=4000;
export const FIRESTORE_LINK_COOLDOWN_MS=10000;
// Every probe is a billed server read, so a healthy listener that keeps receiving server events is never probed.
export const FIRESTORE_LINK_LIVE_IDLE_MS=30000;
export const FIRESTORE_LINK_IDLE_MS=180000;
export const FIRESTORE_LINK_PENDING_WRITE_MS=5000;

export function shouldProbeFirestoreLink({
  online=false,
  hidden=false,
  roomReady=false,
  probeInFlight=false,
  now=0,
  lastProbeAt=0,
  cooldownUntil=0,
  lastServerActivityAt=0,
  pendingWritesSince=0,
  matchLive=false
}={}){
  if(!online||hidden||!roomReady||probeInFlight||now<cooldownUntil)return false;
  if(now-lastProbeAt<FIRESTORE_LINK_INTERVAL_MS)return false;
  if(pendingWritesSince&&now-pendingWritesSince>=FIRESTORE_LINK_PENDING_WRITE_MS)return true;
  const idle=matchLive?FIRESTORE_LINK_LIVE_IDLE_MS:FIRESTORE_LINK_IDLE_MS;
  return now-Math.max(lastServerActivityAt,lastProbeAt)>=idle;
}

export function firestoreLinkProbeVerdict({timedOut=false,errorCode=''}={}){
  const code=String(errorCode||'').replace(/^firestore\//,'');
  if(timedOut||code==='unavailable'||code==='deadline-exceeded')return'stuck';
  return'up';
}
