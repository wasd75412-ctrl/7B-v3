import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {claimSupersedes,scorerTabClaim} from '../src/scorer-tab.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('the tab the admin is looking at takes over scoring from older tabs of the same room',()=>{
  const older=scorerTabClaim({tabId:'old',roomId:'RTYBSJ',visible:true,now:1000});
  const shown=scorerTabClaim({tabId:'new',roomId:'RTYBSJ',visible:true,now:2000});
  assert.equal(claimSupersedes(shown,older),true);
  assert.equal(claimSupersedes(older,shown),false);
});

test('a tab loaded in the background never displaces the shown tab',()=>{
  const shown=scorerTabClaim({tabId:'a',roomId:'RTYBSJ',visible:true,now:5000});
  const hidden=scorerTabClaim({tabId:'b',roomId:'RTYBSJ',visible:false,now:9000});
  assert.equal(hidden.at,0);
  assert.equal(claimSupersedes(hidden,shown),false);
  assert.equal(claimSupersedes(shown,hidden),true);
});

test('a hidden tab keeps the time it was last shown',()=>{
  const previous=scorerTabClaim({tabId:'a',roomId:'RTYBSJ',visible:true,now:5000});
  assert.equal(scorerTabClaim({tabId:'a',roomId:'RTYBSJ',visible:false,now:9000,previous}).at,5000);
  assert.equal(scorerTabClaim({tabId:'a',roomId:'OTHER1',visible:false,now:9000,previous}).at,0);
});

test('equal claims still leave exactly one scorer tab',()=>{
  const a={tabId:'a',roomId:'RTYBSJ',at:0},b={tabId:'b',roomId:'RTYBSJ',at:0};
  assert.notEqual(claimSupersedes(a,b),claimSupersedes(b,a));
});

test('tabs of other rooms and the tab itself are ignored',()=>{
  const own={tabId:'a',roomId:'RTYBSJ',at:1};
  assert.equal(claimSupersedes({tabId:'b',roomId:'OTHER1',at:9},own),false);
  assert.equal(claimSupersedes({tabId:'a',roomId:'RTYBSJ',at:9},own),false);
  assert.equal(claimSupersedes(null,own),false);
});

test('a superseded admin tab stops writing and leaves the room',()=>{
  assert.match(main,/scorerTabChannel=!requestedAndroidRemote&&typeof BroadcastChannel==='function'\?new BroadcastChannel\(SCORER_TAB_CHANNEL\):null/);
  const leave=main.slice(main.indexOf('function leaveSupersededScorerTab'),main.indexOf('scorerTabChannel?.addEventListener'));
  assert.match(leave,/clearTimeout\(saveTimer\)/);
  assert.match(leave,/clearTimeout\(liveScoreSaveTimer\)/);
  assert.match(leave,/clearTimeout\(roomMatchFallbackTimer\)/);
  assert.match(leave,/sessionStorage\.setItem\(ROOM_SKIP_AUTO_ONCE,'1'\)/);
  assert.match(leave,/location\.replace\(location\.pathname\)/);
  assert.match(main,/if\(claimSupersedes\(event\.data,ownScorerTabClaim\)\)leaveSupersededScorerTab\(\);/);
  assert.match(main,/setLandingError\('此球局已在其他分頁開啟'\)/);
});

test('admin tabs claim scoring when they join, get promoted, log in or come to the front',()=>{
  assert.match(main,/applyRole\(\);\s*broadcastScorerTab\(\);\s*renderAndroidRemote\(\);\s*updatePushNotificationButton\(\);/);
  assert.match(main,/applyRole\(\);\s*broadcastScorerTab\(\);\s*renderAndroidRemote\(\);\s*if\(navigator\.onLine\)/);
  assert.match(main,/applyRole\(\);broadcastScorerTab\(\);renderAll\(\);alert\('已切換為管理員模式。'\)/);
  assert.match(main,/visibilitychange',\(\)=>\{if\(document\.visibilityState==='visible'\)broadcastScorerTab\(\)\}/);
});
