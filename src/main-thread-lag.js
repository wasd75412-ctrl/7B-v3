export const MAIN_THREAD_TICK_MS=100;
export const MAIN_THREAD_LAG_WINDOW_MS=1500;

// A fixed-rate timer fires late exactly when the page is busy, which separates a stalled page from a late network.
export function createMainThreadLagMonitor({intervalMs=MAIN_THREAD_TICK_MS,windowMs=MAIN_THREAD_LAG_WINDOW_MS}={}){
  let lastTickAt=0;
  const samples=[];
  const prune=now=>{while(samples.length&&samples[0][0]<now-windowMs)samples.shift()};
  return{
    tick(now){
      if(lastTickAt){const lag=now-lastTickAt-intervalMs;if(lag>0)samples.push([now,lag])}
      lastTickAt=now;
      prune(now);
    },
    // An overdue tick that has not run yet still counts, since a command can be handled before it.
    lagAt(now){
      prune(now);
      let max=lastTickAt?Math.max(0,now-lastTickAt-intervalMs):0;
      for(const [,lag] of samples)if(lag>max)max=lag;
      return Math.round(max);
    }
  };
}
