import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const activity=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/MainActivity.java',import.meta.url),'utf8');
const service=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/RemoteKeyAccessibilityService.java',import.meta.url),'utf8');
const controller=readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/BackgroundScoreController.java',import.meta.url),'utf8');

test('shows one-shuttle controls in scoring and next-match result views plus dashboard summary',()=>{
  for(const id of ['homeShuttleSummary','scoreUseShuttle','resultUseShuttle'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(main,/function useOneShuttle\(/);
  assert.match(main,/sessionUsedShuttles:\(Number\(row\.sessionUsedShuttles\)\|\|0\)\+1/);
  assert.match(main,/setShuttleRemaining\(row,row\.remainingShuttles-1\)/);
  assert.match(main,/showScoreRemoteIndicator\(`已使用 1 顆球｜剩餘 \$\{updated\.remainingShuttles\} 顆`,\{duration:2000,icon:'🏸'\}\)/);
  assert.doesNotMatch(main,/if\(source==='remote'\)showScoreRemoteIndicator\(`已使用 1 顆/);
  assert.match(main,/每人 \$\{formatMoney\(share\)\} 元/);
  assert.doesNotMatch(html,/勝方兩人保留，候場隊首兩人上場/);
});

test('routes exactly three short presses to shuttle use with a quiet-window and cooldown guard',()=>{
  for(const source of [activity,service]){
    assert.match(source,/if\(count==1\).*Action\(resolved\);else if\(count==2\).*FullscreenCommand\(\);else if\(count==3\)/s);
    assert.match(source,/SHUTTLE_PRESS_COOLDOWN_MS = 2000L/);
    assert.match(source,/now-lastShuttleActionAt>=SHUTTLE_PRESS_COOLDOWN_MS/);
    assert.doesNotMatch(source,/pendingShortPressCount == 5/);
    assert.match(source,/action == VolumeKeyInterpreter\.Action\.UNDO/);
  }
  assert.match(activity,/bcmAndroidRemoteUseShuttle/);
  assert.match(service,/useOneShuttle/);
  assert.match(controller,/command\.put\("action","useShuttle"\)/);
  assert.match(main,/\['teamAPlus','teamBPlus','undo','useShuttle'\]/);
});
