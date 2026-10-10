export const TEST_MODE_IDLE_MS=60*60*1000;

export function testModeLastActiveMs(source){
  return Math.max(0,Number(source?.testModeRevision)||0,Number(source?.testModeActiveAt)||0);
}

export function testModeIdleExpired(source,now=Date.now()){
  return !!source?.testMode&&now-testModeLastActiveMs(source)>=TEST_MODE_IDLE_MS;
}

export function testModeOn(source,now=Date.now()){
  return !!source?.testMode&&!testModeIdleExpired(source,now);
}
