import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const activity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const service=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');

test('new score screens wait for the explicit official start timestamp',()=>{
  const startMatch=main.match(/function startMatch\(\)\{[\s\S]*?\nfunction finishMatch/)?.[0]||'';
  const startNext=main.match(/function startNext\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(startMatch,/startedAt:''/);
  assert.doesNotMatch(startMatch,/startedAt:new Date/);
  assert.match(startNext,/startedAt:''/);
  assert.doesNotMatch(startNext,/startedAt:new Date/);
  assert.match(main,/function markMatchOfficialStarted\(\)[\s\S]*?match\.startedAt=new Date\(\)\.toISOString\(\)[\s\S]*?saveLiveScoreSoon\(\);saveSoon\(\)/);
});

test('double press starts the match without changing the other press counts',()=>{
  assert.match(main,/scoreRemotePendingPress=null;markMatchOfficialStarted\(\);return/);
  assert.doesNotMatch(main,/scoreRemotePendingPress=null;toggleScoreFullscreen\(\)/);
  for(const source of [activity,service]){
    assert.match(source,/count==1[\s\S]*?count==2[\s\S]*?OfficialStart[\s\S]*?count==3[\s\S]*?UseShuttle[\s\S]*?count==4[\s\S]*?ReturnShuttle/);
  }
  assert.match(controller,/updates\.put\("officialStartCommand", command\)/);
  assert.doesNotMatch(controller,/updates\.put\(finished \? "undoFinishedCommand" : "fullscreenCommand"/);
});

test('official start is idempotent and scoring waits for it',()=>{
  assert.match(main,/if\(matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('本場已正式開始'/);
  assert.match(main,/if\(!matchHasOfficiallyStarted\(match\)\)\{showScoreRemoteIndicator\('請先連按兩下正式開始'/);
  assert.match(main,/function handleRemoteOfficialStartCommand[\s\S]*?return markMatchOfficialStarted\(\)/);
  assert.match(main,/function handleRemoteFullscreenCommand[\s\S]*?return markMatchOfficialStarted\(\)/);
});

test('official start indicator is emphasized and centered for everyone to see',()=>{
  assert.match(main,/showScoreRemoteIndicator\('比賽正式開始',\{duration:2600,icon:'✅',emphasis:'official'\}\)/);
  assert.match(styles,/\.score-remote-indicator\.official-start\{[^}]*top:50%;[^}]*left:50%;[^}]*transform:translate\(-50%,-50%\);[^}]*font-size:clamp\(2rem,7vw,5rem\)/);
});
