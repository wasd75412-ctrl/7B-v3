export function shouldShowNotificationPrompt({roomId,supported,enabled,alreadyAnswered,alreadyShown}){
  return !!roomId&&!!supported&&!enabled&&!alreadyAnswered&&!alreadyShown;
}

export function storedDeviceToken(primary='',legacy=''){
  return String(primary||legacy||'').trim();
}

// A cache-only room snapshot can omit the hash that is already on the server.
// Asking the user to claim again would replace a still-valid device identity.
export function shouldAskToClaimPlayer({hasHash=false,claimed=false,fromCache=false,serverChecked=false}={}){
  if(claimed||!hasHash)return false;
  return !(fromCache&&!serverChecked);
}

export function notificationClientToFocus(clients=[],targetHref=''){
  let target;
  try{target=new URL(targetHref)}catch{return null}
  const room=target.searchParams.get('room')||'';
  const usable=(Array.isArray(clients)?clients:[]).filter(client=>{
    try{return !!client?.url&&new URL(client.url).origin===target.origin}catch{return false}
  });
  const sameRoom=room?usable.filter(client=>{
    try{return new URL(client.url).searchParams.get('room')===room}catch{return false}
  }):[];
  const pool=sameRoom.length?sameRoom:usable;
  return pool.find(client=>client.focused)||pool[0]||null;
}

