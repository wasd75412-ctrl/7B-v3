const cleanIds=value=>[...new Set((Array.isArray(value)?value:[]).map(id=>String(id||'').trim()).filter(Boolean))];
const playerOwnerHashes=player=>cleanIds([
  player?.ownerHash,
  ...(Array.isArray(player?.ownerHashes)?player.ownerHashes:String(player?.ownerHashes||'').split('|'))
]);

export function claimedAdminPlayerId({roster=[],adminPlayerIds=[]}={},claimantHash=''){
  const hash=String(claimantHash||''),admins=new Set(cleanIds(adminPlayerIds));
  if(!hash||!admins.size)return'';
  return (Array.isArray(roster)?roster:[]).find(player=>admins.has(String(player?.id||''))&&playerOwnerHashes(player).includes(hash))?.id||'';
}

export function resolveAdminSessionToken({loggedOut=false,urlToken='',savedToken='',roomToken='',claimedPlayerAdmin=false}={}){
  if(loggedOut)return'';
  if(claimedPlayerAdmin&&roomToken)return String(roomToken);
  const token=String(urlToken||savedToken||'');
  return token&&token===String(roomToken||'')?token:'';
}

export function adminRoleButtonState(isHost=false){
  return isHost
    ?{label:'登出管理員',className:'btn danger-outline'}
    :{label:'管理員登入',className:'btn'};
}
