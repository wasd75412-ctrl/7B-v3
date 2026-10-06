import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOCAL_LINK_OFFER_MAX_AGE_MS, freshLocalLinkOffers, isFreshLocalLinkOffer, parseLocalLinkMessage } from '../src/local-link.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');
const client=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LocalLinkClient.java',import.meta.url),'utf8');
const gradle=readFileSync(new URL('../android-remote/app/build.gradle',import.meta.url),'utf8');

test('only recent offers with a session and SDP are answered',()=>{
  const now=1_800_000_000_000;
  assert.equal(isFreshLocalLinkOffer({sessionId:'s',sdp:'v=0',clientCreatedAt:now-1000},now),true);
  assert.equal(isFreshLocalLinkOffer({sessionId:'s',sdp:'v=0',clientCreatedAt:now-LOCAL_LINK_OFFER_MAX_AGE_MS-1},now),false);
  assert.equal(isFreshLocalLinkOffer({sessionId:'s',sdp:'',clientCreatedAt:now},now),false);
  assert.equal(isFreshLocalLinkOffer({sdp:'v=0',clientCreatedAt:now},now),false);
  assert.equal(isFreshLocalLinkOffer(null,now),false);
});

test('each phone offers under its own id so two phones never replace each other',()=>{
  const now=1_800_000_000_000;
  const offers=freshLocalLinkOffers({rog:{sessionId:'a',sdp:'v=0',clientCreatedAt:now},samsung:{sessionId:'b',sdp:'v=0',clientCreatedAt:now-1000},old:{sessionId:'c',sdp:'v=0',clientCreatedAt:now-LOCAL_LINK_OFFER_MAX_AGE_MS-1}},now);
  assert.deepEqual(offers.map(([deviceId])=>deviceId),['rog','samsung']);
  assert.deepEqual(freshLocalLinkOffers(null,now),[]);
  const host=readFileSync(new URL('../src/local-link.js',import.meta.url),'utf8');
  assert.match(host,/const peers=new Map\(\),answering=new Map\(\);/);
  assert.match(host,/closeDevice\(deviceId\);\s*const current=new RTCPeerConnection/);
  assert.match(host,/setDoc\(ref,\{answers:\{\[deviceId\]:\{sessionId:offer\.sessionId/);
  assert.doesNotMatch(host,/data\(\)\?\.offer[^s]/);
  assert.match(client,/offers\.put\(deviceId\(\), offer\);\s*Map<String, Object> updates = new HashMap<>\(\);\s*updates\.put\("offers", offers\);/);
  assert.match(client,/Object answers = snapshot\.get\("answers"\);\s*Object value = answers instanceof Map \? \(\(Map<\?, \?>\) answers\)\.get\(deviceId\(\)\) : null;/);
  assert.match(client,/preferences\.edit\(\)\.putString\("deviceId", stored\)\.apply\(\);/);
});

test('direct-link messages become the same commands as their Firestore copies',()=>{
  const parsed=parseLocalLinkMessage(JSON.stringify({type:'officialStart',id:'abc',matchId:'m1',clientCreatedAt:5}),99);
  assert.deepEqual(parsed,{type:'officialStart',command:{id:'abc',matchId:'m1',clientCreatedAt:5,createdAt:99}});
  assert.equal(parseLocalLinkMessage(JSON.stringify({type:'action',id:'x',action:'teamAPlus',matchId:'m1'}),1).command.action,'teamAPlus');
  assert.equal(parseLocalLinkMessage('{"type":"other","id":"x"}'),null);
  assert.equal(parseLocalLinkMessage('{"type":"action"}'),null);
  assert.equal(parseLocalLinkMessage('not json'),null);
});

test('the iPad answers the phone and handles direct commands through the existing handlers',()=>{
  const channels=main.match(/function startRemoteControlChannels\(id\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(channels,/if\(remoteActionUnsubscribe\|\|requestedAndroidRemote\|\|!isHost\|\|roomId!==id\)return;/);
  assert.match(channels,/localLinkHost=startLocalLinkHost\(\{db,roomId:id,canAnswer:\(\)=>isHost&&document\.visibilityState==='visible'&&ownsScoring\(state\.match,scoreDeviceId\),onCommand:handleLocalLinkCommand/);
  assert.match(main,/if\(isHost&&roomId\)startRemoteControlChannels\(roomId\);else if\(!isHost\)stopRemoteControlChannels\(\);/);
  const handler=main.match(/function handleLocalLinkCommand\(\{type,command\}\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(handler,/handleRemoteOfficialStartCommand\(\{officialStartCommand:command\}\)/);
  assert.match(handler,/handleRemoteActionCommand\(\{remoteActionCommand:command\},\{initial:false,skipAge:true\}\)/);
  assert.match(main,/localLinkHost\?\.stop\(\);localLinkHost=null;localLinkOpen=false;/);
  assert.match(main,/if\(isHost\)localLinkHost\?\.announce\(\);/);
  assert.match(main,/if\(localLinkOpen\)\{scoreBadge\.textContent='直連'/);
});

test('a Firestore copy of a command already handled over the link is dropped and cleaned up',()=>{
  assert.match(main,/if\(seenRemoteActionIds\.has\(String\(command\.id\)\)\)\{if\(!initial\)logRemoteDiagnostic\('score','firebase',command,'dup'\);deleteRemoteScore\(change\.doc\.ref\);continue\}/);
  assert.match(main,/sessionStorage\.setItem\(seenRemoteActionKey\(\),JSON\.stringify\(\[\.\.\.seenRemoteActionIds\]\.slice\(-REMOTE_SEEN_ACTION_LIMIT\)\)\)/);
  assert.match(main,/function handleRemoteOfficialStartCommand\(data,\{initial=false\}=\{\}\)\{\s*const id=String\(data\?\.officialStartCommand\?\.id\|\|''\);if\(!id\|\|id===lastRemoteOfficialStartCommandId\)return false;/);
});

test('the iPad records when each command arrives on each path',()=>{
  const log=main.match(/function logRemoteDiagnostic\(kind,via,command,result\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(log,/if\(requestedAndroidRemote\|\|!isHost\|\|!roomId\)return;/);
  assert.match(log,/remoteDiagnostics\.length>80/);
  assert.match(log,/doc\(db,'badmintonRooms',roomId,'remoteControl','diagnostics'\)/);
});

test('Android sends each command over the link with the same id it writes to Firestore',()=>{
  assert.match(controller,/LocalLinkClient\.shared\(context\)\.ensureStarted\(session\);/);
  assert.match(controller,/sendDirect\("action", command\);\s*remoteControl\.getParent\(\)\.document\("score-" \+ id\)\.set\(command\)/);
  assert.match(controller,/sendDirect\("officialStart", updates\.get\("officialStartCommand"\)\);\s*Feedback feedback = [^\n]*\n\s*remoteControl\.set\(updates, SetOptions\.merge\(\)\)/);
  assert.match(controller,/if \(!"createdAt"\.equals\(entry\.getKey\(\)\)\)/);
  assert.match(gradle,/implementation 'io\.getstream:stream-webrtc-android:/);
});

test('Android only touches WebRTC state on the main looper',()=>{
  assert.doesNotMatch(client,/synchronized void|synchronized \(this\)|synchronized \(LocalLinkClient\.this\)/);
  assert.match(client,/void ensureStarted\(RemoteSessionStore\.Session session\) \{\s*handler\.post\(\(\) -> start\(session\)\);/);
  assert.match(client,/new PeerConnection\.RTCConfiguration\(new ArrayList<>\(\)\)/);
  assert.match(client,/ANSWER_TIMEOUT_MS = 45_000L/);
});
