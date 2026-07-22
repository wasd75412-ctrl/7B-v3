export function wakeLockButtonIntent({wanted=false,active=false}={}){
  if(wanted&&!active)return'retry';
  return wanted?'disable':'enable';
}

export function shouldStartPersistentVideoWakeLock({wanted=false,userActivated=false,appleTouchDevice=false,videoActive=false}={}){
  return wanted&&userActivated&&appleTouchDevice&&!videoActive;
}
