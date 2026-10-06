import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ownsScoring } from '../src/live-score.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const host=readFileSync(new URL('../src/local-link.js',import.meta.url),'utf8');
const android=name=>readFileSync(new URL(`../android-remote/app/src/main/java/tw/club7b/scoreremote/${name}.java`,import.meta.url),'utf8');
const link=android('LocalLinkClient'),controller=android('BackgroundScoreController'),service=android('RemoteKeyAccessibilityService');

function productionFunction(name){
  const declaration=new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(main);
  assert.ok(declaration,`Production function ${name} must exist`);
  const rest=main.slice(declaration.index+declaration[0].length);
  const next=/^(?:async )?function \w+\(/m.exec(rest);
  return main.slice(declaration.index,declaration.index+declaration[0].length+next.index);
}

function harness(state,{testMode=false,nextLineup=[]}={}){
  const calls={alerts:0,startMatch:0,startNext:0,indicators:[]};
  const context=vm.createContext({
    state,
    matchPlayerCount:format=>format==='singles'?2:4,
    normalizeMatchFormat:format=>format==='singles'?'singles':'doubles',
    selectedNextLineup:()=>nextLineup,
    currentTestModeEnabled:()=>testMode,
    showScoreRemoteIndicator:message=>calls.indicators.push(message),
    alert:()=>calls.alerts++,
    startMatch:()=>calls.startMatch++,
    startNext:()=>calls.startNext++
  });
  for(const name of ['remoteLineupProblem','startMatchFromRemote','startNextFromRemote']){
    vm.runInContext(productionFunction(name),context);
  }
  return {context,calls};
}

test('a remote press with an incomplete lineup only shows a short notice',()=>{
  const {context,calls}=harness({matchFormat:'doubles',court:['a','b','c',null],match:{}});
  assert.equal(context.startMatchFromRemote(),false);
  assert.deepEqual(calls.indicators,['場上人數不足']);
  assert.equal(calls.startMatch,0);
  assert.equal(calls.alerts,0);
  const ready=harness({matchFormat:'doubles',court:['a','b','c','d'],match:{}});
  assert.equal(ready.context.startMatchFromRemote(),true);
  assert.equal(ready.calls.startMatch,1);
});

test('a remote next match checks the lineup and the staying winners first',()=>{
  const finished={format:'doubles',players:[['a','b'],['c','d']],winner:0};
  const short=harness({match:finished},{nextLineup:['a','b','e']});
  assert.equal(short.context.startNextFromRemote(),false);
  assert.deepEqual(short.calls.indicators,['場上人數不足']);
  const winnersLeft=harness({match:finished},{nextLineup:['a','e','f','g']});
  assert.equal(winnersLeft.context.startNextFromRemote(),false);
  assert.deepEqual(winnersLeft.calls.indicators,['勝方須留場']);
  const testMode=harness({match:finished},{nextLineup:['a','e','f','g'],testMode:true});
  assert.equal(testMode.context.startNextFromRemote(),true);
  const ready=harness({match:finished},{nextLineup:['a','b','e','f']});
  assert.equal(ready.context.startNextFromRemote(),true);
  for(const run of [short,winnersLeft,testMode,ready])assert.equal(run.calls.alerts,0);
});

test('remote start paths never call startMatch or startNext directly',()=>{
  for(const name of ['handleRemoteNextMatchCommand','handleRemoteStartMatchCommand','handleRemoteActionCommand']){
    assert.doesNotMatch(productionFunction(name),/\bstart(?:Match|Next)\(\)/);
  }
});

test('only the scoring device deletes remote commands and answers the phone link',()=>{
  assert.match(productionFunction('deleteRemoteScore'),/if\(requestedAndroidRemote\|\|!isHost\|\|!ownsScoring\(state\.match,scoreDeviceId\)\)return;/);
  assert.equal(ownsScoring({scorerDevice:'ipad'},'phone'),false);
  assert.equal(ownsScoring({scorerDevice:''},'phone'),true);
  assert.match(productionFunction('syncLocalLinkOwner'),/localLinkHost\.refresh\(ownsScoring\(state\.match,scoreDeviceId\)\)/);
  for(const name of ['applyLiveScoreState','claimScoring','checkpointNewMatch'])assert.match(productionFunction(name),/syncLocalLinkOwner\(\)/);
  assert.match(host,/refresh\(owner\)\{\s*if\(stopped\)return;\s*if\(owner\)\{announce\(\);return\}\s*announced=false;\s*for\(const deviceId of \[\.\.\.peers\.keys\(\)\]\)closeDevice\(deviceId\);/);
});

test('Android only offers the direct link while the room has a match in play',()=>{
  assert.match(link,/void setMatchActive\(String roomId, boolean active\) \{\s*handler\.post\(\(\) -> \{\s*if \(!roomId\.equals\(desiredRoomId\)\) return;\s*matchActive = active;\s*sync\(\);/);
  assert.match(link,/private void sync\(\) \{\s*if \(!matchActive \|\| desiredRoomId\.isEmpty\(\)\) \{\s*stop\(\);\s*return;\s*\}/);
  assert.match(link,/if \(!session\.roomId\.equals\(desiredRoomId\)\) \{\s*desiredRoomId = session\.roomId;\s*matchActive = false;/);
  assert.match(link,/private void stop\(\) \{\s*if \(linkListener != null\) linkListener\.remove\(\);\s*linkListener = null;\s*closePeer\(\);\s*linkRef = null;/);
  assert.match(controller,/matchKnown = true;\s*DocumentReference room = snapshot\.getReference\(\)\.getParent\(\)\.getParent\(\);\s*if \(room != null\) LocalLinkClient\.shared\(context\)\.setMatchActive\(room\.getId\(\), nextActive\);/);
});

test('Android reports a press only once it was delivered and warns when the network is slow',()=>{
  assert.match(controller,/WRITE_ACK_TIMEOUT_MS = 2_500L/);
  assert.match(controller,/SLOW_WRITE_MESSAGE = "網路較慢，指令排隊中，請勿重按"/);
  assert.match(controller,/void awaitAck\(boolean deliveredDirectly, String successMessage\) \{\s*if \(deliveredDirectly\) report\(true, successMessage\);\s*else feedbackHandler\.postDelayed\(slow, WRITE_ACK_TIMEOUT_MS\);/);
  assert.match(controller,/void report\(boolean success, String message\) \{\s*if \(!reported\.compareAndSet\(false, true\)\) return;/);
  assert.match(controller,/private boolean sendDirect\(String type, Object command\)[\s\S]*?return LocalLinkClient\.shared\(context\)\.send\(message\);/);
});

test('recording mode only turns built-in phone keys into background scoring',()=>{
  assert.match(service,/if \(!RemoteSessionStore\.isRecordingEnabled\(this\)\) return false;\s*if \(!PhoneKeySource\.isBuiltIn\(event\.getDevice\(\)\)\) return false;\s*return handleBackgroundKeyEvent\(event, keyCode\);/);
  const keySource=android('PhoneKeySource');
  assert.match(keySource,/if \(device == null \|\| device\.isVirtual\(\)\) return false;/);
  assert.match(keySource,/Build\.VERSION_CODES\.Q\) return !device\.isExternal\(\);/);
});
