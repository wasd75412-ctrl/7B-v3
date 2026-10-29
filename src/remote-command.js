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

// A command created while the page was still attaching the listener is a start the
// scorer is waiting for, not the baseline command already stored on the document.
export function officialStartArrivedAfterAttach(commandAt,attachedAt,maxAge=REMOTE_COMMAND_MAX_AGE_MS){
  return Number.isFinite(commandAt)&&Number.isFinite(attachedAt)&&commandAt>=attachedAt-maxAge;
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
  // The direct link omits the server timestamp. Its client time is the only clock, and a phone
  // that runs ahead of the iPad must still be able to start the match.
  if(!Number.isFinite(server))return fresh(timestampMillis(command.clientCreatedAt));
  if(!fresh(server)||server>now+REMOTE_COMMAND_MAX_FUTURE_SKEW_MS)return false;
  // Keep an offline command's original age even when its server timestamp is new.
  // Phone clocks can run several seconds ahead of the host, so only the server time bounds the future.
  return !Object.hasOwn(command,'clientCreatedAt')||fresh(timestampMillis(command.clientCreatedAt));
}

// The official-start key has one job. A command for the match on screen must land even when the
// phone clock or the network made the usual 15s window miss it. A press for the match this one
// replaced must not start the next match.
// The official-start key starts the match on screen. Venue Wi-Fi can deliver it late, and the phone
// often still stamps the previous match id. A press made before this match was shown stays there.
export function shouldAcceptOfficialStart({command,currentMatch,now=Date.now(),initial=false,matchShownAt=0,replacedMatchId=''}={}){
  if(!command?.id||!currentMatch?.active||currentMatch.winner!=null||!Number.isFinite(now))return false;
  const waiting=!Number.isFinite(timestampMillis(currentMatch.startedAt));
  const commandMatchId=Object.hasOwn(command,'matchId')?String(command.matchId??''):'';
  const sameMatch=commandMatchId!==''&&commandMatchId===String(currentMatch.matchId??'');
  if(!waiting)return sameMatch&&!initial;
  if(sameMatch)return true;
  const pressed=timestampMillis(command.clientCreatedAt)||timestampMillis(command.createdAt);
  if(!Number.isFinite(pressed)||!Number.isFinite(matchShownAt)||matchShownAt<=0)return false;
  const previousMatch=String(replacedMatchId||'');
  if(commandMatchId!==''&&commandMatchId===previousMatch&&pressed<matchShownAt)return false;
  if(pressed+REMOTE_COMMAND_MAX_FUTURE_SKEW_MS<matchShownAt)return false;
  return pressed<=now+180_000;
}

export const QUEUED_REPEAT_PRESS_MS=3_000;
export const QUEUED_REPEAT_ARRIVAL_MS=1_000;

// Presses held back by a network stall land together. A same-team press made within a few seconds of
// the previous one that also lands with it is a repeat of a press that only looked lost.
export function isQueuedRepeatPress({action,pressedAt,arrivedAt,previous}={}){
  if(!['teamAPlus','teamBPlus'].includes(action)||previous?.action!==action)return false;
  if(![pressedAt,arrivedAt,previous.pressedAt,previous.arrivedAt].every(Number.isFinite))return false;
  const pressGap=pressedAt-previous.pressedAt,arrivalGap=arrivedAt-previous.arrivedAt;
  return pressGap>=0&&pressGap<QUEUED_REPEAT_PRESS_MS&&arrivalGap>=0&&arrivalGap<QUEUED_REPEAT_ARRIVAL_MS;
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


