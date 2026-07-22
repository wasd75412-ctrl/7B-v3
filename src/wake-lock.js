export function wakeLockButtonIntent({wanted=false,active=false}={}){
  if(wanted&&!active)return'retry';
  return wanted?'disable':'enable';
}

export function shouldStartPersistentVideoWakeLock({wanted=false,userActivated=false,videoActive=false}={}){
  return wanted&&userActivated&&!videoActive;
}

export function wakeLockControlIsActive({nativeSupported=false,nativeActive=false,fallbackActive=false}={}){
  return nativeSupported?nativeActive:fallbackActive;
}

export function shouldRequestNativeWakeLock({wanted=false,hidden=false,nativeSupported=false,nativeActive=false,requestPending=false}={}){
  return wanted&&!hidden&&nativeSupported&&!nativeActive&&!requestPending;
}
