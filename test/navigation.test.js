import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const nav=html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/)?.[1]||'';

test('keeps exactly eight primary navigation tabs',()=>{
  assert.equal((nav.match(/class="tab/g)||[]).length,8);
});

test('phone layout keeps long tabs and poll controls inside narrow cards',()=>{
  assert.match(styles,/BCM 2\.4\.32 — keep dense phone layouts inside their cards/);
  assert.match(styles,/#app \.tab\[data-page="6"\]\{[\s\S]*?font-size:\.64rem/);
  assert.match(styles,/#app \.poll-deadline-controls\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/#app \.poll-deadline-controls \.btn\{[\s\S]*?white-space:nowrap/);
  assert.match(styles,/#app \.home-match-team\{[\s\S]*?white-space:normal/);
});

test('iPhone date and time controls stay inside poll cards',()=>{
  assert.match(styles,/BCM 2\.4\.33 — contain iOS native date controls inside poll cards/);
  assert.match(styles,/#app #page6 input:is\(\[type="date"\],\[type="time"\],\[type="datetime-local"\]\)\{[\s\S]*?max-inline-size:100%/);
  assert.match(styles,/-webkit-appearance:none/);
  assert.match(styles,/@supports\(-webkit-touch-callout:none\)\{[\s\S]*?width:-webkit-fill-available/);
  assert.match(styles,/::-webkit-date-and-time-value\{[\s\S]*?text-align:center/);
});

test('places the vote submit button after all poll choices',()=>{
  const votingPanel=html.match(/<div id="pollVotingPanel"[\s\S]*?<div id="confirmEventPanel"/)?.[0]||'';
  const voterIndex=votingPanel.indexOf('id="pollVoter"');
  const optionsIndex=votingPanel.indexOf('id="pollOptions"');
  const submitIndex=votingPanel.indexOf('id="submitVote"');
  assert.ok(voterIndex>=0&&optionsIndex>voterIndex&&submitIndex>optionsIndex);
  assert.match(styles,/\.poll-submit-row\{[^}]*justify-content:flex-end/);
  assert.match(styles,/@media\(max-width:700px\)\{\.poll-submit-row \.btn\{width:100%/);
});

test('groups independently selectable time slots under one date',()=>{
  assert.match(mainSource,/const groupedOptions=new Map\(\)/);
  assert.match(mainSource,/class="poll-date-group"/);
  assert.match(mainSource,/class="poll-time-options"/);
  assert.match(mainSource,/class="poll-option poll-time-option/);
  assert.match(styles,/\.poll-time-options\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/@media\(max-width:700px\)[^\n]*\.poll-time-options\{grid-template-columns:1fr\}/);
});

test('lets the admin edit participant count before confirming the next event',()=>{
  assert.match(html,/id="confirmParticipants"[^>]*type="number"[^>]*min="1"/);
  assert.match(mainSource,/participantCount=wholeAmount\(\$\('confirmParticipants'\)\?\.value\)/);
  assert.match(mainSource,/finalEvent=\{[^}]*participantCount,perPersonFee:finalFee/);
});

test('club announcements blend into the dashboard with a visible accent',()=>{
  assert.match(styles,/BCM 2\.4\.49 — unmistakable integrated club notice/);
  assert.match(styles,/#app \.admin-announcement\{[\s\S]*?border-left:6px solid #ffc84d[\s\S]*?rgba\(8,43,65,\.30\)/);
  assert.match(styles,/content:"CLUB NOTICE"/);
  assert.match(styles,/#app \.admin-announcement h3\{[\s\S]*?color:#ffdc82[\s\S]*?font-size:1\.27rem/);
});

test('keeps chat in primary navigation and removes backup from it',()=>{
  assert.match(nav,/data-page="8">聊天/);
  assert.doesNotMatch(nav,/data-page="7"/);
});

test('places chat second and marks court as hidden for viewers',()=>{
  const pages=[...nav.matchAll(/data-page="(\d+)"/g)].map(match=>match[1]);
  assert.deepEqual(pages.slice(0,2),['0','8']);
  assert.ok(pages.indexOf('4')<pages.indexOf('5'),'戰績 must appear before 紀錄');
  assert.match(nav,/class="tab viewer-hidden-tab" data-page="3">場上/);
});

test('removes the old score remote from More and provides a no-stats test mode',()=>{
  const moreMenu=html.match(/id="roomMoreMenu"[\s\S]*?<\/details>\s*<\/div>/)?.[0]||'';
  assert.doesNotMatch(moreMenu,/id="scoreRemoteBtn"/);
  assert.match(moreMenu,/id="testModeToggle"/);
  assert.match(html,/id="testModeBanner"/);
  assert.match(html,/id="scoreTestModeToggle"/);
  assert.doesNotMatch(mainSource,/confirm\(['"]開啟測試模式/);
  assert.match(mainSource,/\$\('scoreTestModeToggle'\)\.onclick=toggleTestMode/);
  assert.match(styles,/immersive-mode \.score-head \.score-actions>button:not\(#fullscreenScore\):not\(#undo\)/);
  assert.doesNotMatch(styles,/button:not\(#fullscreenScore\):not\(#undo\):not\(#scoreTestModeToggle\)/);
  assert.match(mainSource,/const isTestMatch=!!m\.testMode\|\|!!state\.testMode/);
  assert.match(mainSource,/if\(isTestMatch\)m\.testCompleted=true/);
  assert.match(mainSource,/else state\.history\.push/);
  assert.match(mainSource,/\.filter\(h=>!h\.testMode\)/);
  assert.match(mainSource,/if\(newlyRecorded&&isHost&&!isTestMatch\)/);
  assert.match(mainSource,/function scoredHistory\(\)\{return state\.history\.filter\(h=>!h\.testMode\)\}/);
  assert.match(mainSource,/state\.match\.testMode=enabling;\s*saveLiveScoreSoon\(\)/);
  assert.match(mainSource,/state\.match\?\.winner===null&&!!state\.match\?\.testMode/);
  assert.match(mainSource,/function currentTestModeEnabled\(\)\{[\s\S]*?!!state\.testMode\|\|!!state\.match\?\.active/);
  assert.match(mainSource,/const enabling=!currentTestModeEnabled\(\)/);
  assert.match(mainSource,/function selectablePlayerIds\(\)\{return currentTestModeEnabled\(\)\?state\.roster\.map\(p=>p\.id\):state\.attendance\}/);
  assert.match(mainSource,/if\(enabling&&!\(state\.match\.active&&state\.match\.winner===null\)\)\{[\s\S]*?renderAll\(\);page\(3\)/);
  assert.match(mainSource,/function options\(selected=''\).*selectablePlayerIds\(\)\.map/);
  assert.match(mainSource,/function renderWaiting\(\).*eligible=selectablePlayerIds\(\)/);
  assert.match(mainSource,/attendance:selectablePlayerIds\(\)/);
  assert.match(mainSource,/shuffle\(selectablePlayerIds\(\)\)\.slice\(0,4\)/);
});

test('keeps only the requested controls in normal score mode',()=>{
  const scoreActions=html.match(/<div class="score-actions">([\s\S]*?)<\/div>\s*<\/header>/)?.[1]||'';
  for(const id of ['randomThemeToggle','fullscreenScore','refreshApp','scoreTestModeToggle','undo','exitScore'])assert.match(scoreActions,new RegExp(`id="${id}"`));
  assert.match(scoreActions,/id="scoreTheme"/);
  for(const id of ['voiceToggle','speakerTest','scoreRemoteQuickBtn','audioHelp'])assert.doesNotMatch(scoreActions,new RegExp(`id="${id}"`));
});

test('removes the bottom server-selection bar from score mode',()=>{
  assert.match(styles,/\.score-view \.score-foot\s*\{display:none\}/);
});

test('provides a direct new event flow without changing the poll',()=>{
  assert.match(html,/id="directNewEventBtn"[^>]*>＋ 新增球局<\/button>/);
  const directFlow=mainSource.slice(mainSource.indexOf('function openDirectNextEventCreator()'),mainSource.indexOf('function closeNextEventEditor()'));
  assert.doesNotMatch(directFlow,/schedulePoll/);
  assert.match(mainSource,/投票內容未變更/);
});

test('keeps the Android remote session active after a match finishes so it can undo',()=>{
  assert.match(mainSource,/updateRemoteSession\?\.\(roomId,isHost,!!match\.active,/);
  assert.doesNotMatch(mainSource,/updateRemoteSession\?\.\(roomId,isHost,ready,/);
});

test('opens backup center from the more menu',()=>{
  assert.match(html,/id="backupCenterBtn"[^>]*>☁️ 備份中心<\/button>/);
});

test('opens admin shuttle tube management from the more menu',()=>{
  assert.match(html,/id="shuttleTubeManagerBtn"[^>]*host-only[^>]*>🏸 球桶管理<\/button>/);
  assert.match(html,/id="shuttleTubeModal"/);
});

test('separates fixed members and guest players while shuttle costs use session attendance',()=>{
  assert.match(html,/id="newPlayerType"[\s\S]*?<option value="member">固定團員<\/option>[\s\S]*?<option value="guest">臨打球友<\/option>/);
  assert.match(html,/id="membershipAdminSection" class="profile-panel host-only"/);
  assert.match(html,/id="editMemberType"/);
  assert.match(mainSource,/splitPlayersByMembership\(rows\)/);
  assert.match(mainSource,/function shuttleParticipantCount\(\)/);
  assert.match(mainSource,/購球者若參與也計入/);
  assert.match(mainSource,/「\$\{tube\.name\}」剩餘 \$\{tube\.remainingShuttles\} 顆/);
  assert.match(styles,/BCM 2\.4\.42 — fixed members and guest-player sections/);
});

test('shows refresh without a visible favorite control and keeps low-frequency actions collapsed',()=>{
  const favoriteIndex=html.indexOf('id="favoriteRoomBtn"'),refreshIndex=html.indexOf('id="refreshAppMenu"'),moreButtonIndex=html.indexOf('id="roomMoreBtn"'),moreIndex=html.indexOf('id="roomMoreMenu"'),advancedIndex=html.indexOf('id="roomMoreAdvanced"',moreIndex);
  const primary=html.match(/<div class="room-more-primary">([\s\S]*?)<\/div>\s*<\/div>/)?.[1]||'';
  assert.ok(favoriteIndex>=0&&refreshIndex>favoriteIndex&&moreButtonIndex>refreshIndex&&moreIndex>moreButtonIndex&&advancedIndex>moreIndex);
  assert.match(html,/id="favoriteRoomBtn" class="btn hidden"[^>]*aria-hidden="true"/);
  assert.match(html,/id="refreshAppMenu"[^>]*>↻ 重新整理<\/button>/);
  assert.doesNotMatch(primary,/id="refreshAppMenu"/);
  assert.ok((primary.match(/<button/g)||[]).length<=7);
  assert.match(html,/id="roomMoreAdvanced"[^>]*class="room-more-advanced"/);
  const settings=html.match(/<details id="roomSettings"[\s\S]*?<\/details>/)?.[0]||'',otherSettings=html.match(/<details id="roomMoreAdvanced"[\s\S]*?<\/details>/)?.[0]||'';
  assert.match(settings,/<summary>⚙️ 設定<\/summary>/);
  assert.match(settings,/id="shuttleTubeManagerBtn"/);
  assert.match(settings,/id="testModeToggle"/);
  assert.match(otherSettings,/<summary>⚙️ 其他設定<\/summary>/);
  assert.match(otherSettings,/id="leaveBtn"/);
  assert.doesNotMatch(primary,/id="leaveBtn"/);
});

test('chat identity is claimed and cannot be selected from a player list',()=>{
  assert.match(html,/id="chatIdentity"/);
  assert.match(html,/id="chatClaimHelp"/);
  assert.doesNotMatch(html,/id="chatPlayer"/);
});

test('chat supports image, GIF and short-video attachments',()=>{
  assert.match(html,/<label id="chatAttach"[^>]*>[\s\S]*id="chatMediaFile"[^>]*accept="[^"]*image\/gif[^"]*video\/mp4/);
  assert.match(html,/id="chatMediaPreview"/);
  assert.match(mainSource,/uploadChatMedia/);
  assert.doesNotMatch(mainSource,/\$\('chatAttach'\)\.onclick=.*chatMediaFile.*click/);
  assert.match(styles,/\.chat-media-file\{[\s\S]*position:absolute/);
});

test('chat renders optimistic messages before the network request completes',()=>{
  const optimisticIndex=mainSource.indexOf('chatMessages=[...chatMessages,optimisticMessage]');
  const requestIndex=mainSource.indexOf("pushApi('chat-mention'",optimisticIndex);
  assert.ok(optimisticIndex>=0&&requestIndex>optimisticIndex);
});

test('chat keeps its composer visible above mobile keyboards',()=>{
  assert.match(mainSource,/visualViewport\?\.\addEventListener\('resize',syncChatKeyboardViewport\)/);
  assert.match(styles,/html\.chat-keyboard-open \.chat-composer/);
  assert.match(styles,/--chat-keyboard-offset/);
});

test('chat preserves unchanged media elements between sync polls',()=>{
  assert.match(mainSource,/const nextMessagesRenderKey=currentChatMessagesRenderKey\(\),messagesChanged=/);
  assert.match(mainSource,/if\(messagesChanged\)list\.innerHTML=chatMessages\.map/);
  assert.match(mainSource,/messagesChanged&&wasNearBottom/);
});

test('chat always opens at the latest message',()=>{
  const pageFlow=mainSource.slice(mainSource.indexOf('function page(n)'),mainSource.indexOf('function renderRoster()'));
  assert.match(pageFlow,/if\(n===8\)\{[\s\S]*scrollChatToLatest\(\)/);
  assert.match(mainSource,/function scrollChatToLatest\(\)[\s\S]*list\.scrollTop=list\.scrollHeight/);
  assert.match(mainSource,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(scroll\)\)/);
  assert.match(mainSource,/addEventListener\('load',scroll,\{once:true\}\)/);
});

test('editing the next event updates the announcement without another push',()=>{
  const editFlow=mainSource.slice(mainSource.indexOf('async function saveNextEventEdits()'),mainSource.indexOf('async function confirmNextEvent()'));
  assert.match(html,/id="saveNextEventEdits"[^>]*>儲存公告<\/button>/);
  assert.match(editFlow,/publishedAt=creating\?new Date\(\)\.toISOString\(\):\(previous\?\.publishedAt\|\|new Date\(\)\.toISOString\(\)\)/);
  assert.match(editFlow,/creating\?await nextEventPushMessage\(publishedAt\):''/);
});

test('next-event venue fields stay separated and support reusable venue choices',()=>{
  assert.match(styles,/\.next-event-edit-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/\.next-event-edit-grid \.next-event-edit-date,[^}]*grid-column:1\/-1/);
  assert.doesNotMatch(html,/<datalist|list="favoriteVenueOptions"/);
  for(const id of ['pollVenueOptions','confirmVenueOptions','editVenueOptions'])assert.match(html,new RegExp(`id="${id}" class="venue-options hidden"`));
  assert.match(styles,/\.venue-options\{[^}]*position:absolute[^}]*top:calc\(100% \+ 6px\)[^}]*left:0[^}]*right:0/);
  assert.match(styles,/#app \.venue-options,body>\.modal \.venue-options\{[^}]*background:#071f33[^}]*color:#eefaff/);
  assert.match(styles,/#app \.venue-option,body>\.modal \.venue-option\{[^}]*background:#0b2b43[^}]*color:#eefaff!important/);
  assert.match(styles,/#app \.venue-option:hover,[^}]*background:#164e70[^}]*color:#fff6a8!important/);
  assert.match(styles,/\.location-field\{[^}]*overflow:visible!important/);
  assert.match(styles,/\.poll-flow-section:has\(\.venue-options:not\(\.hidden\)\)[^}]*z-index:100[^}]*overflow:visible/);
  assert.match(styles,/\.field:not\(\.location-field\),[\s\S]*?\.next-event-edit-grid \.field\{overflow:hidden\}/);
  assert.match(styles,/@media\(min-width:701px\) and \(max-width:1367px\)[\s\S]*?\.confirm-event-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[\s\S]*?\.confirm-event-grid \.location-field\{grid-column:1\/-1/);
  assert.match(styles,/#app #page6 :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),select,textarea\),#app \.next-event-editor :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),select,textarea\)\{[^}]*width:100%;min-width:0;max-width:100%;box-sizing:border-box/);
  assert.match(styles,/@media\(min-width:701px\) and \(max-width:1367px\)[\s\S]*?#app \.poll-deadline-controls\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);align-items:stretch\}[\s\S]*?#app \.poll-deadline-controls \.field\{grid-column:1\/-1;overflow:hidden\}/);
  assert.match(styles,/#app #page6 input:is\(\[type="date"\],\[type="time"\],\[type="datetime-local"\]\),[\s\S]*?inline-size:100%;min-inline-size:0;max-inline-size:100%/);
  assert.match(mainSource,/function saveFavoriteVenue\(inputId\)/);
  assert.match(mainSource,/function bindVenuePicker\(inputId,panelId\)/);
  assert.match(mainSource,/localStorage\.setItem\(FAVORITE_VENUES_KEY/);
  assert.match(mainSource,/queueDeviceProfileSave\(\);alert\(`已加入常用球館/);
  assert.match(mainSource,/mergedVenues=mergeFavoriteVenues\(mergedVenues,profile\.favoriteVenues\)/);
  assert.match(mainSource,/favoriteVenues:mergedVenues/);
  assert.match(mainSource,/applyCloudFavoriteVenues\(profile\.favoriteVenues\)/);
  assert.match(mainSource,/favoriteModifiedAt=Number\(r\.favoriteModifiedAt\)\|\|\(favorite\?modifiedAt:0\)/);
  assert.match(mainSource,/favoriteSource=room\.favoriteModifiedAt>=old\.favoriteModifiedAt\?room:old/);
  assert.match(mainSource,/favoritePatch=Object\.prototype\.hasOwnProperty\.call\(patch,'favorite'\)\?\{favoriteModifiedAt:now\}:\{\}/);
});

test('removes the next-match announcement button and explanatory feature notes',()=>{
  assert.doesNotMatch(html,/<button[^>]*id="announceBtn"/);
  for(const note of [
    '聊天或標記球友；被標記的人會收到手機通知。',
    '查看歷史比分與比賽影片回放。',
    '可直接新增球局，或建立候選日期讓大家投票。',
    '截止前一天自動提醒已開啟通知的球友',
    '完整保護球員、比賽、歷史、投票、公告與房間設定。',
    '新球桶會先保留為待使用；按下開始使用後，才追蹤球友是否上場。',
    '臨打球友保留完整球員資料與戰績，但不列入球桶購買名單。'
  ]) assert.ok(!html.includes(note),`still shows explanatory note: ${note}`);
  assert.match(styles,/#resultModal>\.modal-card>\.sub\{display:none\}/);
});
