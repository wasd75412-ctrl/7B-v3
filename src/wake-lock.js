export function wakeLockButtonIntent({wanted=false,active=false,supported=true}={}){
  if(wanted&&!supported)return'disable';
  if(wanted&&!active)return'retry';
  return wanted?'disable':'enable';
}

export function wakeLockControlIsActive({nativeActive=false}={}){
  return nativeActive;
}

export function shouldRequestNativeWakeLock({wanted=false,hidden=false,nativeSupported=false,nativeActive=false,requestPending=false}={}){
  return wanted&&!hidden&&nativeSupported&&!nativeActive&&!requestPending;
}
