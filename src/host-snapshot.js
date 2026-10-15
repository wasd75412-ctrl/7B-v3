import { matchSessionEpoch } from './live-score.js';

export const HOST_SNAPSHOT_MAX_AGE_MS=12*60*60*1000;

export function hostSnapshotKey(roomId=''){
  return `bcmHostSnapshotV1:${roomId}`;
}

export function hostSnapshotEntry({state,base={},cloudAt=0,now=Date.now()}={}){
  return {savedAt:now,cloudAt:Number(cloudAt)||0,dirty:true,base:{adminPinHash:String(base.adminPinHash||''),hostToken:String(base.hostToken||'')},state};
}

export function readHostSnapshot(storage,roomId){
  try{
    const entry=JSON.parse(storage?.getItem(hostSnapshotKey(roomId))||'null');
    return entry&&entry.state&&typeof entry.state==='object'?entry:null;
  }catch{
    return null;
  }
}

// cloudAt is the room's server updatedAt, or null when the cloud copy could not be read at all.
// Restoring over a room someone else changed since this device last saw it would erase their edits.
export function hostSnapshotToRestore(entry,{cloudAt=null,now=Date.now()}={}){
  if(!entry?.state||!(now-Number(entry.savedAt)<=HOST_SNAPSHOT_MAX_AGE_MS))return null;
  if(cloudAt===null)return {...entry.base,...entry.state};
  if(entry.dirty===false)return null;
  return (Number(cloudAt)||0)<=(Number(entry.cloudAt)||0)?entry.state:null;
}

export function cloudMatchIsAhead(restored={},cloud={}){
  const restoredId=String(restored?.matchId||''),cloudId=String(cloud?.matchId||'');
  if(!cloudId)return false;
  if(restoredId!==cloudId)return matchSessionEpoch(cloud)>matchSessionEpoch(restored);
  const restoredOpen=restored.winner===null||restored.winner===undefined;
  return restoredOpen&&(cloud.rallies||[]).length>(restored.rallies||[]).length;
}
