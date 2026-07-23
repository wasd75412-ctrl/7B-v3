export function resolveAdminSessionToken({loggedOut=false,urlToken='',savedToken='',roomToken=''}={}){
  if(loggedOut)return'';
  const token=String(urlToken||savedToken||'');
  return token&&token===String(roomToken||'')?token:'';
}

export function adminRoleButtonState(isHost=false){
  return isHost
    ?{label:'登出管理員',className:'btn danger-outline'}
    :{label:'管理員登入',className:'btn'};
}
