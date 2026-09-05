export const REMOTE_COMMAND_MAX_AGE_MS=15_000;
export const REMOTE_COMMAND_MAX_FUTURE_SKEW_MS=5_000;

function timestampMillis(value){
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

export function shouldAcceptRemoteCommand({command,currentMatch,now=Date.now(),initial=false,fromCache=false,hasPendingWrites=false}={}){
  if(!command?.id||initial||fromCache||hasPendingWrites||!Number.isFinite(now))return false;
  const hasMatchId=Object.hasOwn(command,'matchId');
  if(hasMatchId&&(command.matchId??'')!==(currentMatch?.matchId??''))return false;

  const startedAt=timestampMillis(currentMatch?.startedAt);
  const timestamps=[timestampMillis(command.createdAt)];
  // Keep an offline command's original age even when its server timestamp is new.
  if(Object.hasOwn(command,'clientCreatedAt'))timestamps.push(timestampMillis(command.clientCreatedAt));
  return timestamps.every(timestamp=>Number.isFinite(timestamp)
    &&timestamp>=now-REMOTE_COMMAND_MAX_AGE_MS
    &&timestamp<=now+REMOTE_COMMAND_MAX_FUTURE_SKEW_MS
    &&(hasMatchId||!Number.isFinite(startedAt)||timestamp>=startedAt));
}
