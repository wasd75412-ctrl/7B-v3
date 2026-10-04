export const REMOTE_COMMAND_MAX_AGE_MS=15_000;
export const REMOTE_COMMAND_MAX_FUTURE_SKEW_MS=5_000;

export function timestampMillis(value){
  let millis=NaN;
  try{
    if(typeof value==='number')millis=value;
    else if(typeof value==='string'&&value.trim())millis=Date.parse(value);
    else if(value instanceof Date)millis=value.getTime();
    else if(typeof value?.toMillis==='function')millis=value.toMillis();
    else if(Number.isInteger(value?.seconds)){
      const nanos=value.nanoseconds??0;
      if(Number.isInteger(nanos)&&nanos>=0&&nanos<1_000_000_000)millis=value.seconds*1000+nanos/1_000_000;
    }
  }catch{return NaN}
  return Number.isFinite(millis)&&millis>0&&millis<=8_640_000_000_000_000?millis:NaN;
}

export function shouldAcceptRemoteCommand({command,currentMatch,now=Date.now(),initial=false,fromCache=false,hasPendingWrites=false,skipAge=false}={}){
  if(!command?.id||initial||fromCache||hasPendingWrites||!Number.isFinite(now))return false;
  const hasMatchId=Object.hasOwn(command,'matchId');
  if(hasMatchId&&(command.matchId??'')!==(currentMatch?.matchId??''))return false;
  if(skipAge)return true;

  const startedAt=timestampMillis(currentMatch?.startedAt);
  const fresh=timestamp=>Number.isFinite(timestamp)
    &&timestamp>=now-REMOTE_COMMAND_MAX_AGE_MS
    &&(hasMatchId||!Number.isFinite(startedAt)||timestamp>=startedAt);
  const server=timestampMillis(command.createdAt);
  if(!fresh(server)||server>now+REMOTE_COMMAND_MAX_FUTURE_SKEW_MS)return false;
  // Keep an offline command's original age even when its server timestamp is new.
  // Phone clocks can run several seconds ahead of the host, so only the server time bounds the future.
  return !Object.hasOwn(command,'clientCreatedAt')||fresh(timestampMillis(command.clientCreatedAt));
}

export const STALE_MATCH_PRESS_GRACE_MS=8_000;

// A phone that missed the match change still stamps the previous matchId; a press made well after
// the current match officially started can only be meant for the current match.
export function isStaleMatchPressForCurrentMatch({command,currentMatch,graceMs=STALE_MATCH_PRESS_GRACE_MS}={}){
  if(!command?.id||!['teamAPlus','teamBPlus','undo'].includes(String(command.action||'')))return false;
  if(!Object.hasOwn(command,'matchId')||(command.matchId??'')===(currentMatch?.matchId??''))return false;
  if(!currentMatch?.active||(currentMatch.winner!==null&&currentMatch.winner!==undefined))return false;
  const startedAt=timestampMillis(currentMatch.startedAt),pressedAt=timestampMillis(command.clientCreatedAt);
  return Number.isFinite(startedAt)&&Number.isFinite(pressedAt)&&pressedAt>=startedAt+graceMs;
}
