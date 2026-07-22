export function wakeLockButtonIntent({wanted=false,active=false}={}){
  if(wanted&&!active)return'retry';
  return wanted?'disable':'enable';
}
