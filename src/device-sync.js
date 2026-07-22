export function canAutoSyncPlayerIdentity({
  syncing=false,
  roomReady=false,
  hasIdentity=false,
  fromCache=false,
  hasPendingWrites=false
}={}){
  return Boolean(!syncing&&roomReady&&hasIdentity&&!fromCache&&!hasPendingWrites);
}
