import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMainThreadLagMonitor } from '../src/main-thread-lag.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('an idle page reports no lag',()=>{
  const monitor=createMainThreadLagMonitor({intervalMs:100,windowMs:1500});
  for(let now=1000;now<=2000;now+=100)monitor.tick(now);
  assert.equal(monitor.lagAt(2050),0);
});

test('a stall that already ended is still reported inside the window',()=>{
  const monitor=createMainThreadLagMonitor({intervalMs:100,windowMs:1500});
  monitor.tick(1000);
  monitor.tick(1900);
  monitor.tick(2000);
  assert.equal(monitor.lagAt(2010),800);
  for(let now=2100;now<=3500;now+=100)monitor.tick(now);
  assert.equal(monitor.lagAt(3510),0);
});

test('a stall whose overdue tick has not run yet is reported',()=>{
  const monitor=createMainThreadLagMonitor({intervalMs:100,windowMs:1500});
  monitor.tick(1000);
  assert.equal(monitor.lagAt(1700),600);
});

test('every remote diagnostic records how busy the scoring page was',()=>{
  assert.match(main,/if\(!requestedAndroidRemote\)setInterval\(\(\)=>mainThreadLag\.tick\(Date\.now\(\)\),MAIN_THREAD_TICK_MS\);/);
  const log=main.match(/function logRemoteDiagnostic\(kind,via,command,result\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(log,/linkOpen:localLinkOpen,pageLag:mainThreadLag\.lagAt\(at\),/);
});

test('remote diagnostics keep the phone-side send timing of each press',()=>{
  const log=main.match(/function logRemoteDiagnostic\(kind,via,command,result\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(log,/inputLag:Number\(command\?\.inputLagMs\)\|\|0,handoff:Number\(command\?\.handoffAt\)\|\|0,linkSent:Number\(command\?\.linkSentAt\)\|\|0\}/);
  const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');
  assert.match(controller,/command\.put\("inputLagMs", request\.inputLagMs\);/);
  assert.match(controller,/long handoffAt = System\.currentTimeMillis\(\);\s*boolean direct = sendDirect\("action", command\);/);
  assert.match(controller,/if \(direct\) command\.put\("linkSentAt", System\.currentTimeMillis\(\)\);\s*remoteControl\.getParent\(\)\.document\("score-" \+ id\)\.set\(command\)/);
});
