export const APP_UPDATE_CHECK_MS=5*60_000;
export const APP_UPDATE_RETRY_MS=30_000;
export const APP_UPDATE_IDLE_MS=60_000;
export const APP_UPDATE_ATTEMPT_KEY='bcmAppUpdateAttemptV1';

function versionParts(value){
  const parts=String(value||'').trim().split('.');
  return parts.length===3&&parts.every(part=>/^\d+$/.test(part))?parts.map(Number):null;
}

export function isNewerVersion(deployed,current){
  const next=versionParts(deployed),now=versionParts(current);
  if(!next||!now)return false;
  for(let i=0;i<3;i++)if(next[i]!==now[i])return next[i]>now[i];
  return false;
}

// One reload attempt per deployed version per tab, so a stale cache can never cause a reload loop.
export function shouldAdoptVersion(deployed,current,attempted=''){
  return isNewerVersion(deployed,current)&&String(deployed)!==String(attempted||'');
}

export function canReloadForUpdate({matchInPlay=false,scoreVisible=false,modalOpen=false,editing=false,hidden=false,idleMs=0}={}){
  if(matchInPlay||scoreVisible||modalOpen||editing)return false;
  return hidden||idleMs>=APP_UPDATE_IDLE_MS;
}
