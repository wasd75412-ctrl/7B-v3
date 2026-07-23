import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, onSnapshot, setDoc, serverTimestamp, runTransaction, collection, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import noSleepMedia from 'nosleep.js/src/media.js';
import appPackage from '../package.json';
import { calculatePerPersonFee, shouldShowNextEventAnnouncement } from './next-event.js';
import { shouldShowNotificationPrompt } from './notifications.js';
import { normalizeMatchReplayTitle, normalizeYouTubePlaylistUrl } from './youtube.js';
import { DEFAULT_SCORE_REMOTE_BINDINGS, VIRTUAL_REMOTE_CLICK_CODE, advanceRemotePressState, assignRemoteBinding, isEditableRemoteTarget, normalizeRemoteBindings, remoteActionForCode, remoteEventCode, shouldHandleRemoteInput } from './score-remote.js';
import { createLiveScoreData, decodeLiveMatch, liveMatchKey, shouldAnnounceSyncedLiveScore } from './live-score.js';
import { canAutoSyncPlayerIdentity } from './device-sync.js';
import { shouldRequestNativeWakeLock, shouldStartPersistentVideoWakeLock, wakeLockButtonIntent, wakeLockControlIsActive } from './wake-lock.js';
import { arrangeTeamsWithTeammateLimit, lineupExceedsTeammateLimit } from './team-rotation.js';
import { CHAT_MESSAGE_MAX_LENGTH, cleanChatText, normalizeChatMentionIds } from './chat.js';

const firebaseConfig={apiKey:'AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM',authDomain:'badminton-7a1c3.firebaseapp.com',projectId:'badminton-7a1c3',storageBucket:'badminton-7a1c3.firebasestorage.app',messagingSenderId:'883534015507',appId:'1:883534015507:web:a7f6fb318151b6d07563e6',measurementId:'G-C97B98H7YW'};
const fbApp=initializeApp(firebaseConfig);
const db=initializeFirestore(fbApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const BCM_VERSION=appPackage.version;
const brandFontRequest=document.fonts?Promise.all([
  document.fonts.load('400 1em "JasonHandwriting9"','7B 羽球社'),
  document.fonts.load('400 1em "BCMBrandYu"','羽')
]).then(results=>results.every(faces=>faces.length>0)).catch(()=>false):Promise.resolve(false);
const brandFontGate=Promise.race([brandFontRequest,wait(2500).then(()=>false)]);
brandFontGate.then(loaded=>document.documentElement.classList.add(loaded?'brand-font-ready':'brand-font-fallback'));
Promise.all([brandFontGate,wait(900)]).then(()=>document.getElementById('splash')?.classList.add('hide'));
const $=id=>document.getElementById(id), all=q=>[...document.querySelectorAll(q)];
document.title=`7B 羽球社 ${BCM_VERSION}`;
all('[data-bcm-version]').forEach(element=>{element.textContent=BCM_VERSION});
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const randomCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let x='';crypto.getRandomValues(new Uint32Array(6)).forEach(n=>x+=chars[n%chars.length]);return x};
const randomToken=()=>crypto.randomUUID?.()||([...crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(36)).join(''));
const shuffle=a=>{a=[...a];const r=new Uint32Array(Math.max(1,a.length));crypto.getRandomValues(r);for(let i=a.length-1;i>0;i--){const j=r[i]% (i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
function teammateSafeLineup(ids,{randomize=false}={}){const values=ids.filter(Boolean);if(values.length!==4||new Set(values).size!==4)return values;if(!randomize&&!lineupExceedsTeammateLimit(values,state.history))return values;const random=crypto.getRandomValues(new Uint32Array(1))[0];return arrangeTeamsWithTeammateLimit(shuffle(values),state.history,random)}
function wholeAmount(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n):0}
function normalizeAdminNotices(source){
  const rows=Array.isArray(source?.adminNotices)?source.adminNotices:(source?.adminNotice?.body?[source.adminNotice]:[]);
  const seen=new Set();
  return rows.filter(notice=>notice&&String(notice.body||'').trim()).map((notice,index)=>{
    const publishedAt=notice.publishedAt||'';
    const fallbackId=`notice_${String(publishedAt||index).replace(/[^a-zA-Z0-9]/g,'').slice(-28)||index}`;
    return{id:String(notice.id||fallbackId),title:String(notice.title||'事務通知').trim().slice(0,40)||'事務通知',body:String(notice.body||'').trim().slice(0,500),publishedAt};
  }).filter(notice=>{if(seen.has(notice.id))return false;seen.add(notice.id);return true}).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,20);
}
function setAdminNotices(rows){state.adminNotices=normalizeAdminNotices({adminNotices:rows});state.adminNotice=state.adminNotices[0]||null}
const initialState=()=>({version:9.5,roster:[],attendance:[],court:[],waitingQueue:[],queueDraftChosen:[],priority:null,match:{active:false,players:[[],[]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null,startedAt:''},rules:{target:11,cap:15,deuce:true},history:[],matchReplayPlaylistTitle:'',matchReplayPlaylistUrl:'',nextCall:null,schedulePoll:{status:'open',createdAt:'',deadlineAt:'',options:[],votes:{},voterPlayers:{}},nextEvent:null,adminNotice:null,adminNotices:[],updatedAt:null});
const DEVICE_SYNC_CODE_KEY='bcmDeviceSyncCodeV1',DEVICE_SYNC_TOKEN_KEY='bcmDeviceSyncTokenV1',DEVICE_SYNC_NAME_KEY='bcmDeviceSyncNameV1',DEVICE_SYNC_PLAYER_KEY='bcmDeviceSyncPlayerV1';
let state=initialState(), roomId='', roomRef=null, liveScoreRef=null, chatCollectionRef=null, isHost=false, hostToken='', adminPinHash='', unsubscribe=null, liveScoreUnsubscribe=null, chatUnsubscribe=null, applying=false, saveTimer=null, liveScoreSaveTimer=null, editId=null;const expandedPlayerNotes=new Set();let profileOriginal=null,profileDirty={name:false,voiceName:false,racket:false,racketTension:false,racketString:false,backupRacket:false,backupTension:false,backupString:false,note:false};let voiceEnabled=localStorage.getItem('bdV76Voice')!=='0';let dismissedResultKey='';const selfToken=localStorage.getItem(DEVICE_SYNC_TOKEN_KEY)||localStorage.getItem('bdV73SelfToken')||randomToken();localStorage.setItem('bdV73SelfToken',selfToken);let selfHash='';
let deviceProfileUnsubscribe=null,deviceProfileApplying=false,deviceProfileSaveTimer=null,identitySyncing=false,roomConnectInProgress=false;
let roomSnapshotFromCache=false,snapshotHasPendingWrites=false,pendingRoomWrites=0,roomWriteScheduled=false;
let liveScoreSnapshotFromCache=false,liveScoreHasPendingWrites=false,pendingLiveScoreWrites=0,liveScoreWriteScheduled=false,liveScoreConnecting=false,liveScoreAvailable=true,liveScoreReady=false,liveScoreInitialSnapshot=true,liveScoreMigrationStarted=false,latestLiveMatch=null,lastRoomSnapshotData=null;
let chatMessages=[],chatMentionIds=new Set(),chatFirstRender=true,chatLastSentAt=0,chatRequestRunning=false;
const requestParams=new URLSearchParams(location.search),requestedPage=requestParams.get('page'),requestedAndroidRemote=requestParams.get('androidRemote')==='1';
if(requestedAndroidRemote){
  document.documentElement.classList.add('android-remote-mode');
  document.title=`7B 比分遙控器 ${BCM_VERSION}`;
  $('landingTitle').textContent='7B 比分遙控器';
  $('landingProduct').innerHTML=`Android 快門接收器 · BCM <span data-bcm-version>${esc(BCM_VERSION)}</span>`;
  $('landingDescription').textContent='輸入 iPad 正在使用的球局房號，讓藍牙快門控制比分。';
  $('landingJoinDivider').textContent='連接目前球局';
  $('joinRoom').textContent='連接球局';
}
const SCORE_REMOTE_ENABLED_KEY='bcmScoreRemoteEnabledV1',SCORE_REMOTE_BINDINGS_KEY='bcmScoreRemoteBindingsV1';
const SCORE_REMOTE_ACTION_LABELS={teamAPlus:'A隊 ＋1',teamBPlus:'B隊 ＋1',undo:'撤銷上一分',teamAMinus:'A隊 −1',teamBMinus:'B隊 −1'};
const SCORE_REMOTE_BINDING_IDS={teamAPlus:'remoteBindingTeamAPlus',teamBPlus:'remoteBindingTeamBPlus',undo:'remoteBindingUndo',teamAMinus:'remoteBindingTeamAMinus',teamBMinus:'remoteBindingTeamBMinus'};
let scoreRemoteEnabled=localStorage.getItem(SCORE_REMOTE_ENABLED_KEY)==='1',scoreRemoteBindings=loadScoreRemoteBindings(),scoreRemoteLearningAction='',scoreRemoteLastInputAt=0,scoreRemoteIndicatorTimer=null,scoreRemoteLearningTimer=null,scoreRemoteStatusMessage='',scoreRemoteStatusKind='',scoreRemotePressedCodes=new Set();

function loadScoreRemoteBindings(){
  try{return normalizeRemoteBindings(JSON.parse(localStorage.getItem(SCORE_REMOTE_BINDINGS_KEY)||'{}'))}catch{return normalizeRemoteBindings()}
}
function saveScoreRemoteBindings(){localStorage.setItem(SCORE_REMOTE_BINDINGS_KEY,JSON.stringify(scoreRemoteBindings))}
function scoreRemoteKeyLabel(code){return({ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',PageUp:'Page Up',PageDown:'Page Down',Space:'空白鍵',Enter:'Enter',Escape:'Esc',Backspace:'Backspace',[VIRTUAL_REMOTE_CLICK_CODE]:'遙控點擊'}[code]||String(code||'尚未設定').replace(/^Key/,'').replace(/^Digit/,''))}
function updateScoreRemoteUi(){
  const status=$('scoreRemoteStatus'),toggle=$('scoreRemoteToggle'),menuButton=$('scoreRemoteBtn'),quickButton=$('scoreRemoteQuickBtn');
  const pressed=scoreRemoteEnabled?'true':'false';
  [menuButton,quickButton,toggle].forEach(button=>button?.setAttribute('aria-pressed',pressed));
  if(menuButton)menuButton.textContent=scoreRemoteEnabled?'🎮 遙控器已開啟':'🎮 比分遙控器';
  if(toggle){toggle.textContent=scoreRemoteEnabled?'關閉':'開啟';toggle.classList.toggle('primary',!scoreRemoteEnabled);toggle.classList.toggle('score-remote-on',scoreRemoteEnabled)}
  if(status)status.textContent=scoreRemoteLearningAction?`請按下「${SCORE_REMOTE_ACTION_LABELS[scoreRemoteLearningAction]}」要使用的遙控器按鍵…`:scoreRemoteStatusMessage||(scoreRemoteEnabled?'已開啟，等待遙控器按鍵':'目前未啟用');
  status?.closest('.score-remote-enable')?.classList.toggle('detection-error',scoreRemoteStatusKind==='error');
  for(const [action,id] of Object.entries(SCORE_REMOTE_BINDING_IDS)){const element=$(id);if(element)element.textContent=scoreRemoteKeyLabel(scoreRemoteBindings[action])}
  all('[data-remote-learn]').forEach(button=>{const learning=button.dataset.remoteLearn===scoreRemoteLearningAction;button.classList.toggle('learning',learning);button.textContent=learning?'等待按鍵…':'學習按鍵'});
}
function clearScoreRemoteLearningTimer(){clearTimeout(scoreRemoteLearningTimer);scoreRemoteLearningTimer=null}
function openScoreRemoteSettings(){clearScoreRemoteLearningTimer();scoreRemoteStatusMessage='';scoreRemoteStatusKind='';scoreRemoteLearningAction='';updateScoreRemoteUi();$('scoreRemoteModal').classList.remove('hidden')}
function closeScoreRemoteSettings(){clearScoreRemoteLearningTimer();scoreRemoteLearningAction='';$('scoreRemoteModal').classList.add('hidden');updateScoreRemoteUi()}
function startScoreRemoteLearning(action){
  clearScoreRemoteLearningTimer();scoreRemoteLearningAction=action;scoreRemoteStatusMessage='';scoreRemoteStatusKind='';updateScoreRemoteUi();
  scoreRemoteLearningTimer=setTimeout(()=>{if(scoreRemoteLearningAction!==action)return;scoreRemoteLearningAction='';scoreRemoteStatusKind='error';scoreRemoteStatusMessage='沒有收到按鍵訊號。請確認已先在 iPad 藍牙設定完成配對；音量／快門型遙控器無法傳給網頁。';updateScoreRemoteUi()},7000);
}
function completeScoreRemoteLearning(action,code,event){
  event?.preventDefault();event?.stopPropagation();clearScoreRemoteLearningTimer();
  scoreRemoteBindings=assignRemoteBinding(scoreRemoteBindings,action,code);saveScoreRemoteBindings();scoreRemoteLearningAction='';scoreRemoteLastInputAt=performance.now();scoreRemoteStatusKind='';scoreRemoteStatusMessage=`已設定「${SCORE_REMOTE_ACTION_LABELS[action]}」為 ${scoreRemoteKeyLabel(code)}`;updateScoreRemoteUi();
}
function showScoreRemoteIndicator(message){
  const indicator=$('scoreRemoteIndicator');if(!indicator)return;
  clearTimeout(scoreRemoteIndicatorTimer);indicator.textContent=`🎮 ${message}`;indicator.classList.remove('hidden');
  scoreRemoteIndicatorTimer=setTimeout(()=>indicator.classList.add('hidden'),900);
}
function performScoreRemoteAction(action,{announce=true}={}){
  const match=state.match;
  if(action==='teamAPlus'||action==='teamBPlus'){
    match.rallies.push(action==='teamAPlus'?0:1);replay();if(announce&&voiceEnabled)setTimeout(announceScore,80);return true;
  }
  if(action==='undo'){
    if(!match.rallies.length)return false;match.rallies.pop();replay();return true;
  }
  const team=action==='teamAMinus'?0:action==='teamBMinus'?1:-1,index=match.rallies.lastIndexOf(team);
  if(index<0)return false;match.rallies.splice(index,1);replay();return true;
}
let androidRemoteFeedbackTimer=null,scoreSnapshotReady=false;
function hasAndroidRemoteKeyAccessBridge(){
  return requestedAndroidRemote&&typeof window.BcmAndroid?.isRemoteKeyAccessEnabled==='function';
}
function isAndroidRemoteKeyAccessEnabled(){
  if(!hasAndroidRemoteKeyAccessBridge())return true;
  try{return Boolean(window.BcmAndroid.isRemoteKeyAccessEnabled())}catch{return false}
}
function hasAndroidRecordingModeBridge(){
  return requestedAndroidRemote&&typeof window.BcmAndroid?.isRecordingModeEnabled==='function';
}
function isAndroidRecordingModeEnabled(){
  if(!hasAndroidRecordingModeBridge())return false;
  try{return Boolean(window.BcmAndroid.isRecordingModeEnabled())}catch{return false}
}
function setAndroidRemoteFeedback(message,kind=''){
  const feedback=$('androidRemoteFeedback');if(!feedback)return;
  clearTimeout(androidRemoteFeedbackTimer);feedback.textContent=message;feedback.className=`android-remote-feedback ${kind}`.trim();
  androidRemoteFeedbackTimer=setTimeout(()=>{feedback.textContent='等待快門遙控器按鍵';feedback.className='android-remote-feedback'},1800);
}
function renderAndroidRemote(){
  const view=$('androidRemoteView');if(!view)return;
  if(!requestedAndroidRemote||!roomId){view.classList.add('hidden');return}
  $('landing').classList.add('hidden');$('app').classList.add('hidden');$('scoreView').classList.add('hidden');view.classList.remove('hidden');
  const match=state.match,ready=isHost&&match.active&&match.winner===null;
  try{window.BcmAndroid?.updateRemoteSession?.(roomId,isHost,ready,Math.max(1,Number(state.rules?.target)||11),Math.max(1,Number(state.rules?.cap)||15),!!state.rules?.deuce)}catch{}
  const hasKeyAccessBridge=hasAndroidRemoteKeyAccessBridge(),keyAccessEnabled=isAndroidRemoteKeyAccessEnabled();
  const hasRecordingBridge=hasAndroidRecordingModeBridge(),recordingModeEnabled=isAndroidRecordingModeEnabled();
  $('androidRemoteRoom').textContent=roomId;
  $('androidRemoteConnection').textContent=!navigator.onLine?'離線中':hasKeyAccessBridge&&!keyAccessEnabled?'待開啟按鍵權限':'已連線';
  $('androidRemoteConnection').classList.toggle('offline',!navigator.onLine);
  $('androidRemoteConnection').classList.toggle('pending',navigator.onLine&&hasKeyAccessBridge&&!keyAccessEnabled);
  $('androidRemoteKeyAccess').classList.toggle('hidden',!hasKeyAccessBridge||keyAccessEnabled);
  $('androidRemoteRecording').classList.toggle('hidden',!hasRecordingBridge);
  $('androidRemoteRecording').classList.toggle('active',recordingModeEnabled);
  $('androidRemoteRecordingToggle').textContent=recordingModeEnabled?'關閉錄影計分':'開啟錄影計分';
  $('androidRemoteRecordingToggle').classList.toggle('recording-on',recordingModeEnabled);
  $('androidRemoteRecordingToggle').setAttribute('aria-pressed',recordingModeEnabled?'true':'false');
  $('androidRemoteRecordingToggle').disabled=!keyAccessEnabled||!isHost;
  $('androidRemoteOpenCamera').disabled=!keyAccessEnabled||!isHost;
  $('androidRemoteRecordingHint').textContent=!keyAccessEnabled?'請先開啟按鍵存取權限。':!isHost?'請先完成管理員登入。':recordingModeEnabled?'錄影計分已開啟；切到相機後遙控器仍會控制比分。':'按「開啟相機錄影」後會先連接即時比分，再切到相機。';
  $('androidRemotePermission').classList.toggle('hidden',isHost);
  $('androidRemoteIdle').classList.toggle('hidden',isHost&&match.active&&match.winner===null);
  $('androidRemoteIdle').querySelector('strong').textContent=!isHost?'🔒 尚未取得管理員權限':match.winner!==null?'🏁 本場比賽結束':'🏸 等待比賽開始';
  $('androidRemoteIdle').querySelector('span').textContent=!isHost?'請點上方按鈕輸入管理員 PIN。':match.winner!==null?'請在 iPad 安排並開始下一場。':'請先在 iPad 安排球員並開始比賽。';
  $('androidRemoteMatch').classList.toggle('hidden',!isHost||!match.active);
  $('androidRemoteScoreA').textContent=match.scores?.[0]??0;$('androidRemoteScoreB').textContent=match.scores?.[1]??0;
  $('androidRemoteNamesA').textContent=(match.players?.[0]||[]).map(pname).join('／')||'—';$('androidRemoteNamesB').textContent=(match.players?.[1]||[]).map(pname).join('／')||'—';
  $('androidRemoteAPlus').disabled=!ready;$('androidRemoteBPlus').disabled=!ready;$('androidRemoteUndo').disabled=!ready||!match.rallies.length;
}
function handleAndroidRemoteAction(action){
  if(!requestedAndroidRemote)return false;
  if(!isHost){setAndroidRemoteFeedback('請先完成管理員登入','error');return false}
  if(!state.match.active){setAndroidRemoteFeedback('iPad 尚未開始比賽','error');return false}
  if(state.match.winner!==null){setAndroidRemoteFeedback('本場已結束，請等待下一場','error');return false}
  const changed=performScoreRemoteAction(action,{announce:false});
  if(!changed){setAndroidRemoteFeedback(action==='undo'?'目前沒有可撤銷的分數':'操作未完成','error');return false}
  setAndroidRemoteFeedback(action==='teamAPlus'?'A隊 ＋1':action==='teamBPlus'?'B隊 ＋1':'已撤銷上一分','success');renderAndroidRemote();return true;
}
window.bcmAndroidRemoteInput=action=>handleAndroidRemoteAction(String(action||''));
window.bcmAndroidKeyAccessChanged=()=>{renderAndroidRemote();return true};
window.bcmAndroidRecordingModeChanged=()=>{renderAndroidRemote();return true};
window.bcmAndroidRemoteKeyDetected=label=>{
  if(!requestedAndroidRemote)return false;
  setAndroidRemoteFeedback(`已收到 ${String(label||'遙控器按鍵')}，處理中…`,'detected');
  return true;
};
function handleScoreRemoteCode(event,code){
  if(scoreRemoteLearningAction){
    if(!code||['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(code))return;
    if(code==='Escape'){event.preventDefault();clearScoreRemoteLearningTimer();scoreRemoteLearningAction='';scoreRemoteStatusMessage='已取消按鍵學習';updateScoreRemoteUi();return}
    const action=scoreRemoteLearningAction;
    completeScoreRemoteLearning(action,code,event);return;
  }
  const action=remoteActionForCode(scoreRemoteBindings,code);
  if(!action||!shouldHandleRemoteInput({enabled:scoreRemoteEnabled,isHost,scoreVisible:!$('scoreView').classList.contains('hidden'),matchActive:state.match.active,matchFinished:state.match.winner!==null,repeat:event.repeat,editable:isEditableRemoteTarget(event.target)}))return;
  const now=performance.now();if(now-scoreRemoteLastInputAt<280)return;scoreRemoteLastInputAt=now;
  event.preventDefault();
  if(performScoreRemoteAction(action)){scoreRemoteStatusMessage=`收到：${SCORE_REMOTE_ACTION_LABELS[action]}`;showScoreRemoteIndicator(SCORE_REMOTE_ACTION_LABELS[action]);updateScoreRemoteUi()}
}
function handleScoreRemoteKeyboard(event){
  const code=remoteEventCode(event),phase=event.type;
  const decision=advanceRemotePressState(scoreRemotePressedCodes,code,phase,event.repeat);scoreRemotePressedCodes=decision.pressedCodes;
  if(phase==='keypress'&&code)setTimeout(()=>scoreRemotePressedCodes.delete(code),650);
  if(decision.shouldHandle)handleScoreRemoteCode(event,code);
}
function handleScoreRemoteVirtualClick(event){
  if(event.detail!==0)return;
  if(scoreRemoteLearningAction){completeScoreRemoteLearning(scoreRemoteLearningAction,VIRTUAL_REMOTE_CLICK_CODE,event);return}
  handleScoreRemoteCode(event,VIRTUAL_REMOTE_CLICK_CODE);
}

async function sha256(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function withoutLegacyGender(playerRecord={}){const {gender:_removedGender,...record}=playerRecord;return record}
function encodeState(src){
  const m=src.match||{};
  const notices=normalizeAdminNotices(src);
  return {
    version:9.5,
    roster:Array.isArray(src.roster)?src.roster.map(withoutLegacyGender):[],
    attendance:Array.isArray(src.attendance)?src.attendance:[],
    court:Array.isArray(src.court)?src.court:[],
    waitingQueue:Array.isArray(src.waitingQueue)?src.waitingQueue:[],
    queueDraftChosen:Array.isArray(src.queueDraftChosen)?src.queueDraftChosen:[],
    priority:src.priority||null,
    match:{
      active:!!m.active,
      teamA:Array.isArray(m.players?.[0])?m.players[0]:[],
      teamB:Array.isArray(m.players?.[1])?m.players[1]:[],
      scores:Array.isArray(m.scores)?m.scores:[0,0],
      rallies:Array.isArray(m.rallies)?m.rallies:[],
      serving:Number.isInteger(m.serving)?m.serving:0,
      posA:Array.isArray(m.positions?.[0])?m.positions[0]:[0,1],
      posB:Array.isArray(m.positions?.[1])?m.positions[1]:[0,1],
      winner:m.winner===0||m.winner===1?m.winner:null,
      matchId:m.matchId||null,
      startedAt:m.startedAt||''
    },
    rules:{...src.rules},
    matchReplayPlaylistTitle:normalizeMatchReplayTitle(src.matchReplayPlaylistTitle),
    matchReplayPlaylistUrl:normalizeYouTubePlaylistUrl(src.matchReplayPlaylistUrl),
    nextCall:src.nextCall&&Array.isArray(src.nextCall.players)?{
      players:src.nextCall.players.filter(Boolean).slice(0,4),
      createdAt:src.nextCall.createdAt||''
    }:null,
    schedulePoll:{
      status:src.schedulePoll?.status==='closed'?'closed':'open',
      createdAt:src.schedulePoll?.createdAt||'',
      deadlineAt:src.schedulePoll?.deadlineAt||'',
      options:(Array.isArray(src.schedulePoll?.options)?src.schedulePoll.options:[]).map(o=>({id:o.id||randomToken(),date:o.date||'',time:o.time||'',endTime:o.endTime||'',note:o.note||''})),
      votes:src.schedulePoll?.votes&&typeof src.schedulePoll.votes==='object'?src.schedulePoll.votes:{},
      voterPlayers:src.schedulePoll?.voterPlayers&&typeof src.schedulePoll.voterPlayers==='object'?src.schedulePoll.voterPlayers:{}
    },
    nextEvent:src.nextEvent?{optionId:src.nextEvent.optionId||'',date:src.nextEvent.date||'',time:src.nextEvent.time||'',endTime:src.nextEvent.endTime||'',location:src.nextEvent.location||'',note:src.nextEvent.note||'',rentalTotal:wholeAmount(src.nextEvent.rentalTotal),participantCount:wholeAmount(src.nextEvent.participantCount),perPersonFee:wholeAmount(src.nextEvent.perPersonFee),publishedAt:src.nextEvent.publishedAt||''}:null,
    adminNotice:notices[0]||null,
    adminNotices:notices,
    history:(Array.isArray(src.history)?src.history:[]).map(h=>({
      matchId:h.matchId||randomToken(),
      time:h.time||'',
      teamA1:h.teams?.[0]?.[0]||'',
      teamA2:h.teams?.[0]?.[1]||'',
      teamB1:h.teams?.[1]?.[0]||'',
      teamB2:h.teams?.[1]?.[1]||'',
      scoreA:h.scores?.[0]??0,
      scoreB:h.scores?.[1]??0,
      winner:h.winner===0||h.winner===1?h.winner:null,
      endedAt:h.endedAt||'',
      dateKey:h.dateKey||'',
      monthKey:h.monthKey||''
    }))
  }
}

const DEFAULT_VOICE_NAMES={'緁':'潔','Yoyo':'優又','建昱':'見育','郁荏':'玉刃'};
function defaultVoiceName(name){return DEFAULT_VOICE_NAMES[String(name||'')]||''}
function decodeState(d){
  const base=initialState(), m=d.match||{};
  const history=Array.isArray(d.history)?d.history.map(h=>{
    if(Array.isArray(h.teams)) return h;
    return {
      matchId:h.matchId||randomToken(),
      time:h.time||'',
      teams:[[h.teamA1||'',h.teamA2||''].filter(Boolean),[h.teamB1||'',h.teamB2||''].filter(Boolean)],
      scores:[h.scoreA??0,h.scoreB??0],
      winner:h.winner===0||h.winner===1?h.winner:null,
      endedAt:h.endedAt||'',
      dateKey:h.dateKey||'',
      monthKey:h.monthKey||''
    }
  }):[];
  return {
    ...base,...d,
    rules:{...base.rules,...(d.rules||{})},
    match:{
      ...base.match,...m,
      players:Array.isArray(m.players)?m.players:[Array.isArray(m.teamA)?m.teamA:[],Array.isArray(m.teamB)?m.teamB:[]],
      positions:Array.isArray(m.positions)?m.positions:[Array.isArray(m.posA)?m.posA:[0,1],Array.isArray(m.posB)?m.posB:[0,1]]
    },
    roster:Array.isArray(d.roster)?d.roster.map(p=>({...withoutLegacyGender(p),voiceName:p.voiceName||defaultVoiceName(p.name),backupRacket:p.backupRacket||'',racketTension:p.racketTension||'',racketString:p.racketString||'',backupTension:p.backupTension||'',backupString:p.backupString||'',favorite:!!p.favorite})):[],
    attendance:Array.isArray(d.attendance)?d.attendance:[],
    court:Array.isArray(d.court)?d.court:[],
    waitingQueue:Array.isArray(d.waitingQueue)?d.waitingQueue:[],
    queueDraftChosen:Array.isArray(d.queueDraftChosen)?d.queueDraftChosen:[],
    matchReplayPlaylistTitle:normalizeMatchReplayTitle(d.matchReplayPlaylistTitle),
    matchReplayPlaylistUrl:normalizeYouTubePlaylistUrl(d.matchReplayPlaylistUrl),
    nextCall:d.nextCall&&Array.isArray(d.nextCall.players)?{
      players:d.nextCall.players.filter(Boolean).slice(0,4),
      createdAt:d.nextCall.createdAt||''
    }:null,
    schedulePoll:{
      status:d.schedulePoll?.status==='closed'?'closed':'open',
      createdAt:d.schedulePoll?.createdAt||'',
      deadlineAt:d.schedulePoll?.deadlineAt||'',
      options:Array.isArray(d.schedulePoll?.options)?d.schedulePoll.options:[],
      votes:d.schedulePoll?.votes&&typeof d.schedulePoll.votes==='object'?d.schedulePoll.votes:{},
      voterPlayers:d.schedulePoll?.voterPlayers&&typeof d.schedulePoll.voterPlayers==='object'?d.schedulePoll.voterPlayers:{}
    },
    nextEvent:d.nextEvent&&typeof d.nextEvent==='object'?{...d.nextEvent,rentalTotal:wholeAmount(d.nextEvent.rentalTotal),participantCount:wholeAmount(d.nextEvent.participantCount),perPersonFee:wholeAmount(d.nextEvent.perPersonFee)}:null,
    adminNotice:normalizeAdminNotices(d)[0]||null,
    adminNotices:normalizeAdminNotices(d),
    history
  }
}


function player(id){return state.roster.find(p=>p.id===id)}function pname(id){return player(id)?.name||'未知球員'}function vname(id){const p=player(id);return p?.voiceName?.trim()||defaultVoiceName(p?.name)||p?.name||'未知球員'}function initials(n){return [...String(n||'?')].slice(0,2).join('').toUpperCase()}function avatar(id,size=''){const p=player(id);return `<span class="avatar ${size}">${p?.avatar?`<img src="${p.avatar}" alt="">`:esc(initials(p?.name))}</span>`}function playerStats(id){let games=0,wins=0;for(const h of state.history){const teams=h.teams||[];for(let t=0;t<2;t++){if((teams[t]||[]).includes(id)){games++;if(h.winner===t)wins++}}}return{games,wins,losses:games-wins,rate:games?Math.round(wins/games*100):0}}
function localDateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}function localMonthKey(d=new Date()){return localDateKey(d).slice(0,7)}
function historyDate(h){if(/^\d{4}-\d{2}-\d{2}$/.test(h.dateKey||''))return h.dateKey;if(h.endedAt){const d=new Date(h.endedAt);if(!isNaN(d.getTime()))return localDateKey(d)}const text=String(h.time||'');const m=text.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;const d=new Date(text);return isNaN(d.getTime())?'':localDateKey(d)}
function scopedStats(id,scope='career',month=localMonthKey()){let games=0,wins=0;const list=[];for(const h of state.history){const dk=historyDate(h);if(scope==='today'&&dk!==localDateKey())continue;if(scope==='month'&&!dk.startsWith(month))continue;for(let t=0;t<2;t++){if((h.teams?.[t]||[]).includes(id)){games++;if(h.winner===t)wins++;list.push({h,won:h.winner===t})}}}let streak=0,kind='';for(const x of list.slice().reverse()){const k=x.won?'W':'L';if(!kind)kind=k;if(k!==kind)break;streak++}return{games,wins,losses:games-wins,rate:games?Math.round(wins/games*100):0,streak,kind,list}}
function relationshipStats(id){const partners=new Map(),opponents=new Map();for(const h of state.history){const teams=h.teams||[];let team=-1;for(let t=0;t<2;t++)if((teams[t]||[]).includes(id)){team=t;break}if(team<0)continue;for(const pid of teams[team]||[]){if(pid===id)continue;const x=partners.get(pid)||{id:pid,games:0,wins:0};x.games++;if(h.winner===team)x.wins++;partners.set(pid,x)}for(const oid of teams[1-team]||[]){const x=opponents.get(oid)||{id:oid,games:0,wins:0};x.games++;if(h.winner===team)x.wins++;opponents.set(oid,x)}}const finish=m=>[...m.values()].map(x=>({...x,rate:x.games?Math.round(x.wins/x.games*100):0}));return{partners:finish(partners).sort((a,b)=>b.rate-a.rate||b.games-a.games||pname(a.id).localeCompare(pname(b.id))),opponents:finish(opponents).sort((a,b)=>b.games-a.games||b.rate-a.rate)}}
function playerStatus(id){const td=scopedStats(id,'today');if(!td.games)return{label:'🌱 今日尚未出賽',kind:'idle'};if(td.kind==='W'&&td.streak>=3)return{label:`🔥 火燙 · ${td.streak} 連勝`,kind:'hot'};if(td.kind==='L'&&td.streak>=3)return{label:`🧊 調整中 · ${td.streak} 連敗`,kind:'cold'};if(td.wins===td.games)return{label:`✨ 今日全勝 · ${td.wins} 勝`,kind:'hot'};return{label:`🏸 今日 ${td.wins} 勝 ${td.losses} 敗`,kind:'normal'}}
function careerBadges(id){const c=scopedStats(id,'career'),td=scopedStats(id,'today');const defs=[['🏸','初登場',c.games>=1],['🥉','10 場',c.games>=10],['🥈','50 場',c.games>=50],['🥇','100 場',c.games>=100],['🏆','10 勝',c.wins>=10],['💯','50 勝',c.wins>=50],['👑','100 勝',c.wins>=100],['🔥','3 連勝',td.kind==='W'&&td.streak>=3],['⚡','5 連勝',td.kind==='W'&&td.streak>=5],['🌟','10 連勝',td.kind==='W'&&td.streak>=10]];return defs}
function relationRows(list,emptyText){if(!list.length)return `<div class="sub">${emptyText}</div>`;return list.slice(0,3).map((x,i)=>`<div class="duo-row"><span class="duo-rank">${i+1}</span><span>${avatar(x.id,'tiny')} <strong>${esc(pname(x.id))}</strong><div class="duo-meta">共同 ${x.games} 場 · ${x.wins} 勝</div></span><strong>${x.rate}%</strong></div>`).join('')}
function todayLeaders(){const rows=state.roster.map(p=>({p,s:scopedStats(p.id,'today')})).filter(x=>x.s.games);const hot=rows.filter(x=>x.s.kind==='W').sort((a,b)=>b.s.streak-a.s.streak||b.s.wins-a.s.wins)[0];const cold=rows.filter(x=>x.s.kind==='L').sort((a,b)=>b.s.streak-a.s.streak||b.s.losses-a.s.losses)[0];return{hot,cold}}
let preferredVoice=null,preferredEnglishVoice=null,speechRunId=0;
function refreshPreferredVoice(){if(!('speechSynthesis'in window))return;const voices=window.speechSynthesis.getVoices(),englishVoices=voices.filter(v=>/^en/i.test(v.lang));preferredVoice=voices.find(v=>/zh[-_]TW/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang))||null;preferredEnglishVoice=englishVoices.find(v=>/en[-_]US/i.test(v.lang)&&/Samantha|Ava|Nicky|Alex|Aaron|Joelle/i.test(v.name))||englishVoices.find(v=>/en[-_]US/i.test(v.lang)&&v.localService)||englishVoices.find(v=>/en[-_]US/i.test(v.lang))||englishVoices[0]||null}
if('speechSynthesis'in window){refreshPreferredVoice();window.speechSynthesis.onvoiceschanged=refreshPreferredVoice}
let audioContext=null;
function pulseAudioOutput(){if(!audioContext||audioContext.state!=='running')return;const o=audioContext.createOscillator(),g=audioContext.createGain();g.gain.setValueAtTime(.0001,audioContext.currentTime);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.03)}
function wakeAudioOutput(){
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;
    if(!audioContext||audioContext.state==='closed')audioContext=new AudioContextClass();
    if(audioContext.state==='interrupted'&&typeof audioContext.suspend==='function')audioContext.suspend().catch(()=>{}).then(()=>audioContext.resume()).then(pulseAudioOutput).catch(()=>{});
    else if(audioContext.state==='suspended')audioContext.resume().then(pulseAudioOutput).catch(()=>{});
    else pulseAudioOutput();
  }catch(e){console.warn('音訊輸出初始化失敗',e)}
}
function armScoreAudio(){if(!voiceEnabled)return;wakeAudioOutput();if('speechSynthesis'in window&&window.speechSynthesis.paused)window.speechSynthesis.resume()}
document.addEventListener('pointerdown',armScoreAudio,{passive:true});
document.addEventListener('keydown',armScoreAudio,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&voiceEnabled)wakeAudioOutput()});
function speakerTest(){wakeAudioOutput();if(!('speechSynthesis'in window))return alert('此瀏覽器不支援語音播報。');const wasEnabled=voiceEnabled;voiceEnabled=true;speak('喇叭測試，比分播報音量測試，GAME！',()=>{voiceEnabled=wasEnabled;updateVoiceButton()});}
function speak(text,onend){
  if(!('speechSynthesis'in window)||!text||!voiceEnabled)return;
  wakeAudioOutput();
  const runId=++speechRunId,synth=window.speechSynthesis;
  if(synth.paused)synth.resume();
  synth.cancel();
  const parts=String(text).replace(/，?\s*(Match Point|GAME)\s*[！!]?/gi,'|||$1|||').split('|||').map(x=>x.trim()).filter(Boolean);
  let index=0;
  const next=(delay=0)=>{
    if(delay){setTimeout(()=>next(),delay);return}
    if(runId!==speechRunId||!voiceEnabled)return;
    if(index>=parts.length){if(onend)onend();return}
    const part=parts[index++],english=/^(Match Point|GAME)$/i.test(part),game=/^GAME$/i.test(part);
    const natural=english?(game?'Game!':'Match Point'):part.replace(/。\s*/g,'，').replace(/，{2,}/g,'，').replace(/^，|，$/g,'');
    if(!natural)return next();
    const u=new SpeechSynthesisUtterance(natural);
    u.lang=english?(preferredEnglishVoice?.lang||'en-US'):'zh-TW';
    u.rate=game?.68:english?.82:.96;
    u.pitch=game?.9:english?1:1;
    u.volume=1;
    if(english&&preferredEnglishVoice)u.voice=preferredEnglishVoice;
    else if(!english&&preferredVoice)u.voice=preferredVoice;
    const afterDelay=game?700:english?360:0;
    u.onend=()=>next(afterDelay);
    u.onerror=()=>next(game?300:0);
    const beforeDelay=game?380:english?180:0;
    if(beforeDelay)setTimeout(()=>{if(runId===speechRunId&&voiceEnabled)synth.speak(u)},beforeDelay);
    else synth.speak(u);
  };
  next();
}
function voiceTeamLabel(team){return team===0?'左方':'右方'}
function scoreSpeechText(){const m=state.match,a=m.scores?.[0]||0,b=m.scores?.[1]||0;if(m.winner!==null)return `${a}比${b}，GAME！${voiceTeamLabel(m.winner)}獲勝。`;let extra='';if(gamePoint())extra='，Match Point';else if(a===b&&a>=state.rules.target-1)extra='，平分';const servingTeam=voiceTeamLabel(m.serving);const servingSide=m.scores?.[m.serving]%2===0?1:0;const serverIndex=m.positions?.[m.serving]?.[servingSide]??0;const serverId=m.players?.[m.serving]?.[serverIndex];const serverName=serverId?vname(serverId):servingTeam;const courtSide=m.scores?.[m.serving]%2===0?'右':'左';return `${a}比${b}${extra}，由${serverName}發球，${courtSide}發球區。`}
function announceScore(){
 const msg=scoreSpeechText();
 if(state.match.winner!==null && state.nextCall?.players?.length===4){
  const p=state.nextCall.players.map(id=>vname(id));
  speak(`${msg} 下一場是左方 ${p[0]}和${p[1]}，對戰右方 ${p[2]}和${p[3]}。`);
 }else speak(msg);
}
function updateVoiceButton(){
  const b=$('voiceToggle');
  if(!b)return;
  const action=voiceEnabled?'關閉比分播報':'開啟比分播報';
  b.textContent=voiceEnabled?'🔊':'🔇';
  b.setAttribute('aria-pressed',voiceEnabled?'true':'false');
  b.setAttribute('aria-label',action);
  b.title=action;
}
function formatEventDate(date,time,endTime=''){if(!date)return'';const d=new Date(`${date}T${time||'00:00'}`);if(isNaN(d.getTime()))return `${date}${time?' '+time:''}${endTime?`-${endTime}`:''}`;const dateText=d.toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});return `${dateText}${time?` ${time}${endTime?`-${endTime}`:''}`:''}`}
function formatMoney(value){return new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(wholeAmount(value))}
function googleMapsUrl(place){const query=String(place||'').trim();return query?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`:''}
function googleMapsLink(place,label='Google Maps'){const href=googleMapsUrl(place);return href?`<a class="map-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 查看 ${esc(place)}">📍 ${esc(label)}</a>`:''}
function updateMapPreview(inputId,linkId){const input=$(inputId),link=$(linkId),href=googleMapsUrl(input?.value);if(!link)return;link.classList.toggle('hidden',!href);if(href){link.href=href;link.setAttribute('aria-label',`在 Google Maps 查看 ${input.value.trim()}`)}}
function updateVenueMapPreviews(){updateMapPreview('pollNote','pollLocationMap');updateMapPreview('confirmLocation','confirmLocationMap');updateMapPreview('editNextEventLocation','editNextEventLocationMap')}
function renderNextEventAnnouncement(){
  const box=$('nextEventAnnouncement'),e=state.nextEvent;
  if(!box)return;
  const visible=shouldShowNextEventAnnouncement(e?.date,localDateKey());
  box.classList.toggle('hidden',!visible);
  if(!visible){box.innerHTML='';return}
  const participantCount=wholeAmount(e.participantCount),perPersonFee=wholeAmount(e.perPersonFee),participantText=participantCount?`預計參與 ${formatMoney(participantCount)} 人`:'預計參與人數待確認',payment=perPersonFee?`<div class="next-event-payment">每人需繳 ${formatMoney(perPersonFee)} 元</div>`:'';
  const editButton=isHost?'<button id="editNextEventAnnouncement" class="btn next-event-edit-btn" type="button">✏️ 編輯公告</button>':'';
  box.innerHTML=`<div class="next-event-card-head"><h3>📣 下一次打球</h3>${editButton}</div><div class="next-event-main">${esc(formatEventDate(e.date,e.time,e.endTime))}</div><div class="next-event-place"><span>📍 ${esc(e.location||'場地待公告')}</span>${e.location?googleMapsLink(e.location,'開啟地圖'):''}</div>${e.note?`<div class="next-event-note"><strong>🏸 場地備註：</strong>${esc(e.note)}</div>`:''}<div class="next-event-facts"><div class="next-event-participants">👥 ${participantText}</div>${payment}</div>`;
  $('editNextEventAnnouncement')?.addEventListener('click',openNextEventEditor);
}
function updateNextEventEditFeePreview(){
  const rentalTotal=wholeAmount($('editNextEventRentalTotal')?.value),participantCount=wholeAmount($('editNextEventParticipants')?.value),perPersonFee=calculatePerPersonFee(rentalTotal,participantCount);
  if($('editNextEventPerPersonFee'))$('editNextEventPerPersonFee').value=perPersonFee?`${formatMoney(perPersonFee)} 元`:'';
  if($('editNextEventFeeHint'))$('editNextEventFeeHint').textContent=!rentalTotal?'輸入場租總額後自動計算。':!participantCount?'請輸入預計參與總人數。':`場租 ${formatMoney(rentalTotal)} 元 ÷ ${formatMoney(participantCount)} 人＝每人 ${formatMoney(perPersonFee)} 元`;
  return{rentalTotal,participantCount,perPersonFee};
}
function openNextEventEditor(){
  if(!isHost||!state.nextEvent?.date)return;
  const event=state.nextEvent;
  $('editNextEventDate').value=event.date||'';
  $('editNextEventTime').value=event.time||'';
  $('editNextEventEndTime').value=event.endTime||'';
  $('editNextEventLocation').value=event.location||'';
  $('editNextEventRentalTotal').value=wholeAmount(event.rentalTotal)||'';
  $('editNextEventParticipants').value=wholeAmount(event.participantCount)||'';
  $('editNextEventNote').value=event.note||'';
  updateNextEventEditFeePreview();
  updateVenueMapPreviews();
  $('nextEventEditModal').classList.remove('hidden');
}
function closeNextEventEditor(){$('nextEventEditModal').classList.add('hidden')}
function renderAdminAnnouncement(){
  const box=$('adminAnnouncement'),notices=normalizeAdminNotices(state);
  if(!box)return;
  state.adminNotices=notices;state.adminNotice=notices[0]||null;
  box.classList.toggle('hidden',!notices.length);
  if(!notices.length){box.innerHTML='';if(!$('adminNoticeModal').classList.contains('hidden'))renderAdminNoticeManager();return}
  box.innerHTML=notices.map(notice=>{
    const date=new Date(notice.publishedAt||''),time=!isNaN(date)?date.toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    return `<article class="admin-notice-entry"><div class="admin-notice-entry-head"><h3>📣 ${esc(notice.title)}</h3></div><p>${esc(notice.body)}</p>${time?`<time>發布於 ${esc(time)}</time>`:''}</article>`;
  }).join('');
  if(!$('adminNoticeModal').classList.contains('hidden'))renderAdminNoticeManager();
}
function renderPollDeadlineAnnouncement(){const box=$('pollDeadlineAnnouncement'),poll=state.schedulePoll||{},hasOptions=(poll.options||[]).length>0,created=!!poll.createdAt,closed=isPollClosed(poll),deadline=poll.deadlineAt||'';if(!box)return;const visible=(hasOptions||created)&&!closed;box.classList.toggle('hidden',!visible);if(!visible){box.innerHTML='';return}const detail=!hasOptions?'候選日期準備中':deadline?`截止時間：${esc(formatPollDeadline(deadline))}`:'截止時間尚未設定';box.className='poll-deadline-card';box.innerHTML=`<div><strong>🗳️ ${hasOptions?'下次球局投票中':'新投票已建立'}</strong><p>${detail}</p></div><button id="dashboardPollBtn" class="btn primary" type="button">前往投票</button>`;$('dashboardPollBtn').onclick=()=>page(6)}
function calloutText(sourceIds){const ids=sourceIds||state.nextCall?.players||[];if(ids.length!==4||new Set(ids).size!==4)return'';return `下一場是左方 ${vname(ids[0])}和${vname(ids[1])}，對戰右方 ${vname(ids[2])}和${vname(ids[3])}。`}
function renderDashboard() {
    if (!$('clubMetrics')) return;

    renderAdminAnnouncement();
    renderNextEventAnnouncement();
    renderPollDeadlineAnnouncement();

    $('dashboardDate').textContent = new Date().toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
    });

    const m = state.match,
        teams = m.players || [[], []],
        hasCurrentMatch = !!m.startedAt && teams.flat().filter(Boolean).length === 4,
        month = localMonthKey(),
        monthGames = state.history.filter(h => historyDate(h).startsWith(month)),
        monthPlayers = new Set(monthGames.flatMap(h => (h.teams || []).flat()).filter(Boolean));
    if($('endSessionBtn'))$('endSessionBtn').disabled=!hasCurrentMatch&&!state.nextCall&&!state.attendance.length;

    $('clubMetrics').innerHTML = `
        <div class="club-metric"><span class="club-metric-icon">🏸</span><span><strong>${monthGames.length}</strong><small>本月比賽</small></span></div>
        <div class="club-metric"><span class="club-metric-icon">🎯</span><span><strong>${state.history.length}</strong><small>累積比賽</small></span></div>
        <div class="club-metric"><span class="club-metric-icon">🙌</span><span><strong>${monthPlayers.size}</strong><small>本月出賽球友</small></span></div>
        <div class="club-metric"><span class="club-metric-icon">👥</span><span><strong>${state.roster.length}</strong><small>球友人數</small></span></div>
    `;

    const recent = state.history.slice(-3).reverse();
    $('homeRecentMatches').innerHTML = recent.map(h => {
        const scoreA = h.scores?.[0] ?? 0, scoreB = h.scores?.[1] ?? 0;
        const teamA = esc((h.teams?.[0] || []).map(pname).join('／') || 'A 隊');
        const teamB = esc((h.teams?.[1] || []).map(pname).join('／') || 'B 隊');
        const dateKey = historyDate(h), date = dateKey ? new Date(`${dateKey}T12:00:00`) : null;
        const dateLabel = date && !isNaN(date) ? date.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric',weekday:'short'}) : (h.time || '');
        return `<article class="home-match-row">
          <div class="home-match-date">${esc(dateLabel)}</div>
          <div class="home-match-result">
            <span class="home-match-team ${h.winner===0?'winner':''}">${teamA}</span>
            <strong class="home-match-score">${scoreA}<em>：</em>${scoreB}</strong>
            <span class="home-match-team ${h.winner===1?'winner':''}">${teamB}</span>
          </div>
        </article>`;
    }).join('') || '<div class="club-empty">完成第一場比賽後，最新結果會出現在這裡。</div>';

    const leaders = state.roster.map(p => ({p,s:scopedStats(p.id,'month',month)}))
        .filter(x => x.s.games)
        .sort((a,b) => b.s.wins-a.s.wins || b.s.rate-a.s.rate || b.s.games-a.s.games || a.p.name.localeCompare(b.p.name,'zh-Hant'))
        .slice(0,3);
    const medals = ['🥇','🥈','🥉'];
    $('homeMonthlyLeaders').innerHTML = leaders.map((x,index) => `
      <div class="home-leader-row">
        <span class="home-leader-rank">${medals[index]}</span>
        <span class="home-leader-player">${avatar(x.p.id,'tiny')}<span><strong>${esc(x.p.name)}</strong><small>${x.s.wins} 勝 ${x.s.losses} 敗</small></span></span>
        <strong class="home-leader-rate">${x.s.rate}%</strong>
      </div>
    `).join('') || '<div class="club-empty">本月完成比賽後，球友亮點會出現在這裡。</div>';

    const replayUrl = normalizeYouTubePlaylistUrl(state.matchReplayPlaylistUrl),
        replayTitle = normalizeMatchReplayTitle(state.matchReplayPlaylistTitle),
        replayCard = $('homeReplayCard');
    replayCard.classList.toggle('hidden',!replayUrl);
    replayCard.href = replayUrl || '#';
    $('homeReplayTitle').textContent = replayTitle || '比賽影片回放';
    $('homeHistoryBtn').onclick = () => page(5);
    $('homeStatsBtn').onclick = () => page(4);
}
function renderStats(){
  const month=$('monthPick').value||localMonthKey(),sortKey=$('statsSort')?.value||'month-record',order=$('statsOrder')?.value||'desc';
  $('monthPick').value=month;
  const todayGames=state.history.filter(h=>historyDate(h)===localDateKey()).length,monthGames=state.history.filter(h=>historyDate(h).startsWith(month)).length;
  $('statsSummary').innerHTML=`<div class="metric"><strong>${todayGames}</strong><span class="sub">今日場次</span></div><div class="metric"><strong>${monthGames}</strong><span class="sub">選定月份場次</span></div><div class="metric"><strong>${state.history.length}</strong><span class="sub">生涯總場次</span></div><div class="metric"><strong>${state.roster.length}</strong><span class="sub">球員人數</span></div>`;
  const {hot}=todayLeaders();
  $('hotColdStats').innerHTML=`<div class="leader-card hot"><strong>🔥 手感火熱</strong><div>${hot?`${esc(hot.p.name)} · ${hot.s.streak} 連勝 · 今日 ${hot.s.wins} 勝`:'尚無資料'}</div></div>`;
  const rows=state.roster.map(p=>({p,t:scopedStats(p.id,'today'),mo:scopedStats(p.id,'month',month),c:scopedStats(p.id,'career')})),scope=sortKey.startsWith('career')?'c':'mo',metric=sortKey.endsWith('rate')?'rate':'record',direction=order==='asc'?1:-1;
  const compareStat=(a,b)=>metric==='rate'?a.rate-b.rate||a.games-b.games||a.wins-b.wins:a.wins-b.wins||b.losses-a.losses||a.rate-b.rate||a.games-b.games;
  rows.sort((a,b)=>direction*compareStat(a[scope],b[scope])||a.p.name.localeCompare(b.p.name,'zh-Hant'));
  $('statsBody').innerHTML=rows.map(({p,t,mo,c})=>{const st=t.streak?(t.kind==='W'?`🔥 ${t.streak}連勝`:`🧊 ${t.streak}連敗`):'—';return `<tr data-profile="${p.id}" style="cursor:pointer"><td>${avatar(p.id,'tiny')} <strong>${esc(p.name)}</strong></td><td>${t.wins}勝 ${t.losses}敗 (${t.rate}%)</td><td>${mo.wins}勝 ${mo.losses}敗 (${mo.rate}%)</td><td>${c.wins}勝 ${c.losses}敗 (${c.rate}%)</td><td>${st}</td></tr>`}).join('');
  all('[data-profile]').forEach(x=>x.onclick=()=>openEdit(x.dataset.profile));
}


const POLL_UNAVAILABLE='__unavailable__';
let pollDeadlineTimer=null;
function pollDeadlineMs(poll=state.schedulePoll){const ms=Date.parse(poll?.deadlineAt||'');return Number.isFinite(ms)?ms:0}
function isPollDeadlinePassed(poll=state.schedulePoll,now=Date.now()){const ms=pollDeadlineMs(poll);return !!ms&&ms<=now}
function isPollClosed(poll=state.schedulePoll,now=Date.now()){return poll?.status==='closed'||isPollDeadlinePassed(poll,now)}
function formatPollDeadline(value){const d=new Date(value);if(isNaN(d.getTime()))return String(value||'');return d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}
function pollDeadlineInputValue(value){const d=new Date(value);if(isNaN(d.getTime()))return'';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function schedulePollDeadlineTimer(poll=state.schedulePoll){clearTimeout(pollDeadlineTimer);pollDeadlineTimer=null;const ms=pollDeadlineMs(poll),remaining=ms-Date.now();if(!ms||remaining<=0)return;pollDeadlineTimer=setTimeout(()=>{if(isPollDeadlinePassed(state.schedulePoll)){if(state.schedulePoll.status!=='closed')state.schedulePoll.status='closed';renderDashboard();renderPoll();if(isHost&&roomRef)saveSoon()}else schedulePollDeadlineTimer()},Math.min(remaining+250,2147483000))}
function pollSelectionList(value){return String(value||'').split('|').filter(Boolean)}
function pollSignature(){return `${state.schedulePoll?.createdAt||''}|${(state.schedulePoll?.options||[]).map(o=>o.id).sort().join(',')}|${state.schedulePoll?.deadlineAt||''}`}
function pollSeenKey(){return `bcmPollSeenV1:${roomId||'local'}`}
function isPollUnseen(){const sig=pollSignature(),poll=state.schedulePoll||{};return (!!poll.createdAt||!!(poll.options||[]).length)&&localStorage.getItem(pollSeenKey())!==sig}
function markPollSeen(){const sig=pollSignature();if(sig)localStorage.setItem(pollSeenKey(),sig);renderPollNotice()}
function renderPollNotice(){const poll=state.schedulePoll||{},unseen=isPollUnseen()&&!isPollClosed(poll),dot=$('pollTabDot');if(dot)dot.classList.toggle('hidden',!unseen)}
function ownedPlayerId(){return state.roster.find(p=>p.ownerHash&&p.ownerHash===selfHash)?.id||''}
const PUSH_ENABLED_PREFIX='bcmPushEnabledV1:',PUSH_PROMPT_PREFIX='bcmPushPromptV1:',PUSH_PROMPT_VERSION='20260723-chat-2';
let pushPromptShownRoom='';
function pushEnabledKey(id=roomId){return `${PUSH_ENABLED_PREFIX}${id||'none'}`}
function pushPromptKey(id=roomId){return `${PUSH_PROMPT_PREFIX}${id||'none'}`}
function chatIdentityKey(id=roomId){return `bcmChatPlayerV1:${id||'none'}`}
function preferredNotificationPlayerId(){const stored=localStorage.getItem(chatIdentityKey())||'';return ownedPlayerId()||(state.roster.some(p=>p.id===stored)?stored:'')||$('chatPlayer')?.value||$('pollVoter')?.value||''}
function supportsPush(){return 'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window}
function isIosLike(){return /iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function isStandaloneApp(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true}
function base64UrlBytes(value){const padded=value.padEnd(Math.ceil(value.length/4)*4,'=').replace(/-/g,'+').replace(/_/g,'/'),raw=atob(padded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes}
async function pushApi(path,options={}){const response=await fetch(`/.netlify/functions/${path}`,options);let data={};try{data=await response.json()}catch{}if(!response.ok){const error=new Error(data.error||'通知服務暫時無法使用');error.status=response.status;throw error}return data}
function pushNotificationEnabled(){return supportsPush()&&!!roomId&&localStorage.getItem(pushEnabledKey())==='1'&&Notification.permission==='granted'}
function updatePushNotificationButton(){const button=$('pushNotificationBtn'),testButton=$('pushTestBtn');if(!button)return;const supported=supportsPush(),enabled=pushNotificationEnabled();button.setAttribute('aria-pressed',enabled?'true':'false');button.disabled=!roomId||!supported;if(testButton)testButton.disabled=!enabled||!supported;if(!supported)button.textContent='🔕 此裝置不支援通知';else if(Notification.permission==='denied')button.textContent='🔕 通知已被封鎖';else button.textContent=enabled?'🔔 本球局通知已開啟':'🔔 啟用手機通知'}
function rememberPushPromptChoice(){if(roomId)localStorage.setItem(pushPromptKey(),PUSH_PROMPT_VERSION)}
function closePushPrompt({remember=true}={}){if(remember)rememberPushPromptChoice();$('pushPromptModal')?.classList.add('hidden')}
function maybeShowPushNotificationPrompt(){
  const supported=supportsPush(),enabled=pushNotificationEnabled(),alreadyAnswered=localStorage.getItem(pushPromptKey())===PUSH_PROMPT_VERSION,alreadyShown=pushPromptShownRoom===roomId;
  if(!shouldShowNotificationPrompt({roomId,supported,enabled,alreadyAnswered,alreadyShown}))return;
  pushPromptShownRoom=roomId;
  const iosInstallRequired=isIosLike()&&!isStandaloneApp(),blocked=Notification.permission==='denied';
  $('pushPromptText').textContent=blocked?'通知目前被系統封鎖；若要接收提醒，請先到手機設定允許 7B 羽球社通知。':iosInstallRequired?'iPhone／iPad 請先用 Safari 加入主畫面，再從主畫面開啟 App 設定通知。':'開啟後會收到投票截止提醒、球局公告及聊天室標記通知。';
  $('pushPromptModal').classList.remove('hidden');
}
async function enablePushFromPrompt(){
  closePushPrompt();
  if(!pushNotificationEnabled())await setPushNotificationEnabled();
}
async function sendPushTest(subscription){return pushApi('push-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId,endpoint:subscription.endpoint})})}
async function testPushNotification(){
  const button=$('pushTestBtn');
  if(!roomId||!supportsPush())return alert('這個瀏覽器目前無法測試手機通知。');
  button.disabled=true;button.textContent='正在傳送測試通知…';
  try{
    if(Notification.permission!=='granted')throw new Error('請先啟用本球局通知。');
    const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
    if(!subscription){localStorage.removeItem(pushEnabledKey());throw new Error('這台裝置的通知訂閱已失效，請重新啟用手機通知。')}
    await sendPushTest(subscription);
    alert('測試通知已送出。若幾秒內沒有出現，請檢查 iPad「設定 → 通知 → 7B 羽球社」及專注模式。');
  }catch(error){if(error.status===404||error.status===410)localStorage.removeItem(pushEnabledKey());alert(error.message||'測試通知傳送失敗。')}finally{button.textContent='📳 傳送測試通知';updatePushNotificationButton()}
}
async function reconcilePushSubscription(){
  if(!roomId||!supportsPush()||localStorage.getItem(pushEnabledKey())!=='1')return updatePushNotificationButton();
  try{
    if(Notification.permission!=='granted'){localStorage.removeItem(pushEnabledKey());return updatePushNotificationButton()}
    const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
    if(!subscription){localStorage.removeItem(pushEnabledKey());return updatePushNotificationButton()}
    const playerId=preferredNotificationPlayerId(),playerName=playerId?pname(playerId):'';
    await pushApi('push-subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,roomId,clientHash:selfHash,playerId,playerName,subscription:subscription.toJSON()})});
  }catch(error){console.warn('Push subscription refresh failed',error)}
  updatePushNotificationButton();
}
async function setPushNotificationEnabled(){
  const button=$('pushNotificationBtn');
  if(!roomId)return alert('請先進入球局。');
  if(!supportsPush())return alert('這個瀏覽器不支援手機推播通知。');
  const enabled=localStorage.getItem(pushEnabledKey())==='1';
  button.disabled=true;
  button.textContent=enabled?'正在關閉通知…':'正在開啟通知…';
  try{
    if(enabled){
      const registration=await navigator.serviceWorker.ready,existing=await registration.pushManager.getSubscription();
      if(existing)await pushApi('push-subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:false,roomId,endpoint:existing.endpoint})});
      localStorage.removeItem(pushEnabledKey());
      alert('已關閉這個球局的手機通知。');
      return;
    }
    if(isIosLike()&&!isStandaloneApp())throw new Error('iPhone／iPad 請先用 Safari「加入主畫面」，再從主畫面開啟 7B 羽球社後設定通知。');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error(permission==='denied'?'通知權限已被封鎖，請到手機的網站通知設定中允許。':'你尚未允許通知。');
    const [config,registration]=await Promise.all([pushApi('push-config'),navigator.serviceWorker.ready]);
    const existing=await registration.pushManager.getSubscription();
    const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlBytes(config.publicKey)});
    const playerId=preferredNotificationPlayerId(),playerName=playerId?pname(playerId):'';
    await pushApi('push-subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,roomId,clientHash:selfHash,playerId,playerName,subscription:subscription.toJSON()})});
    localStorage.setItem(pushEnabledKey(),'1');
    rememberPushPromptChoice();
    try{await sendPushTest(subscription);alert('手機通知已開啟，測試通知也已送出。之後會收到投票、球局公告及聊天室標記通知。')}catch{alert('手機通知已開啟，但測試通知未成功送達；請稍後使用「傳送測試通知」再試一次。')}
  }catch(error){alert(error.message||'無法設定通知。')}finally{updatePushNotificationButton()}
}

function chatSeenKey(id=roomId){return `bcmChatSeenV1:${id||'none'}`}
function chatMessageTimeMs(message){
  if(typeof message?.createdAt?.toMillis==='function')return message.createdAt.toMillis();
  const created=Date.parse(message?.createdAt||'');
  if(Number.isFinite(created))return created;
  const client=Number(message?.clientCreatedAt||0);
  return Number.isFinite(client)?client:0;
}
function selectedChatPlayerId(){
  const owned=ownedPlayerId(),stored=localStorage.getItem(chatIdentityKey())||'',selected=$('chatPlayer')?.value||'';
  if(owned)return owned;
  if(state.roster.some(p=>p.id===selected))return selected;
  if(state.roster.some(p=>p.id===stored))return stored;
  return'';
}
function chatPageVisible(){return !!$('page8')&&!$('page8').classList.contains('hidden')}
function markChatSeen(){
  if(!roomId)return;
  const newest=Math.max(Date.now(),...chatMessages.map(chatMessageTimeMs));
  localStorage.setItem(chatSeenKey(),String(newest));
  renderChatBadge();
}
function renderChatBadge(){
  const badge=$('chatTabBadge');if(!badge)return;
  const seen=Number(localStorage.getItem(chatSeenKey())||0);
  const unread=chatMessages.filter(message=>message.senderHash!==selfHash&&chatMessageTimeMs(message)>seen).length;
  badge.classList.toggle('hidden',!unread);
  badge.textContent=unread>99?'99+':String(unread||'');
  badge.setAttribute('aria-label',unread?`${unread} 則未讀聊天室訊息`:'沒有未讀聊天室訊息');
}
function setChatStatus(message='',kind=''){
  const status=$('chatStatus');if(!status)return;
  status.textContent=message;
  status.className=`chat-status ${kind}`.trim();
}
function chatMessageHtml(message){
  let html=esc(cleanChatText(message.text)).replace(/\n/g,'<br>');
  for(const id of message.mentions||[]){
    const tag=esc(`@${pname(id)}`);
    html=html.split(tag).join(`<span class="chat-mention">${tag}</span>`);
  }
  return html;
}
function renderChatMentionList(){
  const list=$('chatMentionList');if(!list)return;
  const senderId=selectedChatPlayerId(),validIds=state.roster.map(p=>p.id);
  chatMentionIds=new Set(normalizeChatMentionIds([...chatMentionIds],{validIds,senderId}));
  list.innerHTML=state.roster.filter(p=>p.id!==senderId).map(p=>`<button type="button" class="chat-mention-chip ${chatMentionIds.has(p.id)?'selected':''}" data-chat-mention="${p.id}" aria-pressed="${chatMentionIds.has(p.id)}">${avatar(p.id,'tiny')}<span>${esc(p.name)}</span></button>`).join('')||'<span class="sub">目前沒有其他球友可以標記。</span>';
  all('[data-chat-mention]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.chatMention;
    if(chatMentionIds.has(id))chatMentionIds.delete(id);
    else{
      if(chatMentionIds.size>=8)return alert('一次最多標記 8 位球友。');
      chatMentionIds.add(id);
      const composer=$('chatComposer'),tag=`@${pname(id)} `;
      if(!composer.value.includes(`@${pname(id)}`)){
        const start=composer.selectionStart??composer.value.length,end=composer.selectionEnd??start;
        composer.setRangeText(`${start&&!/\s$/.test(composer.value.slice(0,start))?' ':''}${tag}`,start,end,'end');
        composer.focus();
      }
    }
    renderChatMentionList();updateChatSendButton();
  });
}
function updateChatSendButton(){
  const button=$('sendChat');if(!button)return;
  button.disabled=!selectedChatPlayerId()||!cleanChatText($('chatComposer')?.value);
}
function renderChat(){
  const list=$('chatMessages'),identity=$('chatPlayer');if(!list||!identity)return;
  const owned=ownedPlayerId(),stored=localStorage.getItem(chatIdentityKey())||'',current=identity.value;
  identity.innerHTML='<option value="">請選擇球員</option>'+state.roster.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const chosen=owned||[current,stored,state.schedulePoll?.voterPlayers?.[selfHash]].find(id=>state.roster.some(p=>p.id===id))||'';
  identity.value=chosen;
  if(chosen)localStorage.setItem(chatIdentityKey(),chosen);
  identity.onchange=()=>{
    if(identity.value)localStorage.setItem(chatIdentityKey(),identity.value);else localStorage.removeItem(chatIdentityKey());
    chatMentionIds.delete(identity.value);
    renderChatMentionList();updateChatSendButton();
    reconcilePushSubscription().catch(error=>console.warn('Chat notification identity refresh failed',error));
  };
  renderChatMentionList();

  const wasNearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<90;
  list.innerHTML=chatMessages.map(message=>{
    const mine=message.senderHash===selfHash,mentioned=message.mentions?.includes(selectedChatPlayerId());
    const sender=player(message.senderId),senderAvatar=sender?avatar(sender.id,'tiny'):`<span class="avatar tiny">${esc(initials(message.senderName))}</span>`;
    const ms=chatMessageTimeMs(message),date=ms?new Date(ms):null;
    const time=date&&!isNaN(date)?date.toLocaleString('zh-TW',localDateKey(date)===localDateKey()?{hour:'2-digit',minute:'2-digit'}:{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'傳送中';
    return `<article class="chat-message ${mine?'mine':''} ${mentioned?'mentions-me':''}">
      <div class="chat-message-avatar">${senderAvatar}</div>
      <div class="chat-message-main"><div class="chat-message-meta"><strong>${esc(message.senderName||'球友')}</strong><time>${esc(time)}</time></div><div class="chat-bubble">${chatMessageHtml(message)}</div></div>
    </article>`;
  }).join('')||'<div class="chat-empty"><strong>聊天室還沒有訊息</strong><span>傳送第一句話，或標記球友一起討論。</span></div>';
  $('chatConnection').textContent=!navigator.onLine?'離線中':chatCollectionRef?'即時同步':'尚未連線';
  $('chatConnection').classList.toggle('offline',!navigator.onLine);
  setChatStatus(chosen?`${pname(chosen)}，可以開始聊天`:'請先選擇發言身分');
  updateChatSendButton();renderChatBadge();
  if(chatPageVisible()){
    markChatSeen();
    if(wasNearBottom||chatFirstRender)requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight});
  }
  chatFirstRender=false;
}
function startChatSync(){
  chatUnsubscribe?.();chatUnsubscribe=null;chatMessages=[];chatFirstRender=true;
  if(!roomId)return;
  chatCollectionRef=roomId;
  const load=async()=>{
    if(chatRequestRunning||!roomId||chatCollectionRef!==roomId||!navigator.onLine)return;
    chatRequestRunning=true;
    try{
      const result=await pushApi(`chat-mention?roomId=${encodeURIComponent(roomId)}`);
      chatMessages=Array.isArray(result.messages)?result.messages:[];
      renderChat();
    }catch(error){
      $('chatConnection').textContent=navigator.onLine?'同步中斷':'離線中';
      $('chatConnection').classList.add('offline');
      setChatStatus(`聊天室暫時無法同步：${error.message}`,'error');
    }finally{chatRequestRunning=false}
  };
  void load();
  const timer=setInterval(load,2800);
  chatUnsubscribe=()=>clearInterval(timer);
}
async function sendChatMessage(){
  const button=$('sendChat'),composer=$('chatComposer'),senderId=selectedChatPlayerId(),sender=player(senderId),text=cleanChatText(composer.value,CHAT_MESSAGE_MAX_LENGTH);
  if(!chatCollectionRef||!roomId)return alert('聊天室尚未連線，請稍後再試。');
  if(!sender)return alert('請先選擇發言身分。');
  if(!text)return;
  if(Date.now()-chatLastSentAt<900)return;
  const validIds=state.roster.map(p=>p.id),mentions=normalizeChatMentionIds([...chatMentionIds],{validIds,senderId});
  chatLastSentAt=Date.now();button.disabled=true;setChatStatus('正在傳送…','pending');
  try{
    const result=await pushApi('chat-mention',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId,text,senderId,senderName:sender.name,senderHash:selfHash,mentions,clientCreatedAt:Date.now()})});
    if(result.message&&!chatMessages.some(message=>message.id===result.message.id))chatMessages=[...chatMessages,result.message].slice(-100);
    composer.value='';chatMentionIds.clear();renderChatMentionList();
    renderChat();
    if(mentions.length)setChatStatus(result.sent?`訊息已傳送，已通知 ${result.sent} 台裝置`:'訊息已傳送；被標記者尚未開啟手機通知','success');
    else setChatStatus('訊息已傳送','success');
  }catch(error){
    setChatStatus(`訊息傳送失敗：${error.message}`,'error');
  }finally{updateChatSendButton()}
}
function pollCounts(){const counts={};for(const o of state.schedulePoll.options||[])counts[o.id]=0;for(const value of Object.values(state.schedulePoll.votes||{}))for(const id of pollSelectionList(value))if(id in counts)counts[id]++;return counts}
function pollParticipantCount(optionId){
  if(!optionId)return 0;
  const participants=new Set();
  for(const [deviceHash,value] of Object.entries(state.schedulePoll.votes||{})){
    if(!pollSelectionList(value).includes(optionId))continue;
    const playerId=state.schedulePoll.voterPlayers?.[deviceHash];
    participants.add(playerId?`player:${playerId}`:`device:${deviceHash}`);
  }
  return participants.size;
}
function pollOptionLabel(o){if(!o?.date)return '未設定日期';const d=new Date(`${o.date}T${o.time||'00:00'}`);const date=isNaN(d)?o.date:d.toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'}),time=o.time?` ${o.time}${o.endTime?`-${o.endTime}`:''}`:'';return `${date}${time}${o.note?` · ${o.note}`:''}`}
function updateConfirmFeePreview(){
  const optionId=$('confirmPollOption')?.value||'',rentalTotal=wholeAmount($('confirmRentalTotal')?.value),participantCount=pollParticipantCount(optionId),perPersonFee=calculatePerPersonFee(rentalTotal,participantCount);
  if($('confirmPerPersonFee'))$('confirmPerPersonFee').value=perPersonFee?`${formatMoney(perPersonFee)} 元`:'';
  if($('confirmFeeHint'))$('confirmFeeHint').textContent=!optionId?'請先選擇確定日期。':!participantCount?'這個日期目前沒有人投票參加。':!rentalTotal?`參加 ${participantCount} 人；輸入場租後自動計算。`:`場租 ${formatMoney(rentalTotal)} 元 ÷ ${participantCount} 人＝每人 ${formatMoney(perPersonFee)} 元`;
  return{rentalTotal,participantCount,perPersonFee};
}
function suggestedEndTime(time){const match=String(time||'').match(/^(\d{2}):(\d{2})$/);if(!match)return'';const minutes=(+match[1]*60+ +match[2]+180)%(24*60);return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`}
function updateConfirmOptionDetails(){
  const option=(state.schedulePoll.options||[]).find(item=>item.id===$('confirmPollOption')?.value),endInput=$('confirmEndTime'),locationInput=$('confirmLocation');
  if(endInput&&option?.time)endInput.value=option.endTime||suggestedEndTime(option.time);
  if(locationInput){
    if(option?.note&&(!locationInput.value.trim()||locationInput.dataset.autoVenue==='1')){locationInput.value=option.note;locationInput.dataset.autoVenue='1'}
    else if(!option?.note&&locationInput.dataset.autoVenue==='1'){locationInput.value=''}
  }
  updateVenueMapPreviews();
  updateConfirmFeePreview();
}
function renderPoll(){
  if(!$('pollOptions'))return;
  const poll=state.schedulePoll||{status:'open',deadlineAt:'',options:[],votes:{},voterPlayers:{}};
  const deadlineExpired=isPollDeadlinePassed(poll);if(deadlineExpired&&poll.status!=='closed'){poll.status='closed';if(isHost&&roomRef)setTimeout(()=>saveSoon(),0)}const closed=isPollClosed(poll),legacyCompleted=closed&&!!state.nextEvent?.optionId&&!!state.nextEvent?.endTime&&(poll.options||[]).some(option=>option.id===state.nextEvent.optionId);if(legacyCompleted){poll.deadlineAt='';poll.options=[];poll.votes={};poll.voterPlayers={};if(isHost&&roomRef)setTimeout(()=>saveSoon(),0)}const options=poll.options||[],counts=pollCounts(),mine=pollSelectionList(poll.votes?.[selfHash]),completed=closed&&!options.length,submittedCount=Object.values(poll.votes||{}).filter(value=>pollSelectionList(value).length).length;
  const unavailableCount=Object.values(poll.votes||{}).filter(v=>pollSelectionList(v).includes(POLL_UNAVAILABLE)).length;
  const own=ownedPlayerId(),voter=$('pollVoter'),current=poll.voterPlayers?.[selfHash]||own||voter.value||'';
  voter.innerHTML='<option value="">請選擇姓名</option>'+state.roster.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  voter.value=state.roster.some(p=>p.id===current)?current:'';voter.disabled=!!own||closed;
  $('pollStatus').textContent=completed?'已完成':deadlineExpired?'投票已截止':closed?'投票已關閉':options.length?'投票中':poll.createdAt?'建立中':'尚未建立';$('pollStatus').className='poll-status '+(closed?'closed':'');
  $('pollSetupPanel').style.display=closed?'none':'';$('pollVotingPanel').style.display=completed?'none':'';$('confirmEventPanel').style.display=completed||!options.length?'none':'';$('pollCompletedPanel').classList.toggle('hidden',!completed);
  if(completed){const event=state.nextEvent,detail=event?.date?`${formatEventDate(event.date,event.time,event.endTime)} · ${event.location||'場地待公告'}${event.note?` · 場地備註：${event.note}`:''}${event.participantCount?` · 預計參與 ${formatMoney(event.participantCount)} 人`:''}${event.rentalTotal?` · 場租總額 ${formatMoney(event.rentalTotal)} 元`:''}${event.perPersonFee?` · 每人 ${formatMoney(event.perPersonFee)} 元`:''}`:'投票已結束，候選日期已清除。';$('pollCompletedText').innerHTML=`<strong>✅ ${event?.date?'球局已確認':'投票已結束'}</strong><p>${esc(detail)}</p>${event?.location?googleMapsLink(event.location,'開啟地圖'):''}`}
  $('pollSummary').innerHTML=options.length?`已收到 <strong>${submittedCount}</strong> 人投票${unavailableCount?` · 無法參加 ${unavailableCount} 人`:''}`:'新增候選日期後即可開始投票。';
  const deadlineInfo=$('pollDeadlineInfo'),deadlineText=poll.deadlineAt?formatPollDeadline(poll.deadlineAt):'';deadlineInfo.className=`poll-deadline-info${closed?' closed':''}`;deadlineInfo.innerHTML=poll.deadlineAt?`<strong>${deadlineExpired?'⏰ 投票已截止':closed?'⏸️ 投票已關閉':'⏰ 投票截止'}</strong><span>${deadlineExpired?'截止時間：':closed?'原訂截止：':'請於 '}${esc(deadlineText)}${!closed?' 前完成投票':''}</span>`:`<strong>${closed?'⏸️ 投票已關閉':'⏰ 尚未設定投票截止時間'}</strong>`;
  const deadlineInput=$('pollDeadline');if(deadlineInput&&document.activeElement!==deadlineInput)deadlineInput.value=pollDeadlineInputValue(poll.deadlineAt);if($('clearPollDeadline'))$('clearPollDeadline').disabled=!poll.deadlineAt;
  const dateRows=options.map(o=>{const voters=Object.entries(poll.votes||{}).filter(([,v])=>pollSelectionList(v).includes(o.id)).map(([hash])=>pname(poll.voterPlayers?.[hash]||'')).filter(n=>n!=='未知球員');return `<label class="poll-option ${closed?'closed':''}"><input class="viewer-enabled poll-choice poll-date-choice" type="checkbox" value="${o.id}" ${mine.includes(o.id)?'checked':''} ${closed?'disabled':''}><div><strong>${esc(pollOptionLabel(o))}</strong>${o.note?`<div class="poll-option-map">${googleMapsLink(o.note,'查看場地')}</div>`:''}<div class="poll-voters">${voters.length?`已選：${esc(voters.join('、'))}`:'尚無人選擇'} ${isHost&&!closed?`<button type="button" class="btn danger-outline host-only poll-delete" data-poll-delete="${o.id}" style="padding:5px 8px;margin-left:6px">刪除</button>`:''}</div></div><span class="poll-count">${counts[o.id]||0} 票</span></label>`}).join('');
  const unavailableVoters=Object.entries(poll.votes||{}).filter(([,v])=>pollSelectionList(v).includes(POLL_UNAVAILABLE)).map(([hash])=>pname(poll.voterPlayers?.[hash]||'')).filter(n=>n!=='未知球員');
  const unavailableRow=options.length&&!closed?`<label class="poll-option unavailable"><input class="viewer-enabled poll-choice poll-unavailable-choice" type="checkbox" value="${POLL_UNAVAILABLE}" ${mine.includes(POLL_UNAVAILABLE)?'checked':''}><div><strong>無法參加</strong><div class="poll-voters">${unavailableVoters.length?`已選：${esc(unavailableVoters.join('、'))}`:'目前無人選擇'}</div></div><span class="poll-count">${unavailableCount} 人</span></label>`:'';
  $('pollOptions').innerHTML=(dateRows+unavailableRow)||'<div class="poll-empty">尚無候選日期。</div>';
  $('submitVote').disabled=closed||!options.length;
  all('.poll-date-choice').forEach(x=>x.onchange=()=>{if(x.checked){const no= document.querySelector('.poll-unavailable-choice');if(no)no.checked=false}});
  const noChoice=document.querySelector('.poll-unavailable-choice');if(noChoice)noChoice.onchange=()=>{if(noChoice.checked)all('.poll-date-choice').forEach(x=>x.checked=false)};
  all('.poll-option .map-link').forEach(link=>link.onclick=event=>event.stopPropagation());
  all('[data-poll-delete]').forEach(b=>b.onclick=e=>{e.preventDefault();deletePollOption(b.dataset.pollDelete)});
  const cp=$('confirmPollOption');
  if(cp){
    const hasCurrentEventOption=options.some(o=>o.id===state.nextEvent?.optionId),current=cp.value||(hasCurrentEventOption?state.nextEvent.optionId:'');
    cp.innerHTML='<option value="">請選擇已確定的日期</option>'+options.map(o=>`<option value="${o.id}">${esc(pollOptionLabel(o))}</option>`).join('');
    cp.value=options.some(o=>o.id===current)?current:'';
    if(hasCurrentEventOption){$('confirmLocation').value=state.nextEvent.location||'';$('confirmLocation').dataset.autoVenue='0';$('confirmEventNote').value=state.nextEvent.note||'';$('confirmRentalTotal').value=state.nextEvent.rentalTotal||'';$('confirmEndTime').value=state.nextEvent.endTime||''}
    $('clearNextEvent').disabled=!state.nextEvent?.date;
    $('editNextEventFromPoll').disabled=!state.nextEvent?.date;
    updateConfirmFeePreview();
  }
  updateVenueMapPreviews();schedulePollDeadlineTimer(poll);renderPollNotice();
}
async function addPollOption(){const date=$('pollDate').value,time=$('pollTime').value,endTime=$('pollEndTime').value,note=$('pollNote').value.trim(),button=$('addPollOption');if(isPollClosed(state.schedulePoll))return alert('請先建立新投票。');if(!date)return alert('請先選擇候選日期。');if(!time)return alert('請設定開始時間。');if(!endTime)return alert('請設定結束時間。');if(endTime<=time)return alert('結束時間必須晚於開始時間。');if(state.schedulePoll.options.some(o=>o.date===date&&o.time===time&&o.endTime===endTime))return alert('這個日期與時間已經存在。');state.schedulePoll.createdAt=state.schedulePoll.createdAt||new Date().toISOString();state.schedulePoll.options.push({id:randomToken(),date,time,endTime,note});state.schedulePoll.options.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));$('pollNote').value='';renderPoll();renderDashboard();button.disabled=true;try{await saveNow()}catch(error){alert(`候選日期已保留在這台裝置，但暫時無法同步：${formatError(error)}`);saveSoon()}finally{button.disabled=false}}
function deletePollOption(id){if(!confirm('刪除這個候選日期？相關票數也會移除。'))return;state.schedulePoll.options=state.schedulePoll.options.filter(o=>o.id!==id);for(const key of Object.keys(state.schedulePoll.votes||{}))state.schedulePoll.votes[key]=pollSelectionList(state.schedulePoll.votes[key]).filter(x=>x!==id).join('|');renderPoll();saveSoon()}
async function nextEventPushMessage(publishedAt){
  try{
    const result=await pushApi('event-announcement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId,hostToken,publishedAt})});
    if(result.failed)return `\n已送達 ${result.sent} 台裝置，另有 ${result.failed} 台暫時未送達。`;
    if(result.sent)return `\n已推送通知給 ${result.sent} 台裝置。`;
    if(result.skipped)return '\n這次球局公告先前已推送完成。';
    return '\n目前沒有已開啟通知的裝置。';
  }catch(error){
    return `\n球局公告已發布，但通知暫時未送出：${error.message||'請稍後再試。'}`;
  }
}
async function saveNextEventEdits(){
  if(!isHost||!state.nextEvent?.date)return alert('目前沒有可編輯的下一次打球公告。');
  const date=$('editNextEventDate').value,time=$('editNextEventTime').value,endTime=$('editNextEventEndTime').value,location=$('editNextEventLocation').value.trim(),note=$('editNextEventNote').value.trim();
  if(!date)return alert('請設定打球日期。');
  if(!time)return alert('請設定開始時間。');
  if(!endTime)return alert('請設定結束時間。');
  if(endTime<=time)return alert('結束時間必須晚於開始時間。');
  if(!location)return alert('請填寫場地。');
  const {rentalTotal,participantCount,perPersonFee}=updateNextEventEditFeePreview();
  if(!rentalTotal)return alert('請填寫場租總額。');
  if(!participantCount)return alert('請填寫預計參與總人數。');
  const summary=`${formatEventDate(date,time,endTime)}\n${location}${note?`\n場地備註：${note}`:''}\n預計 ${participantCount} 人｜每人 ${formatMoney(perPersonFee)} 元`;
  if(!confirm(`確定更新下一次打球公告？\n\n${summary}`))return;
  const button=$('saveNextEventEdits'),previous={...state.nextEvent},publishedAt=new Date().toISOString();
  button.disabled=true;button.textContent='正在儲存…';
  state.nextEvent={...previous,date,time,endTime,location,note,rentalTotal,participantCount,perPersonFee,publishedAt};
  renderDashboard();renderPoll();
  try{
    await saveNow();
    closeNextEventEditor();
    const pushMessage=await nextEventPushMessage(publishedAt);
    alert(`下一次打球公告已更新。\n預計參與 ${participantCount} 人，每人需繳 ${formatMoney(perPersonFee)} 元。${pushMessage}`);
  }catch(error){
    state.nextEvent=previous;
    renderDashboard();renderPoll();
    alert(`公告更新失敗：${formatError(error)}`);
  }finally{
    button.disabled=false;button.textContent='儲存並通知球友';
  }
}
async function confirmNextEvent(){
  if(!isHost)return alert('只有管理員可以結束投票。');
  const optionId=$('confirmPollOption').value,option=(state.schedulePoll.options||[]).find(o=>o.id===optionId),endTime=$('confirmEndTime').value,location=$('confirmLocation').value.trim(),note=$('confirmEventNote').value.trim();
  if(!option)return alert('請先選擇已確定的日期與開始時間。');
  if(!endTime)return alert('請設定結束時間。');
  if(endTime<=option.time)return alert('結束時間必須晚於開始時間。');
  if(!location)return alert('請填寫已預約的場地。');
  const {rentalTotal,participantCount,perPersonFee}=updateConfirmFeePreview();
  if(!rentalTotal)return alert('請填寫場租總金額。');
  if(!participantCount)return alert('這個日期目前沒有投票參加者，無法計算每人費用。');
  const summary=`${formatEventDate(option.date,option.time,endTime)}\n${location}${note?`\n場地備註：${note}`:''}\n場租 ${formatMoney(rentalTotal)} 元｜每人 ${formatMoney(perPersonFee)} 元\n\n結束後會刪除全部候選日期與票數。`;
  if(!confirm(`確定發布球局並結束投票？\n\n${summary}`))return;
  const button=$('confirmNextEvent'),publishedAt=new Date().toISOString();
  button.disabled=true;button.textContent='發布球局中…';
  let finalEvent=null,finalFee=perPersonFee;
  try{
    await runTransaction(db,async tx=>{
      const snapshot=await tx.get(roomRef);
      if(!snapshot.exists())throw new Error('球局不存在。');
      const remote=snapshot.data(),poll=remote.schedulePoll||{};
      if(isPollClosed(poll))throw new Error('這次投票已由另一台裝置結束。');
      const remoteOption=(Array.isArray(poll.options)?poll.options:[]).find(item=>item.id===optionId);
      if(!remoteOption)throw new Error('候選日期已變更，請重新確認。');
      const remoteParticipants=new Set();
      for(const [deviceHash,value] of Object.entries(poll.votes||{})){
        if(!pollSelectionList(value).includes(optionId))continue;
        remoteParticipants.add(poll.voterPlayers?.[deviceHash]||deviceHash);
      }
      if(!remoteParticipants.size)throw new Error('這個日期目前沒有投票參加者，無法計算每人費用。');
      finalFee=calculatePerPersonFee(rentalTotal,remoteParticipants.size);
      finalEvent={optionId:remoteOption.id,date:remoteOption.date,time:remoteOption.time||'',endTime,location,note,rentalTotal,participantCount:remoteParticipants.size,perPersonFee:finalFee,publishedAt};
      tx.update(roomRef,{nextEvent:finalEvent,schedulePoll:{status:'closed',createdAt:poll.createdAt||'',deadlineAt:'',options:[],votes:{},voterPlayers:{}},updatedAt:serverTimestamp()});
    });
    state.nextEvent=finalEvent;
    state.schedulePoll={status:'closed',createdAt:state.schedulePoll.createdAt||'',deadlineAt:'',options:[],votes:{},voterPlayers:{}};
    renderDashboard();renderPoll();setSync('已同步','online');
  }catch(error){
    button.disabled=false;button.textContent='確認並結束投票';
    alert(error.message||formatError(error));
    return;
  }
  const pushMessage=await nextEventPushMessage(publishedAt);
  button.disabled=false;button.textContent='確認並結束投票';
  alert(`已結束投票並發布球局。\n每人需繳 ${formatMoney(finalFee)} 元。${pushMessage}`);
}
function clearNextEvent(){if(!state.nextEvent)return;if(!confirm('確定取消總覽中的下一次打球公告？'))return;state.nextEvent=null;closeNextEventEditor();renderDashboard();renderPoll();saveSoon()}
async function startNewPoll(){if(!confirm('建立新投票？目前的球局公告會保留在總覽。'))return;state.schedulePoll={status:'open',createdAt:new Date().toISOString(),deadlineAt:'',options:[],votes:{},voterPlayers:{}};['confirmPollOption','confirmEndTime','confirmLocation','confirmRentalTotal','confirmPerPersonFee','confirmEventNote'].forEach(id=>{const input=$(id);if(input)input.value=''});renderPoll();renderDashboard();try{await saveNow();alert('新投票已建立，現在可以新增候選日期。')}catch(error){saveSoon();alert(`新投票已建立，但雲端同步尚未完成：${formatError(error)}`)}}
async function submitPollVote(){
  if(isPollClosed(state.schedulePoll))return alert('投票已截止。');
  const voterId=$('pollVoter').value;
  if(!voterId)return alert('請先選擇你的姓名。');
  const selected=all('.poll-choice:checked').map(x=>x.value);
  const btn=$('submitVote');
  btn.disabled=true;btn.textContent='儲存中…';setSync('同步中');
  try{
    await runTransaction(db,async tx=>{
      const snap=await tx.get(roomRef);
      if(!snap.exists())throw new Error('球局不存在。');
      const remote=snap.data();
      const poll=remote.schedulePoll&&typeof remote.schedulePoll==='object'?remote.schedulePoll:{status:'open',deadlineAt:'',options:[],votes:{},voterPlayers:{}};
      if(isPollClosed(poll))throw new Error('投票已截止。');
      const validIds=new Set([...(Array.isArray(poll.options)?poll.options:[]).map(o=>o.id),POLL_UNAVAILABLE]);
      const validSelected=selected.filter(id=>validIds.has(id));
      const votes={...(poll.votes&&typeof poll.votes==='object'?poll.votes:{})};
      const voterPlayers={...(poll.voterPlayers&&typeof poll.voterPlayers==='object'?poll.voterPlayers:{})};
      votes[selfHash]=validSelected.join('|');
      voterPlayers[selfHash]=voterId;
      tx.update(roomRef,{schedulePoll:{status:poll.status||'open',createdAt:poll.createdAt||'',deadlineAt:poll.deadlineAt||'',options:Array.isArray(poll.options)?poll.options:[],votes,voterPlayers},updatedAt:serverTimestamp()});
    });
    state.schedulePoll.votes[selfHash]=selected.join('|');
    state.schedulePoll.voterPlayers[selfHash]=voterId;
    renderPoll();setSync('已同步','online');
    alert(selected.includes(POLL_UNAVAILABLE)?'已記錄為無法參加。':selected.length?'投票已更新。':'已取消本裝置的投票。');
  }catch(e){
    setSync('同步失敗','error');setError(formatError(e));alert(formatError(e));
  }finally{
    btn.textContent='送出／更新投票';
    btn.disabled=isPollClosed(state.schedulePoll)||!(state.schedulePoll.options||[]).length;
  }
}
function savePollDeadline(){const input=$('pollDeadline'),value=input.value;if(!value)return alert('請先選擇投票截止日期與時間。');const deadline=new Date(value);if(isNaN(deadline.getTime()))return alert('投票截止時間格式不正確。');if(deadline.getTime()<=Date.now())return alert('投票截止時間必須晚於現在。');const wasExpired=isPollDeadlinePassed(state.schedulePoll);state.schedulePoll.deadlineAt=deadline.toISOString();if(wasExpired)state.schedulePoll.status='open';renderPoll();renderDashboard();saveSoon();alert(`投票截止時間已設定為 ${formatPollDeadline(state.schedulePoll.deadlineAt)}。`)}
function clearPollDeadline(){const poll=state.schedulePoll;if(!poll.deadlineAt)return;const wasExpired=isPollDeadlinePassed(poll);poll.deadlineAt='';if(wasExpired)poll.status='open';renderPoll();renderDashboard();saveSoon()}
function setError(msg=''){const b=$('cloudError');b.textContent=msg;b.classList.toggle('hidden',!msg)}function setLandingError(msg=''){const b=$('landingError');b.textContent=msg;b.classList.toggle('hidden',!msg)}
function setSync(text,type=''){
  const mainBadge=$('syncBadge'),scoreBadge=$('scoreSyncBadge');
  mainBadge.textContent=text;mainBadge.className='pill '+type;
  if(scoreBadge){
    const scoreText=type==='online'?'即時連線':type==='pending'?'同步中':type==='offline'?'離線計分':type==='error'?'同步中斷':text;
    scoreBadge.textContent=scoreText;scoreBadge.className='score-sync-badge '+type;
  }
}
function updateSyncBadge(){
  if(!roomRef)return;
  const pending=roomWriteScheduled||liveScoreWriteScheduled||pendingRoomWrites>0||pendingLiveScoreWrites>0||snapshotHasPendingWrites||liveScoreHasPendingWrites||liveScoreConnecting;
  if(!navigator.onLine||roomSnapshotFromCache||(liveScoreReady&&liveScoreSnapshotFromCache))return setSync(isHost?'離線計分中':'離線瀏覽中','offline');
  if(pending)return setSync('正在補同步','pending');
  setSync('已同步','online');
}
window.addEventListener('offline',()=>{updateSyncBadge();renderChat()});
window.addEventListener('online',()=>{if(roomRef){setSync('重新連線中','pending');setError('')}renderChat()});
function formatError(e){const code=e?.code||'unknown';if(!navigator.onLine&&(code==='unavailable'||code==='not-found'))return '目前沒有網路，而且這台裝置尚未快取此球局。請先連線進入一次，之後即可離線使用。';if(code==='permission-denied')return 'Firestore 權限被拒絕（permission-denied）。請到 Firebase → Firestore → 規則，發布 ZIP 內 FIRESTORE_RULES.txt 的內容。';if(code==='invalid-argument'&&String(e?.message||'').includes('Nested arrays'))return '資料格式錯誤：Firestore 不支援巢狀陣列。請部署 BCM 2.2.18 Two-Digit Score Fix 最新版。';return `Firebase 連線失敗：${code}\n${e?.message||e}`}
function hostKey(id){return `bcmHost_${id}`}
function currentUrl(id=roomId){const u=new URL(location.href);u.search='';u.hash='';if(requestedAndroidRemote)u.searchParams.set('androidRemote','1');u.searchParams.set('room',id);return u.toString()}
function hostUrl(id=roomId,token=hostToken){const u=new URL(currentUrl(id));u.hash=`host=${encodeURIComponent(token)}`;return u.toString()}
function parseHostHash(){const m=location.hash.match(/(?:^#|&)host=([^&]+)/);return m?decodeURIComponent(m[1]):''}


const ROOM_LIBRARY_KEY='bcmRoomLibraryV1',ROOM_AUTO_KEY='bcmAutoReturnRoomV1',ROOM_SKIP_AUTO_ONCE='bcmSkipAutoReturnOnceV1';
const randomSyncCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';crypto.getRandomValues(new Uint32Array(10)).forEach(n=>code+=chars[n%chars.length]);return code};
function cleanRoomRows(rows){return(Array.isArray(rows)?rows:[]).filter(r=>r&&/^[A-Z0-9]{6}$/.test(r.id||'')).slice(0,20).map(r=>({id:r.id,name:String(r.name||'').slice(0,30),favorite:!!r.favorite,lastUsed:Number(r.lastUsed)||0,lastRole:r.lastRole==='host'?'host':'viewer',hostToken:String(r.hostToken||'').slice(0,128),modifiedAt:Number(r.modifiedAt)||Number(r.lastUsed)||Date.now()}))}
function mergeRoomLibraries(localRows,cloudRows){const merged=new Map();for(const room of [...cleanRoomRows(cloudRows),...cleanRoomRows(localRows)]){const old=merged.get(room.id);if(!old){merged.set(room.id,room);continue}const latest=room.modifiedAt>=old.modifiedAt?room:old,older=latest===room?old:room,hostToken=latest.hostToken||older.hostToken||'';merged.set(room.id,{...latest,hostToken,lastRole:hostToken?'host':latest.lastRole,lastUsed:Math.max(latest.lastUsed,older.lastUsed)})}return cleanRoomRows([...merged.values()].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed))}
function roomLibrary(){try{return cleanRoomRows(JSON.parse(localStorage.getItem(ROOM_LIBRARY_KEY)||'[]'))}catch{return[]}}
function deviceSyncCode(){return String(localStorage.getItem(DEVICE_SYNC_CODE_KEY)||'').toUpperCase()}
function deviceProfileRef(code=deviceSyncCode()){return code?doc(db,'badmintonRooms',`DEVICE-PROFILE-${code}`):null}
function updateDeviceSyncControls(){const code=deviceSyncCode(),name=localStorage.getItem(DEVICE_SYNC_NAME_KEY)||'';for(const id of['deviceSyncBtn','landingDeviceSyncBtn']){const button=$(id);if(!button)continue;button.classList.toggle('synced',!!code);button.textContent=code?`👤 ${name||'已同步'}`:id==='landingDeviceSyncBtn'?'👤 同步我的其他裝置':'👤 裝置同步'}if($('copyDeviceSyncBtn'))$('copyDeviceSyncBtn').classList.toggle('hidden',!code)}
function queueDeviceProfileSave(){if(deviceProfileApplying||!deviceSyncCode()||!navigator.onLine)return;clearTimeout(deviceProfileSaveTimer);deviceProfileSaveTimer=setTimeout(()=>syncDeviceProfileNow().catch(error=>console.warn('Device profile sync failed',error)),260)}
function saveRoomLibrary(rows,{cloud=true}={}){const clean=cleanRoomRows(rows);localStorage.setItem(ROOM_LIBRARY_KEY,JSON.stringify(clean));if(cloud)queueDeviceProfileSave();return clean}
async function syncDeviceProfileNow(){const code=deviceSyncCode(),identityToken=localStorage.getItem(DEVICE_SYNC_TOKEN_KEY)||'',ref=deviceProfileRef(code);if(!ref||!identityToken)return;clearTimeout(deviceProfileSaveTimer);deviceProfileSaveTimer=null;let merged=roomLibrary();await runTransaction(db,async tx=>{const snapshot=await tx.get(ref),profile=snapshot.exists()?snapshot.data():{};if(profile.identityToken&&profile.identityToken!==identityToken)throw new Error('裝置同步身分不一致。');merged=mergeRoomLibraries(merged,profile.rooms);const displayName=localStorage.getItem(DEVICE_SYNC_NAME_KEY)||profile.displayName||'潘建昱',playerName=localStorage.getItem(DEVICE_SYNC_PLAYER_KEY)||profile.playerName||displayName;tx.set(ref,{displayName,playerName,identityToken,rooms:merged,updatedAt:serverTimestamp()},{merge:true})});applyCloudRoomLibrary(merged)}
function applyCloudRoomLibrary(rows){deviceProfileApplying=true;const cloud=cleanRoomRows(rows),clean=mergeRoomLibraries(roomLibrary(),cloud);saveRoomLibrary(clean,{cloud:false});for(const room of clean)if(room.hostToken)localStorage.setItem(hostKey(room.id),room.hostToken);const latest=[...clean].sort((a,b)=>b.lastUsed-a.lastUsed)[0];if(latest)localStorage.setItem('bcmLastRoomV1',latest.id);renderRoomLibrary();updateCurrentRoomControls();deviceProfileApplying=false;if(JSON.stringify(clean)!==JSON.stringify(cloud))queueDeviceProfileSave()}
async function initializeDeviceProfileSync(){updateDeviceSyncControls();const code=deviceSyncCode(),token=localStorage.getItem(DEVICE_SYNC_TOKEN_KEY)||'',ref=deviceProfileRef(code);if(!ref||!token)return;deviceProfileUnsubscribe?.();deviceProfileUnsubscribe=onSnapshot(ref,snapshot=>{if(!snapshot.exists())return;const profile=snapshot.data();if(profile.identityToken!==token)return;if(profile.displayName)localStorage.setItem(DEVICE_SYNC_NAME_KEY,profile.displayName);if(profile.playerName)localStorage.setItem(DEVICE_SYNC_PLAYER_KEY,profile.playerName);applyCloudRoomLibrary(profile.rooms);updateDeviceSyncControls();ensureSyncedPlayerIdentity().catch(error=>console.warn('Player identity sync failed',error))},error=>console.warn('Device profile listener failed',error))}
async function setupDeviceSync(){
  const current=deviceSyncCode();
  let input=prompt(current?'目前的裝置同步碼如下。若要改連其他使用者，請輸入新的同步碼：':'若其他裝置已建立同步，請輸入同步碼；這是第一台請直接留白建立：',current);
  if(input===null)return;
  input=input.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(current&&input===current)return copyDeviceSyncCode();
  if(input){
    const snapshot=await getDoc(deviceProfileRef(input)).catch(()=>null);
    if(!snapshot?.exists())return alert('找不到這組裝置同步碼。');
    const profile=snapshot.data();
    if(!profile.identityToken)return alert('同步資料不完整，請在第一台裝置重新建立。');
    localStorage.setItem(DEVICE_SYNC_CODE_KEY,input);localStorage.setItem(DEVICE_SYNC_TOKEN_KEY,profile.identityToken);localStorage.setItem(DEVICE_SYNC_NAME_KEY,profile.displayName||'潘建昱');localStorage.setItem(DEVICE_SYNC_PLAYER_KEY,profile.playerName||profile.displayName||'潘建昱');localStorage.setItem(ROOM_AUTO_KEY,'1');
    applyCloudRoomLibrary(profile.rooms);
    await syncDeviceProfileNow();
    alert(`已連結「${profile.displayName||'潘建昱'}」。重新開啟後會套用相同身分與球局清單。`);
    return location.reload();
  }
  const owned=ownedPlayerId(),defaultName=localStorage.getItem(DEVICE_SYNC_NAME_KEY)||(owned?pname(owned):'潘建昱'),name=(prompt('請輸入三台裝置共同使用的球員姓名：',defaultName)||'').trim();
  if(!name)return;
  const code=randomSyncCode(),identityToken=randomToken(),ref=deviceProfileRef(code);
  await setDoc(ref,{displayName:name,playerName:name,identityToken,rooms:roomLibrary(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  localStorage.setItem(DEVICE_SYNC_CODE_KEY,code);localStorage.setItem(DEVICE_SYNC_TOKEN_KEY,identityToken);localStorage.setItem(DEVICE_SYNC_NAME_KEY,name);localStorage.setItem(DEVICE_SYNC_PLAYER_KEY,name);localStorage.setItem(ROOM_AUTO_KEY,'1');
  try{await navigator.clipboard.writeText(code)}catch{}
  alert(`已建立「${name}」裝置同步。\n\n同步碼：${code}\n\n同步碼已複製；請在另外兩台裝置的「更多 → 裝置同步」輸入一次。`);
  location.reload();
}
async function copyDeviceSyncCode(){const code=deviceSyncCode();if(!code)return setupDeviceSync();try{await navigator.clipboard.writeText(code);alert(`裝置同步碼已複製：${code}`)}catch{prompt('複製這組裝置同步碼：',code)}}
async function ensureSyncedPlayerIdentity(){if(!canAutoSyncPlayerIdentity({syncing:identitySyncing,roomReady:!!roomRef,hasIdentity:!!selfHash,fromCache:roomSnapshotFromCache,hasPendingWrites:snapshotHasPendingWrites}))return;const name=(localStorage.getItem(DEVICE_SYNC_PLAYER_KEY)||localStorage.getItem(DEVICE_SYNC_NAME_KEY)||'').trim();if(!name)return;const p=state.roster.find(item=>item.name.trim()===name);if(!p||p.ownerHash===selfHash)return;identitySyncing=true;try{const updated={...p,ownerHash:selfHash};await saveSelfPlayer(updated);state.roster=state.roster.map(item=>item.id===p.id?updated:item);$('selfNote').textContent=`三台裝置已共同使用「${name}」身分。`;$('selfNote').classList.remove('hidden');renderRoster()}finally{identitySyncing=false}}
function roomRecord(id){return roomLibrary().find(r=>r.id===id)||null}
function roomDisplayName(r){return r?.name?.trim()||`7B 球局 ${r?.id||''}`}
function rememberRoom(id,host=false){const now=Date.now(),rows=roomLibrary();const old=rows.find(r=>r.id===id)||{};const next={id,name:old.name||'',favorite:!!old.favorite,lastUsed:now,lastRole:host?'host':'viewer',hostToken:host?(hostToken||old.hostToken||''):(old.hostToken||''),modifiedAt:now};saveRoomLibrary([next,...rows.filter(r=>r.id!==id)].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed));localStorage.setItem('bcmLastRoomV1',id);renderRoomLibrary();return next}
function updateRoomRecord(id,patch){const rows=roomLibrary(),idx=rows.findIndex(r=>r.id===id),now=Date.now();if(idx<0)rows.unshift({id,name:'',favorite:false,lastUsed:now,lastRole:'viewer',hostToken:'',...patch,modifiedAt:now});else rows[idx]={...rows[idx],...patch,modifiedAt:now};saveRoomLibrary(rows.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed));renderRoomLibrary();if(id===roomId)updateCurrentRoomControls()}
function forgetRoom(id){const r=roomRecord(id);if(!confirm(`確定從這台裝置移除「${roomDisplayName(r)}」？\n不會刪除 Firebase 裡的球局資料。`))return;saveRoomLibrary(roomLibrary().filter(x=>x.id!==id));if(localStorage.getItem('bcmLastRoomV1')===id)localStorage.removeItem('bcmLastRoomV1');localStorage.removeItem(hostKey(id));renderRoomLibrary()}
async function openSavedRoom(id){if(roomConnectInProgress)return;const room=roomRecord(id);if(room?.hostToken)localStorage.setItem(hostKey(id),room.hostToken);setLandingError('');history.replaceState(null,'',currentUrl(id));await connectRoom(id)}
function roomTime(ts){if(!ts)return'';const d=new Date(ts),today=new Date();const day=Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);if(day===0)return'今天使用';if(day===1)return'昨天使用';if(day<7)return`${day} 天前使用`;return d.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'})}
function savedRoomCard(r){return `<div class="saved-room ${r.favorite?'favorite':''}"><div class="saved-room-main"><div class="saved-room-name">${r.favorite?'⭐ ':''}${esc(roomDisplayName(r))}</div><div class="saved-room-meta">房號 ${esc(r.id)} · ${r.lastRole==='host'?'管理員':'觀看者'} · ${esc(roomTime(r.lastUsed))}</div></div><div class="saved-room-actions"><button class="btn primary" data-open-room="${r.id}">直接進入</button><button class="btn" data-toggle-room="${r.id}">${r.favorite?'取消常用':'加入常用'}</button><button class="btn danger-outline" data-forget-room="${r.id}">忘記</button></div></div>`}
function bindRoomLibraryActions(){all('[data-open-room]').forEach(b=>b.onclick=()=>openSavedRoom(b.dataset.openRoom));all('[data-toggle-room]').forEach(b=>b.onclick=()=>{const r=roomRecord(b.dataset.toggleRoom);updateRoomRecord(b.dataset.toggleRoom,{favorite:!r?.favorite})});all('[data-forget-room]').forEach(b=>b.onclick=()=>forgetRoom(b.dataset.forgetRoom))}
function renderRoomLibrary(){const rows=roomLibrary().sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed),lastId=localStorage.getItem('bcmLastRoomV1'),last=rows.find(r=>r.id===lastId)||rows[0],cont=$('continueRoom'),fav=$('favoriteRooms'),recent=$('recentRooms');if(cont){cont.classList.toggle('hidden',!last);cont.innerHTML=last?`<strong>回到上次球局</strong><div style="font-size:1.25rem;font-weight:1000;margin-top:5px">${esc(roomDisplayName(last))}</div><div class="sub">房號 ${esc(last.id)} · ${esc(roomTime(last.lastUsed))}</div><button class="btn" data-open-room="${last.id}">繼續使用</button>`:''}const favorites=rows.filter(r=>r.favorite),recents=rows.filter(r=>!r.favorite).slice(0,5);if(fav){fav.classList.toggle('hidden',!favorites.length);fav.innerHTML=favorites.length?`<div class="room-library-title"><h3>⭐ 常用球局</h3></div>${favorites.map(savedRoomCard).join('')}`:''}if(recent){recent.classList.toggle('hidden',!recents.length);recent.innerHTML=recents.length?`<div class="room-library-title"><h3>最近加入</h3></div>${recents.map(savedRoomCard).join('')}`:''}bindRoomLibraryActions()}
function updateCurrentRoomControls(){if(!roomId)return;const r=roomRecord(roomId)||{id:roomId};$('favoriteRoomBtn').textContent=r.favorite?'★ 已加入常用':'☆ 加入常用';$('roomLocalName').textContent=r.name?` · ${r.name}`:''}
function showRoomCreationError(message){if(!$('app').classList.contains('hidden'))alert(message);else setLandingError(message)}
async function createRoom(){setLandingError('');let pin=prompt('請設定 4～8 位管理員 PIN。之後可在 iPad 或其他裝置輸入 PIN 進入管理員模式：','2580');if(pin===null)return;pin=pin.trim();if(!/^\d{4,8}$/.test(pin))return showRoomCreationError('管理員 PIN 請輸入 4～8 位數字。');const id=randomCode(),token=randomToken(),ref=doc(db,'badmintonRooms',id),initial=initialState();const pinHash=await sha256(pin);const data={...encodeState(initial),liveScoreEnabled:true,liveScoreMatchKey:liveMatchKey(initial.match),hostToken:token,adminPinHash:pinHash,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};try{await setDoc(ref,data);await setDoc(doc(db,'badmintonRooms',id,'liveScore','current'),{...createLiveScoreData(initial.match),updatedAt:serverTimestamp()}).catch(error=>console.warn('即時比分初始化失敗，暫時使用完整同步',error));localStorage.setItem(hostKey(id),token);updateRoomRecord(id,{lastRole:'host',hostToken:token,lastUsed:Date.now()});await syncDeviceProfileNow().catch(()=>{});history.replaceState(null,'',currentUrl(id));await connectRoom(id)}catch(e){showRoomCreationError(formatError(e))}}
async function enterRoom(id){id=id.trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);if(id.length!==6)return showRoomCreationError('請輸入正確的 6 位房間代碼。');setLandingError('');history.replaceState(null,'',currentUrl(id));await connectRoom(id)}
async function connectRoom(id){
  if(roomConnectInProgress)return;
  roomConnectInProgress=true;
  unsubscribe?.();unsubscribe=null;
  liveScoreUnsubscribe?.();liveScoreUnsubscribe=null;
  chatUnsubscribe?.();chatUnsubscribe=null;
  chatCollectionRef=null;chatMessages=[];chatMentionIds.clear();chatFirstRender=true;chatRequestRunning=false;
  clearTimeout(saveTimer);saveTimer=null;
  clearTimeout(liveScoreSaveTimer);liveScoreSaveTimer=null;
  scoreSnapshotReady=false;
  roomId=id;
  roomRef=doc(db,'badmintonRooms',id);
  liveScoreRef=doc(db,'badmintonRooms',id,'liveScore','current');
  liveScoreReady=false;liveScoreInitialSnapshot=true;liveScoreMigrationStarted=false;liveScoreAvailable=true;liveScoreConnecting=true;latestLiveMatch=null;lastRoomSnapshotData=null;
  liveScoreSnapshotFromCache=false;liveScoreHasPendingWrites=false;pendingLiveScoreWrites=0;liveScoreWriteScheduled=false;
  selfHash=await sha256(selfToken);
  setSync(navigator.onLine?'連線中':'讀取離線資料','pending');
  try{
    const snap=await getDoc(roomRef);
    if(!snap.exists())throw Object.assign(new Error('找不到此房間'),{code:'not-found'});
    roomSnapshotFromCache=!!snap.metadata?.fromCache;
    snapshotHasPendingWrites=!!snap.metadata?.hasPendingWrites;
    const data=snap.data();
    lastRoomSnapshotData=data;
    adminPinHash=data.adminPinHash||'';
    hostToken=parseHostHash()||localStorage.getItem(hostKey(id))||'';
    isHost=!!hostToken&&hostToken===data.hostToken;
    if(isHost)localStorage.setItem(hostKey(id),hostToken);
    rememberRoom(id,isHost);
    if(requestedAndroidRemote)localStorage.setItem(ROOM_AUTO_KEY,'1');
    applyState(data);
    $('landing').classList.add('hidden');
    $('app').classList.toggle('hidden',requestedAndroidRemote);
    $('roomCode').textContent=id;
    $('scoreRoom').textContent=id;
    updateCurrentRoomControls();
    $('roleBadge').textContent=isHost?'管理員':'觀看者';
    $('roleBadge').className='pill '+(isHost?'host':'');
    $('viewerNote').classList.toggle('hidden',isHost);
    applyRole();
    renderAndroidRemote();
    updatePushNotificationButton();
    reconcilePushSubscription().finally(()=>setTimeout(maybeShowPushNotificationPrompt,650));
    ensureSyncedPlayerIdentity().catch(error=>console.warn('Player identity sync failed',error));
    startChatSync();
    if(requestedPage==='poll')page(6);
    if(requestedPage==='chat')page(8);
    unsubscribe=onSnapshot(roomRef,{includeMetadataChanges:true},s=>{
      if(!s.exists())return;
      lastRoomSnapshotData=s.data();
      roomSnapshotFromCache=!!s.metadata.fromCache;
      snapshotHasPendingWrites=!!s.metadata.hasPendingWrites;
      applyState(lastRoomSnapshotData);
      if(!roomSnapshotFromCache&&!snapshotHasPendingWrites)ensureSyncedPlayerIdentity().catch(error=>console.warn('Player identity sync failed',error));
      updateSyncBadge();
      if(!roomSnapshotFromCache&&!snapshotHasPendingWrites)setError('');
    },e=>{setSync(navigator.onLine?'同步中斷':isHost?'離線計分中':'離線瀏覽中',navigator.onLine?'error':'offline');setError(formatError(e))});
    liveScoreUnsubscribe=onSnapshot(liveScoreRef,{includeMetadataChanges:true},snapshot=>{
      liveScoreConnecting=false;
      liveScoreSnapshotFromCache=!!snapshot.metadata.fromCache;
      liveScoreHasPendingWrites=!!snapshot.metadata.hasPendingWrites;
      if(!snapshot.exists()){
        liveScoreReady=false;latestLiveMatch=null;
        if(isHost&&!snapshot.metadata.fromCache&&!liveScoreMigrationStarted)void initializeLiveScoreDocument();
        updateSyncBadge();
        return;
      }
      applyLiveScoreState(snapshot.data(),{announce:!liveScoreInitialSnapshot});
      liveScoreInitialSnapshot=false;
      updateSyncBadge();
    },error=>{
      liveScoreConnecting=false;liveScoreAvailable=false;liveScoreReady=false;latestLiveMatch=null;
      if(lastRoomSnapshotData)applyState(lastRoomSnapshotData);
      updateSyncBadge();
      console.warn('獨立即時比分無法連線，已切回完整房間同步',error);
    });
    updateSyncBadge();
    if(isHost&&navigator.onLine)setTimeout(ensureGenesisAndDaily,900);
  }catch(e){
    liveScoreConnecting=false;
    chatUnsubscribe?.();chatUnsubscribe=null;chatCollectionRef=null;
    setLandingError(formatError(e));
    history.replaceState(null,'',location.pathname);
  }finally{
    roomConnectInProgress=false;
  }
}
function applyRole(){all('.host-only').forEach(el=>el.classList.toggle('hidden',!isHost));if(!isHost){$('resultModal').classList.add('hidden');$('scoreView').classList.add('hidden');$('nextEventEditModal')?.classList.add('hidden')}$('adminLoginBtn').classList.toggle('hidden',isHost);$('scoreRole').textContent=isHost?'管理員':'觀看模式';$('scoreA').classList.toggle('clickable',isHost);$('scoreB').classList.toggle('clickable',isHost);all('input,select,textarea').forEach(el=>{if(['editName','editRacket','editRacketTension','editRacketString','editBackupRacket','editBackupTension','editBackupString','editNote','editPhoto','joinCode','playerSearch','playerSort'].includes(el.id)||el.classList.contains('viewer-enabled'))return;if(!isHost)el.disabled=true;else el.disabled=false});if($('editVoiceName'))$('editVoiceName').disabled=!isHost}
function cleanState(d){return decodeState(d)}
function matchScoreSignature(source=state){const match=source?.match||{};return `${!!match.active}|${(match.rallies||[]).join('')}|${match.winner??''}`}
function announceSyncedScore(before,announce=true){const changed=before!==matchScoreSignature(),scoreVisible=!$('scoreView')?.classList.contains('hidden');if(shouldAnnounceSyncedLiveScore({announce,snapshotReady:scoreSnapshotReady,changed,scoreVisible,androidRemote:requestedAndroidRemote,matchActive:state.match.active,voiceEnabled}))setTimeout(announceScore,120);scoreSnapshotReady=true}
function applyState(data){const before=matchScoreSignature(),next=cleanState(data),legacyMatchChanged=!!data.liveScoreEnabled&&!!data.liveScoreMatchKey&&data.liveScoreMatchKey!==liveMatchKey(data.match);if(liveScoreReady&&latestLiveMatch&&!legacyMatchChanged)next.match=structuredClone(latestLiveMatch);else if(legacyMatchChanged)latestLiveMatch=structuredClone(next.match);applying=true;state=next;renderAll();applying=false;announceSyncedScore(before);if(legacyMatchChanged&&isHost&&liveScoreAvailable)saveLiveScoreSoon()}
function applyLiveScoreState(data,{announce=true}={}){const before=matchScoreSignature(),beforeWinner=state.match?.winner,match=decodeLiveMatch(data,state.match),shouldFinish=beforeWinner===null&&match.winner!==null&&isHost&&!requestedAndroidRemote;liveScoreReady=true;latestLiveMatch=structuredClone(match);applying=true;state.match=match;renderScore();renderDashboard();renderAndroidRemote();applying=false;announceSyncedScore(before,announce);if(shouldFinish)finishMatch()}
function payload(){return {...encodeState(state),liveScoreEnabled:true,liveScoreMatchKey:liveMatchKey(state.match),updatedAt:serverTimestamp()}}
function liveScorePayload(){return {...createLiveScoreData(state.match),updatedAt:serverTimestamp()}}
function rememberLatestLiveMatch(){latestLiveMatch=structuredClone(state.match)}
async function initializeLiveScoreDocument(){
  if(!isHost||!roomRef||!liveScoreRef||liveScoreMigrationStarted)return;
  liveScoreMigrationStarted=true;pendingLiveScoreWrites++;updateSyncBadge();rememberLatestLiveMatch();
  try{
    await Promise.all([
      setDoc(liveScoreRef,liveScorePayload(),{merge:true}),
      setDoc(roomRef,{liveScoreEnabled:true,liveScoreMatchKey:liveMatchKey(state.match),updatedAt:serverTimestamp()},{merge:true})
    ]);
    liveScoreAvailable=true;
  }catch(error){
    liveScoreAvailable=false;liveScoreReady=false;latestLiveMatch=null;
    console.warn('即時比分初始化失敗，將繼續使用完整房間同步',error);
  }finally{
    pendingLiveScoreWrites=Math.max(0,pendingLiveScoreWrites-1);updateSyncBadge();
  }
}
async function persistFullState(){
  rememberLatestLiveMatch();
  const roomWrite=setDoc(roomRef,payload(),{merge:true});
  const liveWrite=liveScoreRef&&liveScoreAvailable?setDoc(liveScoreRef,liveScorePayload(),{merge:true}):Promise.resolve();
  const [roomResult,liveResult]=await Promise.allSettled([roomWrite,liveWrite]);
  if(roomResult.status==='rejected')throw roomResult.reason;
  if(liveResult.status==='rejected'){
    liveScoreAvailable=false;liveScoreReady=false;latestLiveMatch=null;
    console.warn('獨立即時比分寫入失敗，完整房間資料已保留',liveResult.reason);
  }
}
function saveSoon(){
  if(!isHost||applying||!roomRef)return;
  clearTimeout(saveTimer);
  clearTimeout(liveScoreSaveTimer);liveScoreSaveTimer=null;liveScoreWriteScheduled=false;
  roomWriteScheduled=true;
  updateSyncBadge();
  saveTimer=setTimeout(()=>{
    roomWriteScheduled=false;
    pendingRoomWrites++;
    updateSyncBadge();
    persistFullState().then(()=>{
      pendingRoomWrites=Math.max(0,pendingRoomWrites-1);
      updateSyncBadge();
    }).catch(e=>{
      pendingRoomWrites=Math.max(0,pendingRoomWrites-1);
      setSync('同步失敗','error');
      setError(formatError(e));
    });
  },120);
}
function saveLiveScoreSoon(){
  if(!isHost||applying||!roomRef)return;
  if(!liveScoreRef||!liveScoreAvailable){saveSoon();return}
  clearTimeout(liveScoreSaveTimer);
  rememberLatestLiveMatch();liveScoreReady=true;liveScoreWriteScheduled=true;updateSyncBadge();
  liveScoreSaveTimer=setTimeout(async()=>{
    liveScoreWriteScheduled=false;pendingLiveScoreWrites++;updateSyncBadge();
    try{
      await setDoc(liveScoreRef,liveScorePayload(),{merge:true});
    }catch(error){
      liveScoreAvailable=false;liveScoreReady=false;latestLiveMatch=null;
      console.warn('即時比分寫入失敗，改用完整房間同步',error);
      await setDoc(roomRef,payload(),{merge:true});
    }finally{
      pendingLiveScoreWrites=Math.max(0,pendingLiveScoreWrites-1);updateSyncBadge();
    }
  },35);
}
async function saveNow(){
  if(!isHost||applying||!roomRef)throw new Error('只有管理員可以發布球局。');
  clearTimeout(saveTimer);saveTimer=null;roomWriteScheduled=false;
  clearTimeout(liveScoreSaveTimer);liveScoreSaveTimer=null;liveScoreWriteScheduled=false;
  pendingRoomWrites++;updateSyncBadge();
  try{
    await persistFullState();
  }catch(error){
    setSync('同步失敗','error');setError(formatError(error));throw error;
  }finally{
    pendingRoomWrites=Math.max(0,pendingRoomWrites-1);updateSyncBadge();
  }
}
function page(n){all('.page').forEach(x=>x.classList.add('hidden'));$('page'+n).classList.remove('hidden');all('.tab').forEach(x=>x.classList.toggle('active',+x.dataset.page===n));if(n===0)renderDashboard();if(n===4)renderStats();if(n===5)renderHistory();if(n===6){markPollSeen();renderPoll()}if(n===7)loadBackups();if(n===8){renderChat();markChatSeen();requestAnimationFrame(()=>{const list=$('chatMessages');if(list)list.scrollTop=list.scrollHeight})}}
function renderRoster(){const box=$('roster'),q=($('playerSearch')?.value||'').trim().toLowerCase(),sort=$('playerSort')?.value||'favorite';let rows=state.roster.filter(p=>[p.name,p.racket,p.backupRacket,p.note].some(v=>String(v||'').toLowerCase().includes(q)));rows.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='games'?playerStats(b.id).games-playerStats(a.id).games:(Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name)));box.innerHTML=rows.map(p=>{const st=playerStats(p.id),status=playerStatus(p.id),main=[p.racket,p.racketTension,p.racketString].filter(Boolean).join(' · '),backup=[p.backupRacket,p.backupTension,p.backupString].filter(Boolean).join(' · '),expanded=expandedPlayerNotes.has(p.id);return `<button class="person card2 ${p.favorite?'favorite':''} ${status.kind||''}" data-edit="${p.id}"><span class="favorite-star" data-fav="${p.id}" title="收藏">${p.favorite?'⭐':'☆'}</span>${avatar(p.id)}<span class="person-info"><span class="name">${esc(p.name)}</span><span class="person-meta"><span class="mini-tag stats" title="歷史累計">${st.wins}勝／${st.games}場</span><span class="status-mini">${esc(status.label)}</span></span><span class="racket-lines">${main?`<span class="racket-line" title="主拍 ${esc(main)}">🏸 主拍 ${esc(main)}</span>`:''}${backup?`<span class="racket-line" title="備拍 ${esc(backup)}">🏸 備拍 ${esc(backup)}</span>`:''}${!main&&!backup?`<span class="racket-line">🏸 尚未登錄球拍</span>`:''}</span>${p.note?`<span class="person-note ${expanded?'expanded':''}" data-note-toggle="${p.id}" role="button" aria-expanded="${expanded}"><span class="person-note-text">📝 ${esc(p.note)}</span><span class="person-note-toggle">${expanded?'▲ 收合':'▼ 展開'}</span></span>`:''}</span></button>`}).join('')||'<p class="sub">找不到符合條件的球員。</p>';all('[data-edit]').forEach(b=>b.onclick=e=>{if(e.target.closest('[data-fav],[data-note-toggle]'))return;openEdit(b.dataset.edit)});all('[data-fav]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const p=player(b.dataset.fav);if(!p)return;const before=!!p.favorite;p.favorite=!before;renderRoster();try{if(isHost)saveSoon();else await saveSelfPlayer({id:p.id,favorite:p.favorite})}catch(err){p.favorite=before;renderRoster();alert('收藏更新失敗：'+formatError(err))}});all('[data-note-toggle]').forEach(n=>n.onclick=e=>{e.preventDefault();e.stopPropagation();const id=n.dataset.noteToggle;if(expandedPlayerNotes.has(id))expandedPlayerNotes.delete(id);else expandedPlayerNotes.add(id);renderRoster()})}
function uniqueIds(ids){return [...new Set((ids||[]).filter(Boolean))]}
function currentCourtIds(){const live=state.match?.active?state.match.players?.flat?.()||[]:state.court||[];return uniqueIds(live)}
function reconcileWaitingQueue(excludeIds=currentCourtIds()){
  const exclude=new Set(excludeIds||[]),eligible=state.attendance.filter(id=>!exclude.has(id));
  const kept=uniqueIds(state.waitingQueue).filter(id=>eligible.includes(id));
  const missing=eligible.filter(id=>!kept.includes(id));
  state.waitingQueue=[...kept,...missing];
  state.priority=state.waitingQueue[0]||null;
}
function projectedQueueForLineup(vals){
  const selected=new Set((vals||[]).filter(Boolean));
  const ordered=uniqueIds([...(state.queueDraftChosen||[]),...(state.waitingQueue||[])]).filter(id=>state.attendance.includes(id)&&!selected.has(id));
  for(const id of state.attendance)if(!selected.has(id)&&!ordered.includes(id))ordered.push(id);
  return ordered;
}
function queueLabel(index,total){if(total%2===1&&index===0)return'⭐ 單人優先';return `候場第 ${Math.floor(index/2)+1} 組`}
function renderAttendance(){const box=$('attendance');box.innerHTML=state.roster.map(p=>{const selected=state.attendance.includes(p.id);return `<button type="button" class="person ${selected?'selected':''}" data-att="${p.id}" aria-pressed="${selected}">${avatar(p.id)}<span class="name">${esc(p.name)}</span></button>`}).join('')||'<p class="sub">請先建立球員。</p>';all('[data-att]').forEach(b=>b.onclick=()=>{if(!isHost)return;const id=b.dataset.att;state.attendance=state.attendance.includes(id)?state.attendance.filter(x=>x!==id):[...state.attendance,id];state.court=state.court.filter(x=>state.attendance.includes(x));state.waitingQueue=state.waitingQueue.filter(x=>state.attendance.includes(x));state.queueDraftChosen=state.queueDraftChosen.filter(x=>state.attendance.includes(x));reconcileWaitingQueue();renderAttendance();renderCourt();saveSoon()})}
function options(selected=''){return `<option value="">請選擇</option>`+state.attendance.map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(pname(id))}</option>`).join('')}
function renderCourt(){for(let i=0;i<4;i++){const s=$('p'+i);s.innerHTML=options(state.court[i]||'');s.value=state.court[i]||'';s.onchange=()=>{if(!isHost)return;state.court[i]=s.value;reconcileWaitingQueue(state.court.filter(Boolean));renderWaiting();saveSoon()}}$('target').value=state.rules.target;$('cap').value=state.rules.cap;$('deuce').value=state.rules.deuce?'1':'0';renderWaiting()}
function renderWaiting(){const used=state.court.filter(Boolean),eligible=state.attendance.filter(id=>!used.includes(id));const ordered=uniqueIds(state.waitingQueue).filter(id=>eligible.includes(id));for(const id of eligible)if(!ordered.includes(id))ordered.push(id);state.priority=ordered[0]||null;$('waiting').innerHTML=ordered.map((id,i)=>`<span class="chip ${i===0?'priority':''}">${esc(queueLabel(i,ordered.length))} · ${esc(pname(id))}</span>`).join('')||'<span class="sub">目前沒有候場球員</span>'}
function winFor(sc){const {target,cap,deuce}=state.rules;for(let t=0;t<2;t++){const o=1-t;if(!deuce&&sc[t]>=target)return t;if(deuce&&sc[t]>=target&&sc[t]-sc[o]>=2)return t;if(deuce&&sc[t]>=cap)return t}return null}
function replay(){const m=state.match;m.scores=[0,0];m.serving=0;m.positions=[[0,1],[0,1]];m.winner=null;for(const t of m.rallies){if(m.winner!==null)break;const same=m.serving===t;m.scores[t]++;if(same)m.positions[t].reverse();else m.serving=t;m.winner=winFor(m.scores)}renderScore();if(m.winner!==null){finishMatch();return}saveLiveScoreSoon()}
function gamePoint(){const m=state.match;if(m.winner!==null)return false;for(let t=0;t<2;t++){const test=[...m.scores];test[t]++;if(winFor(test)===t)return true}return false}
function currentResultKey(){const m=state.match;if(m.winner===null)return'';return m.matchId||[m.winner,(m.scores||[]).join('-'),...(m.players||[]).flat()].join('|')}
function setServingPlayer(team,playerIndex){const m=state.match;if(!isHost||!m.active||m.winner!==null)return;m.serving=team;const serverSide=m.scores[team]%2===0?1:0;const positions=m.positions[team]||[0,1];const currentSide=positions.indexOf(playerIndex);if(currentSide!==serverSide&&currentSide>=0){const other=positions[serverSide];positions[serverSide]=playerIndex;positions[currentSide]=other;m.positions[team]=positions}renderScore();saveLiveScoreSoon()}
const hasNativeWakeLock=()=>!!navigator.wakeLock?.request;
function createVideoWakeLock(){
  const video=document.createElement('video');
  video.setAttribute('title','螢幕恆亮備援');
  video.setAttribute('aria-hidden','true');
  video.setAttribute('playsinline','');
  video.setAttribute('webkit-playsinline','');
  video.setAttribute('loop','');
  video.setAttribute('preload','auto');
  video.loop=true;
  video.preload='auto';
  video.style.cssText='position:fixed;width:1px;height:1px;left:0;bottom:0;opacity:.01;pointer-events:none;z-index:-1';
  for(const type of ['webm','mp4']){const source=document.createElement('source');source.src=noSleepMedia[type];source.type=`video/${type}`;video.appendChild(source)}
  video.addEventListener('loadedmetadata',()=>{if(video.duration<=1)video.loop=true});
  video.addEventListener('timeupdate',()=>{if(video.duration>1&&video.currentTime>.5)video.currentTime=Math.random()*.4});
  let enabled=false;
  video.addEventListener('playing',()=>{enabled=true});
  video.addEventListener('pause',()=>{enabled=false});
  document.body.appendChild(video);
  return{
    get isEnabled(){return enabled&&!video.paused},
    async enable(){await video.play();enabled=true},
    disable(){video.pause();enabled=false}
  };
}
const fallbackNoSleep=createVideoWakeLock();
const APP_WAKE_LOCK_KEY='bcmWakeLockEnabledV1';
let appWakeLockWanted=localStorage.getItem(APP_WAKE_LOCK_KEY)!=='0';
let appWakeLock=null,appWakeLockRequest=null,fallbackWakeLockRequest=null,appWakeLockRetryTimer=null,appWakeLockLastError='';
let appWakeLockNeedsGesture=false;
function nativeWakeLockActive(){return !!appWakeLock&&!appWakeLock.released}
function appWakeLockProtected(){return wakeLockControlIsActive({nativeSupported:hasNativeWakeLock(),nativeActive:nativeWakeLockActive(),fallbackActive:fallbackNoSleep.isEnabled})}
function describeWakeLockError(error){
  if(error?.name==='NotAllowedError')return'iPad 拒絕螢幕恆亮。請關閉低耗電模式，再點一次重試。';
  if(error?.name==='NotSupportedError')return'目前的 iPadOS 或開啟方式不支援真正恆亮，請更新 iPadOS 後重試。';
  return'沒有取得 iPad 的原生螢幕恆亮，請再點一次重試。';
}
function renderAppWakeLockStatus(){
  const button=$('wakeLockBtn'),feedback=$('wakeLockFeedback');
  if(!button)return;
  const nativeSupported=hasNativeWakeLock(),nativeActive=nativeWakeLockActive(),fallbackActive=fallbackNoSleep.isEnabled;
  const active=appWakeLockWanted&&appWakeLockProtected(),pending=appWakeLockWanted&&(!!appWakeLockRequest||!!fallbackWakeLockRequest);
  button.setAttribute('aria-pressed',active?'true':'false');
  button.setAttribute('aria-busy',pending?'true':'false');
  button.textContent=!appWakeLockWanted?'🌙 恆亮已關閉（點擊開啟）':nativeActive?'☀️ 恆亮已開啟（點擊關閉）':pending?'☀️ 正在啟用恆亮…':nativeSupported?'⚠️ 恆亮未成功（點擊重試）':fallbackActive?'☀️ 恆亮備援已開啟（點擊關閉）':appWakeLockNeedsGesture?'☀️ 恆亮待啟用（點一下畫面）':'☀️ 點擊開啟螢幕恆亮';
  button.title=!appWakeLockWanted?'點擊開啟螢幕恆亮':active?'點擊關閉螢幕恆亮':'點擊重新啟用螢幕恆亮';
  if(feedback){
    feedback.className=`wake-lock-feedback ${nativeActive?'success':appWakeLockWanted&&appWakeLockLastError?'error':pending||fallbackActive?'pending':''}`;
    feedback.textContent=!appWakeLockWanted?'已關閉；iPad 將依系統設定熄屏。':nativeActive?'✅ iPad 已確認螢幕恆亮，畫面不會自動變暗。':nativeSupported&&fallbackActive?`⚠️ 目前只有影片備援，尚未取得真正恆亮。${appWakeLockLastError||'請再點一次重試。'}`:active?'⚠️ 此 iPadOS 僅能使用影片備援，仍可能依系統設定熄屏。':appWakeLockLastError?`⚠️ 尚未啟用：${appWakeLockLastError}`:appWakeLockNeedsGesture?'請在畫面任一處點一下，即會自動恢復恆亮。':pending?'正在向 iPad 取得螢幕恆亮權限…':'尚未啟用；請點上方按鈕。';
  }
}
function enableFallbackWakeLock(){
  if(!appWakeLockWanted)return Promise.resolve(false);
  if(fallbackNoSleep.isEnabled)return Promise.resolve(true);
  if(fallbackWakeLockRequest)return fallbackWakeLockRequest;
  fallbackWakeLockRequest=fallbackNoSleep.enable().then(()=>{if(!appWakeLockWanted){fallbackNoSleep.disable();return false}appWakeLockLastError='';appWakeLockNeedsGesture=false;return true}).catch(()=>{appWakeLockNeedsGesture=true;appWakeLockLastError='iPad 未允許防熄屏，請關閉低耗電模式後再點一次。';return false}).finally(()=>{fallbackWakeLockRequest=null;renderAppWakeLockStatus()});
  renderAppWakeLockStatus();
  return fallbackWakeLockRequest;
}
function scheduleAppWakeLockRetry(delay=1200){
  clearTimeout(appWakeLockRetryTimer);
  if(document.hidden||!appWakeLockWanted)return;
  appWakeLockRetryTimer=setTimeout(()=>{appWakeLockRetryTimer=null;void syncAppWakeLock()},delay);
}
async function releaseAppWakeLock(){
  clearTimeout(appWakeLockRetryTimer);
  appWakeLockRetryTimer=null;
  const lock=appWakeLock;
  appWakeLock=null;
  if(lock&&!lock.released){try{await lock.release()}catch{}}
  if(fallbackNoSleep.isEnabled){try{fallbackNoSleep.disable()}catch{}}
  if(appWakeLockWanted&&!hasNativeWakeLock())appWakeLockNeedsGesture=true;
  renderAppWakeLockStatus();
}
async function syncAppWakeLock(userActivated=false){
  if(!appWakeLockWanted){await releaseAppWakeLock();return}
  if(document.hidden){await releaseAppWakeLock();return}
  const startPersistentVideo=shouldStartPersistentVideoWakeLock({wanted:appWakeLockWanted,userActivated,videoActive:fallbackNoSleep.isEnabled});
  if(nativeWakeLockActive()){
    if(startPersistentVideo)void enableFallbackWakeLock();
    renderAppWakeLockStatus();
    return
  }
  if(appWakeLockRequest){
    if(startPersistentVideo)void enableFallbackWakeLock();
    renderAppWakeLockStatus();
    try{await appWakeLockRequest}catch{}
    if(fallbackWakeLockRequest)await fallbackWakeLockRequest;
    return;
  }
  if(!hasNativeWakeLock()){
    if(!userActivated&&appWakeLockNeedsGesture){renderAppWakeLockStatus();return}
    appWakeLockLastError='';
    await enableFallbackWakeLock();
    return;
  }
  appWakeLockRequest=navigator.wakeLock.request('screen');
  const fallbackAttempt=startPersistentVideo?enableFallbackWakeLock():Promise.resolve(fallbackNoSleep.isEnabled);
  renderAppWakeLockStatus();
  try{
    const lock=await appWakeLockRequest;
    if(document.hidden||!appWakeLockWanted){await lock.release();return}
    appWakeLock=lock;
    appWakeLockLastError='';
    const fallbackEnabled=await fallbackAttempt;
    appWakeLockNeedsGesture=!fallbackEnabled;
    lock.addEventListener('release',()=>{
      if(appWakeLock===lock)appWakeLock=null;
      renderAppWakeLockStatus();
      scheduleAppWakeLockRetry();
    },{once:true});
  }catch(error){
    const fallbackEnabled=fallbackAttempt?await fallbackAttempt:false;
    appWakeLockLastError=describeWakeLockError(error);
    appWakeLockNeedsGesture=!fallbackEnabled;
    console.warn('無法保持 App 螢幕亮起',error)
  }
  finally{appWakeLockRequest=null;renderAppWakeLockStatus()}
}
document.addEventListener('visibilitychange',()=>{void syncAppWakeLock()});
function resumeWakeLockFromGesture(){void syncAppWakeLock(true)}
document.addEventListener('pointerdown',resumeWakeLockFromGesture,{capture:true,passive:true});
document.addEventListener('touchstart',resumeWakeLockFromGesture,{capture:true,passive:true});
document.addEventListener('click',resumeWakeLockFromGesture,{capture:true,passive:true});
document.addEventListener('keydown',resumeWakeLockFromGesture,{capture:true});
window.addEventListener('focus',()=>scheduleAppWakeLockRetry(100));
window.addEventListener('pageshow',()=>scheduleAppWakeLockRetry(100));
window.addEventListener('pagehide',()=>{void releaseAppWakeLock()});
$('wakeLockBtn').onclick=async()=>{
  const intent=wakeLockButtonIntent({wanted:appWakeLockWanted,active:appWakeLockProtected()});
  if(intent==='retry'){
    appWakeLockLastError='';
    await syncAppWakeLock(true);
    renderAppWakeLockStatus();
    return;
  }
  appWakeLockWanted=intent==='enable';
  localStorage.setItem(APP_WAKE_LOCK_KEY,appWakeLockWanted?'1':'0');
  appWakeLockLastError='';
  renderAppWakeLockStatus();
  if(appWakeLockWanted)await syncAppWakeLock(true);else await releaseAppWakeLock();
  renderAppWakeLockStatus();
};
setInterval(()=>{
  const shouldRetryNative=shouldRequestNativeWakeLock({wanted:appWakeLockWanted,hidden:document.hidden,nativeSupported:hasNativeWakeLock(),nativeActive:nativeWakeLockActive(),requestPending:!!appWakeLockRequest});
  const shouldRetryFallback=appWakeLockWanted&&!document.hidden&&!hasNativeWakeLock()&&!fallbackNoSleep.isEnabled;
  if(shouldRetryNative||shouldRetryFallback)void syncAppWakeLock();
},15000);
void syncAppWakeLock();
function renderScore(){
  const m=state.match;
  const scoreAEl=$('scoreA'),scoreBEl=$('scoreB');
  scoreAEl.textContent=m.scores[0];
  scoreBEl.textContent=m.scores[1];
  scoreAEl.classList.toggle('two-digit',m.scores[0]>=10);
  scoreBEl.classList.toggle('two-digit',m.scores[1]>=10);
  $('undo').disabled=!m.rallies.length;

  const scoreNameClass=name=>{
    const cleanName=String(name||'').trim();
    if(cleanName==='Yoyo')return' score-name-yoyo';
    if(cleanName==='于瑄Jr.')return' score-name-yuxuan-jr';
    return'';
  };
  const renderTeam=(t,box)=>{
    const ids=m.players[t]||[];
    const positions=m.positions[t]||[0,1];
    const serverSide=m.scores[t]%2===0?1:0;
    const serverIndex=positions[serverSide]??0;
    const displaySides=t===0?[0,1]:[1,0];
    box.innerHTML=displaySides.map(sideIndex=>{
      const i=positions[sideIndex]??sideIndex;
      const id=ids[i];
      const displayName=pname(id);
      const physicalSide=sideIndex===1?'右邊':'左邊';
      const serving=m.serving===t&&serverIndex===i&&m.winner===null;
      const nameClass=scoreNameClass(displayName);
      return `<div class="court-name ${serving?'server':''}"><span class="score-player">${avatar(id,'score-large')}<span class="court-player-copy"><span class="court-position${nameClass}">${physicalSide}</span><span class="court-player-name${nameClass}">${esc(displayName)}</span></span></span></div>`;
    }).join('');
  };
  renderTeam(0,$('namesA'));
  renderTeam(1,$('namesB'));

  const serverButtons=$('serverButtons');
  if(serverButtons){
    serverButtons.innerHTML=[0,1].flatMap(t=>(m.players[t]||[]).map((id,i)=>{
      const serverSide=m.scores[t]%2===0?1:0;
      const serverIndex=m.positions[t]?.[serverSide]??0;
      const active=m.serving===t&&serverIndex===i&&m.winner===null;
      return `<button type="button" class="server-select-btn ${active?'active':''}" data-server-team="${t}" data-server-player="${i}">${t===0?'A':'B'} · ${esc(pname(id))}</button>`;
    })).join('');
    serverButtons.querySelectorAll('[data-server-player]').forEach(btn=>btn.onclick=()=>setServingPlayer(+btn.dataset.serverTeam,+btn.dataset.serverPlayer));
  }

  $('matchPoint').classList.toggle('hidden',!gamePoint());
  const side=m.scores[m.serving]%2===0?'右':'左';
  const sid=m.players[m.serving]?.[m.positions[m.serving]?.[m.scores[m.serving]%2===0?1:0]??0];
  $('serveText').textContent=m.winner!==null?'比賽結束':`${m.serving===0?'A隊':'B隊'} · ${pname(sid)} · ${side}發球區`;
  // 觀看者固定留在總覽／一般頁面；只有管理員進入全螢幕比分模式
  $('scoreView').classList.toggle('hidden',!m.active||!isHost||requestedAndroidRemote);
  const resultKey=currentResultKey();
  if(!isHost||requestedAndroidRemote){
    $('resultModal').classList.add('hidden');
  }else if(m.active&&m.winner!==null&&resultKey&&resultKey!==dismissedResultKey){
    $('resultModal').classList.remove('hidden');
  }else if(m.winner===null){
    $('resultModal').classList.add('hidden');
  }
}
function setMatchReplayFeedback(message='',kind=''){
  const feedback=$('matchReplayFeedback');
  if(!feedback)return;
  feedback.textContent=message;
  feedback.className=`match-replay-feedback ${kind}`.trim();
}
function renderMatchReplay(){
  const url=normalizeYouTubePlaylistUrl(state.matchReplayPlaylistUrl),title=normalizeMatchReplayTitle(state.matchReplayPlaylistTitle),card=$('matchReplayCard'),link=$('matchReplayLink'),input=$('matchReplayUrl'),titleInput=$('matchReplayTitle'),titleText=$('matchReplayTitleText'),clear=$('clearMatchReplay');
  card.classList.toggle('hidden',!url);
  link.href=url||'#';
  titleText.textContent=title||'比賽影片回放';
  if(document.activeElement!==input)input.value=url;
  if(document.activeElement!==titleInput)titleInput.value=title;
  clear.disabled=!url;
}
async function saveMatchReplayPlaylist(){
  if(!isHost)return;
  const input=$('matchReplayUrl'),titleInput=$('matchReplayTitle'),button=$('saveMatchReplay'),url=normalizeYouTubePlaylistUrl(input.value),title=normalizeMatchReplayTitle(titleInput.value);
  if(!url)return setMatchReplayFeedback('請貼上正確的 YouTube 播放清單網址。','error');
  const previous={title:state.matchReplayPlaylistTitle,url:state.matchReplayPlaylistUrl};
  button.disabled=true;setMatchReplayFeedback('正在同步播放清單…','pending');
  try{
    state.matchReplayPlaylistTitle=title;
    state.matchReplayPlaylistUrl=url;
    await saveNow();
    renderMatchReplay();
    setMatchReplayFeedback('播放清單已同步，所有球友都能在此開啟。','success');
  }catch(error){
    state.matchReplayPlaylistTitle=previous.title;
    state.matchReplayPlaylistUrl=previous.url;
    renderMatchReplay();
    setMatchReplayFeedback('儲存失敗：'+formatError(error),'error');
  }finally{
    button.disabled=false;
  }
}
async function clearMatchReplayPlaylist(){
  if(!isHost||!state.matchReplayPlaylistUrl)return;
  if(!confirm('確定移除比賽影片播放清單連結？'))return;
  const previous={title:state.matchReplayPlaylistTitle,url:state.matchReplayPlaylistUrl},button=$('clearMatchReplay');
  button.disabled=true;setMatchReplayFeedback('正在移除連結…','pending');
  try{
    state.matchReplayPlaylistTitle='';
    state.matchReplayPlaylistUrl='';
    await saveNow();
    renderMatchReplay();
    setMatchReplayFeedback('播放清單連結已移除。','success');
  }catch(error){
    state.matchReplayPlaylistTitle=previous.title;
    state.matchReplayPlaylistUrl=previous.url;
    renderMatchReplay();
    setMatchReplayFeedback('移除失敗：'+formatError(error),'error');
  }finally{
    button.disabled=!state.matchReplayPlaylistUrl;
  }
}
function renderHistory(){renderMatchReplay();const list=state.history.map((h,index)=>({h,index})).reverse();$('history').innerHTML=list.map(({h,index})=>`<div class="history-item"><div class="history-main"><strong>${esc((h.teams?.[0]||[]).map(pname).join('／'))} ${h.scores?.[0]??0}：${h.scores?.[1]??0} ${esc((h.teams?.[1]||[]).map(pname).join('／'))}</strong><div class="sub">${esc(h.time||'')}</div></div><div class="history-actions host-only"><button class="btn danger-outline" data-delete-history="${index}">刪除</button></div></div>`).join('')||'<p class="sub">尚無比賽紀錄。</p>';all('[data-delete-history]').forEach(btn=>btn.onclick=()=>deleteHistoryRecord(+btn.dataset.deleteHistory));applyRole()}
function deleteHistoryRecord(index){if(!isHost)return;const h=state.history[index];if(!h)return;const title=`${(h.teams?.[0]||[]).map(pname).join('／')} ${h.scores?.[0]??0}：${h.scores?.[1]??0} ${(h.teams?.[1]||[]).map(pname).join('／')}`;if(!confirm(`確定刪除這筆比賽紀錄？\n\n${title}\n${h.time||''}`))return;state.history.splice(index,1);renderAll();saveSoon()}
function clearAllHistory(){if(!isHost)return;if(!state.history.length)return alert('目前沒有比賽紀錄。');if(!confirm(`即將刪除全部 ${state.history.length} 筆比賽紀錄。\n球員名單與目前比分不會被刪除。`))return;const text=prompt('為避免誤刪，請輸入「清空」：','');if(text!=='清空')return alert('輸入不正確，已取消清空。');state.history=[];renderAll();saveSoon();alert('全部比賽紀錄已清空。')}
function renderAll(){renderRoster();renderAttendance();renderCourt();renderHistory();renderScore();renderDashboard();renderStats();renderPoll();renderChat();applyRole();renderAndroidRemote()}
function startMatch(){dismissedResultKey='';const selected=state.court.filter(Boolean);if(selected.length!==4||new Set(selected).size!==4)return alert('請選擇四位不同球員。');const ids=teammateSafeLineup(selected);state.court=[...ids];reconcileWaitingQueue(ids);state.queueDraftChosen=[];randomizeScoreThemeAtMatchStart();state.match={active:true,players:[[ids[0],ids[1]],[ids[2],ids[3]]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null,startedAt:new Date().toISOString()};saveSoon();renderScore();renderDashboard()}
function finishMatch(){
  const m=state.match;if(!m.active||m.winner===null)return;
  let newlyRecorded=false;
  if(!state.history.some(h=>h.matchId===m.matchId)){
    newlyRecorded=true;m.matchId=m.matchId||randomToken();const now=new Date();
    state.history.push({matchId:m.matchId,time:now.toLocaleString('zh-TW'),endedAt:now.toISOString(),dateKey:localDateKey(now),monthKey:localMonthKey(now),teams:structuredClone(m.players),scores:[...m.scores],winner:m.winner});
  }
  const winners=[...m.players[m.winner]],losers=[...m.players[1-m.winner]],previousCourt=m.players.flat();
  reconcileWaitingQueue(previousCourt);
  let queue=[...state.waitingQueue],chosen=[],losersToTail=[];
  if(queue.length>=2){chosen=queue.splice(0,2);losersToTail=[...losers]}
  else if(queue.length===1){chosen=[queue.shift(),losers[0]];losersToTail=[losers[1]]}
  else{chosen=[...losers];losersToTail=[]}
  state.waitingQueue=uniqueIds([...queue,...losersToTail]).filter(id=>state.attendance.includes(id)&&!winners.includes(id)&&!chosen.includes(id));
  state.queueDraftChosen=[...chosen];
  state.priority=state.waitingQueue[0]||null;
  const four=teammateSafeLineup([...winners,...chosen],{randomize:true});
  state.nextCall={players:[...four],createdAt:new Date().toISOString()};
  for(let i=0;i<4;i++){$('n'+i).innerHTML=options(four[i]||'');$('n'+i).value=four[i]||'';$('n'+i).onchange=updatePriority}
  updatePriority();
  $('winnerTitle').textContent=`${m.winner===0?'A隊':'B隊'}獲勝`;
  $('finalScore').textContent=`${m.scores[0]}：${m.scores[1]}`;
  if(isHost)$('resultModal').classList.remove('hidden');else $('resultModal').classList.add('hidden');
  renderAll();saveSoon();
  if(newlyRecorded&&isHost)setTimeout(()=>createCloudBackup('auto',{id:`auto_${m.matchId}`,silent:true,system:true}).then(loadBackups).catch(e=>console.warn('賽後備份失敗',e)),1200)
}
function updatePriority(){
  const vals=[0,1,2,3].map(i=>$('n'+i).value).filter(Boolean),projected=projectedQueueForLineup(vals);
  state.priority=projected[0]||null;
  if(vals.length===4&&new Set(vals).size===4)state.nextCall={players:[...vals],createdAt:state.nextCall?.createdAt||new Date().toISOString()};
  $('priorityText').classList.toggle('hidden',!projected.length);
  $('priorityText').textContent=projected.length?`候場順序：${projected.map((id,i)=>`${queueLabel(i,projected.length)} ${pname(id)}`).join(' → ')}`:'';
  renderDashboard();saveSoon()
}
function startNext(){
  dismissedResultKey='';const selected=[0,1,2,3].map(i=>$('n'+i).value);
  if(selected.some(x=>!x)||new Set(selected).size!==4)return alert('下一場需要四位不同球員。');
  const vals=teammateSafeLineup(selected);
  const winners=state.match.players[state.match.winner];if(!winners.every(id=>vals.includes(id)))return alert('勝方兩位必須留場。');
  const finalCall=calloutText(vals);
  state.waitingQueue=projectedQueueForLineup(vals);state.queueDraftChosen=[];state.priority=state.waitingQueue[0]||null;
  state.court=[...vals];state.nextCall=null;
  randomizeScoreThemeAtMatchStart();
  state.match={active:true,players:[[vals[0],vals[1]],[vals[2],vals[3]]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null,startedAt:new Date().toISOString()};
  $('resultModal').classList.add('hidden');renderAll();saveSoon();if(isHost&&voiceEnabled&&finalCall)setTimeout(()=>speak(finalCall),180)
}

function backupsRef(){return collection(db,'badmintonRooms',roomId,'backups')}
function backupDocRef(id){return doc(db,'badmintonRooms',roomId,'backups',id)}
function backupCounts(data=state){return{players:data.roster?.length||0,history:data.history?.length||0,attendance:data.attendance?.length||0,pollOptions:data.schedulePoll?.options?.length||0}}
function backupCompleteness(data=state){const checks=[Array.isArray(data.roster),Array.isArray(data.history),Array.isArray(data.attendance),!!data.match,!!data.rules,!!data.schedulePoll];return Math.round(checks.filter(Boolean).length/checks.length*100)}
function backupId(type,custom=''){if(custom)return custom;const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);return `${type}_${stamp}_${randomToken().slice(0,5)}`}
function backupLabel(type){return({genesis:'Genesis Backup',manual:'手動備份',auto:'賽後自動備份',daily:'每日備份',session:'結束球局備份',emergency:'還原前保護備份'})[type]||'備份'}
function makeBackupRecord(type='manual',id=''){const clean=encodeState(state),now=new Date();return{schemaVersion:1,appVersion:BCM_VERSION,roomId,type,label:backupLabel(type),createdAt:now.toISOString(),createdAtMs:now.getTime(),createdBy:type==='auto'||type==='daily'?'系統':'管理員',counts:backupCounts(state),completeness:backupCompleteness(state),data:clean}}
async function createCloudBackup(type='manual',opts={}){if(!roomId||!roomRef)throw new Error('尚未進入球局');if(!isHost&&!opts.system)throw new Error('只有管理員可以建立備份');const id=backupId(type,opts.id||'');const ref=backupDocRef(id);if(opts.id&&['genesis','daily','auto'].includes(type)){const exists=await getDoc(ref);if(exists.exists())return{id,skipped:true}}const record=makeBackupRecord(type,id);await setDoc(ref,record);if(type==='auto'||type==='daily')await pruneAutomaticBackups();if(!opts.silent){alert(`${record.label}已建立`);await loadBackups()}return{id,record}}
async function ensureGenesisAndDaily(){if(!isHost||!roomId)return;try{await createCloudBackup('genesis',{id:'genesis',silent:true,system:true});const day=localDateKey();await createCloudBackup('daily',{id:`daily_${day}`,silent:true,system:true});await loadBackups()}catch(e){console.warn('自動備份未建立',e);setError('雲端備份尚未啟用：'+formatError(e))}}
async function pruneAutomaticBackups(){const snaps=await getDocs(query(backupsRef(),orderBy('createdAtMs','desc'),limit(60)));const autos=snaps.docs.filter(d=>['auto','daily'].includes(d.data().type));for(const d of autos.slice(10))await deleteDoc(d.ref)}
function backupTypeName(type){return({genesis:'Genesis',manual:'手動',auto:'自動',daily:'每日',session:'結束球局',emergency:'保護'})[type]||type}
function formatBackupTime(v){const d=new Date(v||0);return isNaN(d)?'—':d.toLocaleString('zh-TW')}
let backupRows=[];
async function loadBackups(){const box=$('backupList'),health=$('backupHealth');if(!box||!health)return;if(!roomId){box.innerHTML='<div class="backup-loading">請先進入球局。</div>';return}box.innerHTML='<div class="backup-loading">正在讀取備份紀錄…</div>';try{const snaps=await getDocs(query(backupsRef(),orderBy('createdAtMs','desc'),limit(50)));backupRows=snaps.docs.map(d=>({id:d.id,...d.data()}));renderBackupCenter()}catch(e){box.innerHTML=`<div class="error-box">${esc(formatError(e))}</div>`;health.innerHTML='<div class="health-box"><span>備份狀態</span><strong>無法讀取</strong></div>'}}
function renderBackupCenter(){const rows=backupRows,genesis=rows.find(x=>x.id==='genesis'),last=rows[0],autoCount=rows.filter(x=>['auto','daily'].includes(x.type)).length,manualCount=rows.filter(x=>x.type==='manual').length;$('backupHealth').innerHTML=`<div class="health-box"><span class="sub">最後備份</span><strong>${last?esc(formatBackupTime(last.createdAt)):'尚未建立'}</strong></div><div class="health-box"><span class="sub">Genesis</span><strong>${genesis?'存在 ✅':'尚未建立'}</strong></div><div class="health-box"><span class="sub">自動／每日</span><strong>${autoCount} 份</strong></div><div class="health-box"><span class="sub">資料完整度</span><strong>${backupCompleteness()}%</strong></div>`;$('backupList').innerHTML=rows.length?rows.map(b=>`<div class="backup-row"><div><div class="backup-title"><span class="backup-type ${esc(b.type)}">${esc(backupTypeName(b.type))}</span>${esc(b.label||b.id)}</div><div class="backup-meta">${esc(formatBackupTime(b.createdAt))} · BCM ${esc(b.appVersion||'—')} · 球員 ${b.counts?.players??0} · 紀錄 ${b.counts?.history??0} · 完整度 ${b.completeness??'—'}%</div></div><div class="backup-row-actions"><button class="btn" data-backup-export="${esc(b.id)}">匯出</button>${isHost?`<button class="btn blue" data-backup-restore="${esc(b.id)}">還原</button>${b.id!=='genesis'?`<button class="btn danger-outline" data-backup-delete="${esc(b.id)}">刪除</button>`:''}`:''}</div></div>`).join(''):'<div class="poll-empty">尚無雲端備份。管理員可建立第一份備份。</div>';all('[data-backup-export]').forEach(b=>b.onclick=()=>exportCloudBackup(b.dataset.backupExport));all('[data-backup-restore]').forEach(b=>b.onclick=()=>restoreCloudBackup(b.dataset.backupRestore));all('[data-backup-delete]').forEach(b=>b.onclick=()=>deleteCloudBackup(b.dataset.backupDelete))}
async function exportCloudBackup(id){try{const snap=await getDoc(backupDocRef(id));if(!snap.exists())throw new Error('找不到備份');downloadJson(snap.data(),`BCM_Cloud_${roomId}_${id}.json`)}catch(e){alert(formatError(e))}}
function downloadJson(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function restoreCloudBackup(id){if(!isHost)return alert('只有管理員可以還原。');const row=backupRows.find(x=>x.id===id);if(!row)return alert('找不到備份。');if(!confirm(`確定還原「${row.label||id}」？\n\n球員 ${row.counts?.players??0} 人\n紀錄 ${row.counts?.history??0} 場\n時間 ${formatBackupTime(row.createdAt)}\n\n系統會先建立目前資料的保護備份。`))return;const typed=prompt('為避免誤操作，請輸入「還原」：','');if(typed!=='還原')return alert('已取消還原。');try{setSync('建立保護備份');await createCloudBackup('emergency',{silent:true});const snap=await getDoc(backupDocRef(id));if(!snap.exists())throw new Error('備份不存在');const b=snap.data();if(!b.data)throw new Error('備份資料不完整');state=cleanState(b.data);await saveNow();renderAll();setSync('還原完成','online');alert('還原成功，所有裝置會即時同步。');await loadBackups()}catch(e){setSync('還原失敗','error');alert(formatError(e))}}
async function deleteCloudBackup(id){if(id==='genesis')return alert('Genesis Backup 不可刪除。');if(!confirm('確定刪除這份雲端備份？'))return;try{await deleteDoc(backupDocRef(id));await loadBackups()}catch(e){alert(formatError(e))}}

let pendingAvatar=null;function refreshProfilePreview(){const p=player(editId),src=pendingAvatar!==null?pendingAvatar:(p?.avatar||'');$('editAvatarPreview').innerHTML=src?`<img src="${src}" alt="">`:esc(initials(p?.name));$('profileTitle').textContent=p?.name||'球員資料';const st=playerStats(editId),td=scopedStats(editId,'today'),mo=scopedStats(editId,'month'),status=playerStatus(editId),rel=relationshipStats(editId);$('statGames').textContent=st.games;$('statWins').textContent=st.wins;$('statRate').textContent=st.rate+'%';$('ringRate').textContent=st.rate+'%';$('profileWinRing').style.setProperty('--rate',st.rate);$('profileSummary').textContent=p?.racket?`🏸 ${p.racket}`:'🏸 尚未填寫球拍資料';$('profileMainRacket').textContent=[p?.racket,p?.racketTension,p?.racketString].filter(Boolean).join(' · ')||'尚未填寫';$('profileBackupRacket').textContent=[p?.backupRacket,p?.backupTension,p?.backupString].filter(Boolean).join(' · ')||'尚未填寫';$('profileStatus').textContent=status.label;const streak=td.streak?(td.kind==='W'?`🔥 ${td.streak}連勝`:`🧊 ${td.streak}連敗`):'—';$('profileToday').textContent=`${td.wins}勝 ${td.losses}敗`;$('profileMonth').textContent=`${mo.wins}勝 ${mo.losses}敗`;$('profileStreak').textContent=streak;$('profileBadges').innerHTML=careerBadges(editId).map(([icon,label,on])=>`<span class="career-badge ${on?'':'locked'}">${icon} ${label}</span>`).join('');$('profilePartnerRanking').innerHTML=relationRows(rel.partners,'尚無搭檔紀錄');$('profileOpponent').innerHTML=relationRows(rel.opponents,'尚無對戰紀錄');$('profileRecent').innerHTML='<h3>最近比賽</h3>'+((td.list.slice().reverse().slice(0,5).map(x=>`<div class="recent-game">${x.won?'✅ 勝':'❌ 敗'} · ${esc(x.h.scores[0]+'：'+x.h.scores[1])} · ${esc(x.h.time||'')}</div>`).join(''))||'<div class="sub">今日尚無比賽。</div>')}
function canEditPlayer(p){return !!p&&(isHost||p.ownerHash===selfHash)}
function updateProfilePermissions(){const p=player(editId),editable=canEditPlayer(p),claimable=!isHost&&p&&!editable;const claimBtn=$('claimPlayer');claimBtn.classList.toggle('hidden',!claimable);claimBtn.textContent=p?.ownerHash?'這是我的資料／重新認領':'這是我／認領資料';$('saveEdit').classList.toggle('hidden',!editable);$('profileEditFields').classList.toggle('hidden',!editable);$('photoHint').classList.toggle('hidden',!editable);['editName','editRacket','editRacketTension','editRacketString','editBackupRacket','editBackupTension','editBackupString','editNote','editPhoto','removePhoto'].forEach(id=>{const el=$(id);if(el)el.disabled=!editable});const voiceSection=$('voiceAdminSection');if(voiceSection)voiceSection.classList.toggle('hidden',!isHost);const voiceInput=$('editVoiceName');if(voiceInput)voiceInput.disabled=!isHost;const testVoice=$('testVoiceName');if(testVoice)testVoice.disabled=!isHost}
let playerModalScrollY=0;
function setPlayerModalOpen(open){
  const modal=$('editModal'),body=document.body;
  if(open){
    playerModalScrollY=window.scrollY||document.documentElement.scrollTop||0;
    body.style.top=`-${playerModalScrollY}px`;
    body.classList.add('player-modal-open');
    modal.classList.remove('hidden');
    modal.querySelector('.modal-card').scrollTop=0;
    return;
  }
  modal.classList.add('hidden');
  if(!body.classList.contains('player-modal-open'))return;
  body.classList.remove('player-modal-open');body.style.top='';
  window.scrollTo(0,playerModalScrollY);
}
function closePlayerModal(){setPlayerModalOpen(false)}
function openEdit(id){editId=id;const p=player(id);pendingAvatar=null;profileOriginal={name:p?.name||'',voiceName:p?.voiceName||defaultVoiceName(p?.name),racket:p?.racket||'',racketTension:p?.racketTension||'',racketString:p?.racketString||'',backupRacket:p?.backupRacket||'',backupTension:p?.backupTension||'',backupString:p?.backupString||'',note:p?.note||''};profileDirty={name:false,voiceName:false,racket:false,racketTension:false,racketString:false,backupRacket:false,backupTension:false,backupString:false,note:false};$('editName').value=profileOriginal.name;$('editVoiceName').value=profileOriginal.voiceName;$('editRacket').value=profileOriginal.racket;$('editRacketTension').value=profileOriginal.racketTension;$('editRacketString').value=profileOriginal.racketString;$('editBackupRacket').value=profileOriginal.backupRacket;$('editBackupTension').value=profileOriginal.backupTension;$('editBackupString').value=profileOriginal.backupString;$('editNote').value=profileOriginal.note;refreshProfilePreview();updateProfilePermissions();setPlayerModalOpen(true)}
function compressPhoto(file){
  return new Promise((resolve,reject)=>{
    if(!file?.type?.startsWith('image/'))return reject(new Error('請選擇圖片檔案'));
    const img=new Image(),url=URL.createObjectURL(file),sizes=[448,384,320,256],qualities=[.82,.76,.7,.64,.58],formats=['image/webp','image/jpeg'],maxDataLength=44000;
    img.onload=()=>{
      try{
        let fallback='';
        for(const size of sizes){
          const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
          const ctx=canvas.getContext('2d');
          if(!ctx)throw new Error('裝置無法處理照片');
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
          ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
          const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;
          ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
          for(const format of formats){
            for(const quality of qualities){
              const candidate=canvas.toDataURL(format,quality);
              if(format==='image/webp'&&!candidate.startsWith('data:image/webp'))continue;
              fallback=candidate;
              if(candidate.length<=maxDataLength){URL.revokeObjectURL(url);return resolve(candidate)}
            }
          }
        }
        URL.revokeObjectURL(url);resolve(fallback);
      }catch(error){URL.revokeObjectURL(url);reject(error)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('照片讀取失敗'))};
    img.src=url;
  });
}
async function saveSelfPlayer(updated){try{setSync('同步中');await runTransaction(db,async tx=>{const snap=await tx.get(roomRef);if(!snap.exists())throw new Error('房間不存在');const decoded=decodeState(snap.data()),idx=decoded.roster.findIndex(p=>p.id===updated.id);if(idx<0)throw new Error('找不到球員');decoded.roster[idx]={...decoded.roster[idx],...updated};tx.update(roomRef,{roster:encodeState(decoded).roster,updatedAt:serverTimestamp()})});setSync('已同步','online')}catch(e){setSync('同步失敗','error');setError(formatError(e));throw e}}
async function saveEdit(){const p=player(editId);if(!canEditPlayer(p))return alert('你只能修改自己的資料。');const n=$('editName').value.trim();if(profileDirty.name&&!n)return alert('姓名不可空白');if(profileDirty.name&&state.roster.some(x=>x.id!==editId&&x.name===n))return alert('已有相同姓名');const updated={id:p.id};if(profileDirty.name)updated.name=n;if(isHost&&profileDirty.voiceName)updated.voiceName=$('editVoiceName').value.trim();if(profileDirty.racket)updated.racket=$('editRacket').value.trim();if(profileDirty.racketTension)updated.racketTension=$('editRacketTension').value.trim();if(profileDirty.racketString)updated.racketString=$('editRacketString').value.trim();if(profileDirty.backupRacket)updated.backupRacket=$('editBackupRacket').value.trim();if(profileDirty.backupTension)updated.backupTension=$('editBackupTension').value.trim();if(profileDirty.backupString)updated.backupString=$('editBackupString').value.trim();if(profileDirty.note)updated.note=$('editNote').value.trim();if(pendingAvatar!==null)updated.avatar=pendingAvatar;if(Object.keys(updated).length===1){closePlayerModal();return}try{if(isHost){Object.assign(p,updated);renderAll();saveSoon()}else{await saveSelfPlayer(updated);Object.assign(p,updated);renderAll()}closePlayerModal();alert('球員資料已儲存。')}catch(e){alert('球員資料儲存失敗：'+formatError(e))}}
async function addPlayerRecord(){
  const input=$('newName'),button=$('addPlayer'),name=input.value.trim();
  if(!name)return;
  if(state.roster.some(p=>p.name===name))return alert('已有相同姓名');
  const syncedName=(localStorage.getItem(DEVICE_SYNC_PLAYER_KEY)||localStorage.getItem(DEVICE_SYNC_NAME_KEY)||'').trim(),record={id:randomToken(),name,voiceName:defaultVoiceName(name),avatar:'',racket:'',racketTension:'',racketString:'',backupRacket:'',backupTension:'',backupString:'',note:'',favorite:false,ownerHash:name===syncedName?selfHash:''};
  button.disabled=true;
  try{
    if(isHost){state.roster.push(record);await saveNow()}
    else await runTransaction(db,async tx=>{const snapshot=await tx.get(roomRef);if(!snapshot.exists())throw new Error('球局不存在');const remote=decodeState(snapshot.data());if(remote.roster.some(p=>p.name===name))throw new Error('已有相同姓名');tx.update(roomRef,{roster:[...remote.roster,record],updatedAt:serverTimestamp()})});
    if(!state.roster.some(p=>p.id===record.id))state.roster.push(record);
    input.value='';renderAll();alert(`已新增球員「${name}」。${record.ownerHash?'三台裝置都可修改這份資料。':'本人可再點選球員卡認領資料。'}`);
  }catch(error){alert(error.message||'新增球員失敗。')}finally{button.disabled=false}
}
let editingAdminNoticeId='';
function setAdminNoticeFeedback(message='',kind=''){
  const feedback=$('adminNoticeFeedback');
  feedback.textContent=message;
  feedback.className=`admin-notice-feedback${message?'':' hidden'}${kind?` ${kind}`:''}`;
}
function renderAdminNoticeManager(){
  const list=$('adminNoticeManagerList'),notices=normalizeAdminNotices(state);
  if(!list)return;
  list.innerHTML=notices.map(notice=>{
    const date=new Date(notice.publishedAt||''),time=!isNaN(date)?date.toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    return `<article class="admin-notice-manage-item"><div class="admin-notice-manage-copy"><strong>${esc(notice.title)}</strong>${time?`<time>${esc(time)}</time>`:''}<p>${esc(notice.body)}</p></div><div class="admin-notice-manage-actions"><button class="btn" type="button" data-edit-admin-notice="${esc(notice.id)}">編輯</button><button class="btn danger-outline" type="button" data-delete-admin-notice="${esc(notice.id)}">刪除</button></div></article>`;
  }).join('')||'<div class="admin-notice-empty">目前還沒有事務公告，可直接在下方發布。</div>';
  all('[data-edit-admin-notice]').forEach(button=>button.onclick=()=>loadAdminNoticeEditor(button.dataset.editAdminNotice));
  all('[data-delete-admin-notice]').forEach(button=>button.onclick=()=>deleteAdminNotice(button.dataset.deleteAdminNotice));
}
function resetAdminNoticeEditor(focus=false){
  editingAdminNoticeId='';
  $('adminNoticeEditorTitle').textContent='發布新公告';
  $('adminNoticeTitle').value='事務通知';
  $('adminNoticeBody').value='';
  $('saveAdminNotice').textContent='發布公告';
  $('cancelAdminNoticeEdit').classList.add('hidden');
  setAdminNoticeFeedback();
  if(focus)setTimeout(()=>$('adminNoticeTitle').focus(),50);
}
function loadAdminNoticeEditor(id,focus=true){
  const old=normalizeAdminNotices(state).find(notice=>notice.id===id);
  if(!old)return alert('找不到這則公告，可能已由其他裝置刪除。');
  editingAdminNoticeId=old.id;
  $('adminNoticeEditorTitle').textContent='編輯公告';
  $('adminNoticeTitle').value=old.title;
  $('adminNoticeBody').value=old.body;
  $('saveAdminNotice').textContent='儲存修改';
  $('cancelAdminNoticeEdit').classList.remove('hidden');
  setAdminNoticeFeedback('正在編輯這則公告。','editing');
  $('adminNoticeEditorPanel').scrollIntoView({block:'nearest',behavior:'smooth'});
  if(focus)setTimeout(()=>$('adminNoticeTitle').focus(),50);
}
function openAdminNoticeManager(id=''){
  if(!isHost)return alert('只有管理員可以發布公告。');
  renderAdminNoticeManager();
  if(id)loadAdminNoticeEditor(id,false);else resetAdminNoticeEditor();
  $('adminNoticeModal').classList.remove('hidden');
}
function closeAdminNoticeManager(){editingAdminNoticeId='';$('adminNoticeModal').classList.add('hidden')}
async function publishAdminNotice(){
  if(!isHost)return alert('只有管理員可以發布公告。');
  const title=$('adminNoticeTitle').value.trim(),body=$('adminNoticeBody').value.trim(),button=$('saveAdminNotice');
  if(button.disabled)return;
  if(!title){$('adminNoticeTitle').focus();return alert('請輸入公告標題。')}
  if(!body){$('adminNoticeBody').focus();return alert('請輸入公告內容。')}
  const notices=normalizeAdminNotices(state),editedId=editingAdminNoticeId,old=editedId?notices.find(notice=>notice.id===editedId):null,wasEditing=!!editedId,record={id:editedId||randomToken(),title:title.slice(0,40),body:body.slice(0,500),publishedAt:old?.publishedAt||new Date().toISOString()};
  if(wasEditing&&!old)return alert('這則公告已由其他裝置刪除，請取消編輯後重新新增。');
  setAdminNotices(wasEditing?notices.map(notice=>notice.id===editedId?record:notice):[record,...notices]);
  renderDashboard();
  button.disabled=true;button.textContent=wasEditing?'儲存中…':'新增中…';
  try{
    await saveNow();
    resetAdminNoticeEditor();
    renderAdminNoticeManager();
    setAdminNoticeFeedback(wasEditing?'公告已修改並同步到所有裝置。':'公告已發布並同步到所有裝置。','success');
  }catch(error){
    saveSoon();
    setAdminNoticeFeedback(`公告已保留，正在等待重新同步：${formatError(error)}`,'error');
  }finally{
    button.disabled=false;button.textContent=editingAdminNoticeId?'儲存修改':'發布公告';
  }
}
async function deleteAdminNotice(id=''){
  if(!isHost)return alert('只有管理員可以刪除公告。');
  const notices=normalizeAdminNotices(state),target=notices.find(notice=>notice.id===(id||notices[0]?.id));
  if(!target)return alert('目前沒有可刪除的公告。');
  if(!confirm(`確定刪除公告「${target.title}」？`))return;
  const before=notices,wasEditing=editingAdminNoticeId===target.id;
  setAdminNotices(notices.filter(notice=>notice.id!==target.id));renderDashboard();renderAdminNoticeManager();
  try{
    await saveNow();
    if(wasEditing)resetAdminNoticeEditor();
    renderAdminNoticeManager();
    setAdminNoticeFeedback('公告已刪除。','success');
  }catch(error){
    setAdminNotices(before);renderDashboard();renderAdminNoticeManager();
    if(wasEditing)loadAdminNoticeEditor(target.id,false);
    setAdminNoticeFeedback(`刪除失敗，公告已保留：${formatError(error)}`,'error');
  }
}
async function endTodaySession(){
  if(!isHost)return;
  if(!confirm('確定結束今日球局？\n\n系統會先同步並建立完整備份，再清除目前比分、下一場叫號、出席與候場；已完成的比賽紀錄會保留。'))return;
  const button=$('endSessionBtn'),originalText=button?.textContent||'結束今日球局',beforeEnd=structuredClone(state);
  let backupCreated=false;
  if(button){button.disabled=true;button.textContent='同步與備份中…'}
  try{
    setSync('同步與備份中');
    await saveNow();
    await createCloudBackup('session',{silent:true,system:true});
    backupCreated=true;
    state.match={...initialState().match};
    state.nextCall=null;
    state.attendance=[];
    state.court=[];
    state.waitingQueue=[];
    state.queueDraftChosen=[];
    state.priority=null;
    $('resultModal').classList.add('hidden');
    renderAll();
    await saveNow();
    setSync('已結束並備份','online');
    await loadBackups().catch(()=>{});
    alert('今日球局已結束並完成同步備份，總覽已顯示目前沒有比賽。');
  }catch(error){
    state=beforeEnd;
    renderAll();
    setSync('結束球局失敗','error');
    alert(`結束球局未完成，今日資料仍完整保留。${backupCreated?'備份已建立，但清除同步失敗。':'同步或備份失敗。'}\n\n${formatError(error)}`);
  }finally{
    if(button){button.textContent=originalText;button.disabled=false}
    renderDashboard();
  }
}

$('clearHistory').onclick=clearAllHistory;$('addPollOption').onclick=addPollOption;$('submitVote').onclick=submitPollVote;$('confirmNextEvent').onclick=confirmNextEvent;$('clearNextEvent').onclick=clearNextEvent;$('announceBtn').onclick=()=>{const text=calloutText();if(!text)return alert('目前尚未安排下一場。');speak(text)};$('monthPick').value=localMonthKey();$('monthPick').onchange=renderStats;$('thisMonthBtn').onclick=()=>{$('monthPick').value=localMonthKey();renderStats()};$('createRoom').onclick=createRoom;$('joinRoom').onclick=()=>enterRoom($('joinCode').value);$('favoriteRoomBtn').onclick=()=>{const r=roomRecord(roomId)||rememberRoom(roomId,isHost);updateRoomRecord(roomId,{favorite:!r.favorite})};$('renameRoomBtn').onclick=()=>{const r=roomRecord(roomId)||rememberRoom(roomId,isHost),name=prompt('替這台裝置上的球局取一個名稱：',r.name||'7B 羽球團');if(name===null)return;updateRoomRecord(roomId,{name:name.trim().slice(0,30)})};$('autoReturnRoom').checked=localStorage.getItem(ROOM_AUTO_KEY)==='1';$('autoReturnRoom').onchange=()=>localStorage.setItem(ROOM_AUTO_KEY,$('autoReturnRoom').checked?'1':'0');$('adminLoginBtn').onclick=async()=>{const pin=prompt('輸入管理員 PIN：');if(pin===null)return;const h=await sha256(pin.trim());if(!adminPinHash||h!==adminPinHash)return alert('PIN 不正確。');hostToken=(await getDoc(roomRef)).data().hostToken;localStorage.setItem(hostKey(roomId),hostToken);isHost=true;$('roleBadge').textContent='管理員';$('roleBadge').className='pill host';$('viewerNote').classList.add('hidden');applyRole();renderAll();alert('已切換為管理員模式。')};$('qrBtn').onclick=()=>{const url=currentUrl();$('qrImage').src='https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(url);$('qrRoomCode').textContent='房間代碼：'+roomId;$('qrModal').classList.remove('hidden')};$('closeQr').onclick=()=>$('qrModal').classList.add('hidden');$('claimPlayer').onclick=async()=>{const p=player(editId);if(!p)return;if(p.ownerHash&&p.ownerHash!==selfHash&&!confirm(`「${p.name}」目前綁定在另一台裝置。確定這是你的資料，並改綁到目前裝置嗎？`))return;const updated={...p,ownerHash:selfHash};await saveSelfPlayer(updated);$('selfNote').textContent=`你已認領「${p.name}」，現在可在這台裝置修改姓名、球拍與備註。`;$('selfNote').classList.remove('hidden');state.roster=state.roster.map(x=>x.id===p.id?updated:x);updateProfilePermissions();renderRoster()};$('joinCode').onkeydown=e=>{if(e.key==='Enter')enterRoom(e.target.value)};$('leaveBtn').onclick=()=>{if(unsubscribe)unsubscribe();sessionStorage.setItem(ROOM_SKIP_AUTO_ONCE,'1');history.replaceState(null,'',location.pathname);location.reload()};$('shareBtn').onclick=async()=>{const url=currentUrl();try{await navigator.clipboard.writeText(url);alert(`觀看網址已複製。\n房間代碼：${roomId}`)}catch{prompt('複製觀看網址：',url)}};$('openPollReminder').onclick=()=>page(6);all('.tab').forEach(b=>b.onclick=()=>page(+b.dataset.page));$('addPlayer').onclick=()=>{const n=$('newName').value.trim();if(!n)return;if(state.roster.some(p=>p.name===n))return alert('已有相同姓名');state.roster.push({id:randomToken(),name:n,voiceName:defaultVoiceName(n),avatar:'',racket:'',racketTension:'',racketString:'',backupRacket:'',backupTension:'',backupString:'',note:'',favorite:false,ownerHash:''});$('newName').value='';renderAll();saveSoon()};$('allAttend').onclick=()=>{state.attendance=state.roster.map(p=>p.id);reconcileWaitingQueue();renderAll();saveSoon()};$('clearAttend').onclick=()=>{state.attendance=[];state.court=[];state.waitingQueue=[];state.queueDraftChosen=[];state.priority=null;renderAll();saveSoon()};$('goCourt').onclick=()=>{if(state.attendance.length<4)return alert('至少需要四位出席球員');if(state.court.length<4)state.court=state.attendance.slice(0,4);reconcileWaitingQueue(state.court);renderAll();page(3);saveSoon()};$('randomCourt').onclick=()=>{state.court=shuffle(state.attendance).slice(0,4);reconcileWaitingQueue(state.court);renderAll();saveSoon()};$('target').onchange=()=>{state.rules.target=Math.max(1,+$('target').value||11);saveSoon()};$('cap').onchange=()=>{state.rules.cap=Math.max(state.rules.target,+$('cap').value||15);saveSoon()};$('deuce').onchange=()=>{state.rules.deuce=$('deuce').value==='1';saveSoon()};$('startMatch').onclick=startMatch;function addPointAndSpeak(team){if(!isHost||state.match.winner!==null)return;state.match.rallies.push(team);replay();if(voiceEnabled)setTimeout(announceScore,80)}const scoreSideA=$('namesA').closest('.score-side'),scoreSideB=$('namesB').closest('.score-side');scoreSideA.classList.add('clickable');scoreSideB.classList.add('clickable');scoreSideA.onclick=()=>addPointAndSpeak(0);scoreSideB.onclick=()=>addPointAndSpeak(1);$('scoreA').onclick=e=>{e.stopPropagation();addPointAndSpeak(0)};$('scoreB').onclick=e=>{e.stopPropagation();addPointAndSpeak(1)};$('undo').onclick=()=>{if(state.match.rallies.length){state.match.rallies.pop();replay()}};$('minusA').onclick=()=>{const i=state.match.rallies.lastIndexOf(0);if(i>=0){state.match.rallies.splice(i,1);replay()}};$('minusB').onclick=()=>{const i=state.match.rallies.lastIndexOf(1);if(i>=0){state.match.rallies.splice(i,1);replay()}};$('exitScore').onclick=()=>{state.match.active=false;renderScore();saveSoon()};$('shuffleNext').onclick=()=>{const vals=shuffle([0,1,2,3].map(i=>$('n'+i).value));vals.forEach((v,i)=>{$('n'+i).value=v});updatePriority()};$('startNext').onclick=startNext;$('closeResult').onclick=()=>{dismissedResultKey=currentResultKey();$('resultModal').classList.add('hidden')};$('voiceToggle').onclick=()=>{voiceEnabled=!voiceEnabled;localStorage.setItem('bdV76Voice',voiceEnabled?'1':'0');if(!voiceEnabled&&'speechSynthesis'in window)window.speechSynthesis.cancel();updateVoiceButton()};$('speakerTest').onclick=speakerTest;$('audioHelp').onclick=()=>$('audioHelpModal').classList.remove('hidden');$('closeAudioHelp').onclick=()=>$('audioHelpModal').classList.add('hidden');$('editName').addEventListener('input',()=>profileDirty.name=true);$('editVoiceName').addEventListener('input',()=>profileDirty.voiceName=true);$('testVoiceName').onclick=()=>{if(!isHost)return;const p=player(editId);const name=$('editVoiceName').value.trim()||p?.name||'球員';speak(`請${name}準備上場。`)};$('editRacket').addEventListener('input',()=>profileDirty.racket=true);$('editRacketTension').addEventListener('input',()=>profileDirty.racketTension=true);$('editRacketString').addEventListener('input',()=>profileDirty.racketString=true);$('editBackupRacket').addEventListener('input',()=>profileDirty.backupRacket=true);$('editBackupTension').addEventListener('input',()=>profileDirty.backupTension=true);$('editBackupString').addEventListener('input',()=>profileDirty.backupString=true);$('editNote').addEventListener('input',()=>profileDirty.note=true);$('editPhoto').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{pendingAvatar=await compressPhoto(file);refreshProfilePreview()}catch(err){alert(err.message||'照片處理失敗')}e.target.value=''};$('removePhoto').onclick=()=>{pendingAvatar='';refreshProfilePreview()};$('saveEdit').onclick=saveEdit;$('deletePlayer').onclick=()=>{if(!confirm('刪除這位球員？'))return;state.roster=state.roster.filter(p=>p.id!==editId);state.attendance=state.attendance.filter(x=>x!==editId);state.court=state.court.filter(x=>x!==editId);state.waitingQueue=state.waitingQueue.filter(x=>x!==editId);state.queueDraftChosen=state.queueDraftChosen.filter(x=>x!==editId);$('editModal').classList.add('hidden');renderAll();saveSoon()};$('closeEdit').onclick=()=>$('editModal').classList.add('hidden');$('playerSearch').addEventListener('input',renderRoster);$('playerSort').addEventListener('change',renderRoster);document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
$('leaveBtn').addEventListener('click',()=>{liveScoreUnsubscribe?.();chatUnsubscribe?.()},{capture:true});
$('sendChat').onclick=sendChatMessage;
$('chatMentionToggle').onclick=()=>{
  const panel=$('chatMentionPanel'),opening=panel.classList.contains('hidden');
  panel.classList.toggle('hidden',!opening);
  $('chatMentionToggle').setAttribute('aria-expanded',opening?'true':'false');
  if(opening)renderChatMentionList();
};
$('chatComposer').addEventListener('input',()=>{
  if(/(^|\s)@$/.test($('chatComposer').value)){
    $('chatMentionPanel').classList.remove('hidden');
    $('chatMentionToggle').setAttribute('aria-expanded','true');
  }
  updateChatSendButton();
});
$('chatComposer').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();sendChatMessage()}
});
$('addPlayer').onclick=addPlayerRecord;
$('closeEdit').onclick=closePlayerModal;
$('closeEditTop').onclick=closePlayerModal;
$('editModal').addEventListener('click',event=>{if(event.target===$('editModal'))closePlayerModal()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('editModal').classList.contains('hidden'))closePlayerModal()});
$('deletePlayer').onclick=()=>{if(!confirm('刪除這位球員？'))return;state.roster=state.roster.filter(p=>p.id!==editId);state.attendance=state.attendance.filter(x=>x!==editId);state.court=state.court.filter(x=>x!==editId);state.waitingQueue=state.waitingQueue.filter(x=>x!==editId);state.queueDraftChosen=state.queueDraftChosen.filter(x=>x!==editId);closePlayerModal();renderAll();saveSoon()};
$('goCourt').onclick=()=>{
  if(state.attendance.length<4)return alert('至少需要四位出席球員');
  const current=uniqueIds(state.court.length>=4?state.court:state.attendance.slice(0,4)).slice(0,4);
  state.court=teammateSafeLineup(current,{randomize:state.court.length<4});
  reconcileWaitingQueue(state.court);renderAll();page(3);saveSoon();
};
$('randomCourt').onclick=()=>{
  state.court=teammateSafeLineup(shuffle(state.attendance).slice(0,4),{randomize:true});
  reconcileWaitingQueue(state.court);renderAll();saveSoon();
};
$('shuffleNext').onclick=()=>{
  const vals=teammateSafeLineup([0,1,2,3].map(i=>$('n'+i).value),{randomize:true});
  vals.forEach((value,index)=>{$('n'+index).value=value});
  updatePriority();
};
$('saveMatchReplay').onclick=saveMatchReplayPlaylist;
$('clearMatchReplay').onclick=clearMatchReplayPlaylist;
$('matchReplayUrl').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveMatchReplayPlaylist()}});
$('matchReplayTitle').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveMatchReplayPlaylist()}});
$('newRoomMenuBtn').onclick=()=>{if(confirm('建立另一個全新球局房間？\n目前房間不會被刪除。'))createRoom()};
$('backupCenterBtn').onclick=()=>page(7);
$('deviceSyncBtn').onclick=()=>setupDeviceSync().catch(error=>alert(formatError(error)));
$('landingDeviceSyncBtn').onclick=()=>setupDeviceSync().catch(error=>showRoomCreationError(formatError(error)));
$('copyDeviceSyncBtn').onclick=copyDeviceSyncCode;
$('adminNoticeManagerBtn').onclick=()=>openAdminNoticeManager();
$('newAdminNotice').onclick=()=>resetAdminNoticeEditor(true);
$('saveAdminNotice').onclick=publishAdminNotice;
$('cancelAdminNoticeEdit').onclick=()=>resetAdminNoticeEditor(true);
$('closeAdminNotice').onclick=closeAdminNoticeManager;
$('adminNoticeBody').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter')publishAdminNotice()});
$('endSessionBtn').onclick=endTodaySession;
if($('editNextEventFromPoll'))$('editNextEventFromPoll').onclick=openNextEventEditor;
$('closeNextEventEditor').onclick=closeNextEventEditor;
$('cancelNextEventEdits').onclick=closeNextEventEditor;
$('saveNextEventEdits').onclick=saveNextEventEdits;
$('editNextEventRentalTotal').addEventListener('input',updateNextEventEditFeePreview);
$('editNextEventParticipants').addEventListener('input',updateNextEventEditFeePreview);
$('editNextEventLocation').addEventListener('input',()=>updateMapPreview('editNextEventLocation','editNextEventLocationMap'));
$('enablePushPrompt').onclick=enablePushFromPrompt;
$('dismissPushPrompt').onclick=()=>closePushPrompt();
const originalAdminLoginHandler=$('adminLoginBtn').onclick;
$('adminLoginBtn').onclick=async()=>{await originalAdminLoginHandler();if(isHost)updateRoomRecord(roomId,{lastRole:'host',hostToken,lastUsed:Date.now()})};
$('confirmPollOption').addEventListener('change',updateConfirmOptionDetails);
$('confirmRentalTotal').addEventListener('input',updateConfirmFeePreview);
$('pollNote').addEventListener('input',()=>updateMapPreview('pollNote','pollLocationMap'));
$('confirmLocation').addEventListener('input',()=>{$('confirmLocation').dataset.autoVenue='0';updateMapPreview('confirmLocation','confirmLocationMap')});
$('statsSort').onchange=renderStats;
$('statsOrder').onchange=renderStats;
$('savePollDeadline').onclick=savePollDeadline;
$('clearPollDeadline').onclick=clearPollDeadline;
$('newPollBtn').onclick=startNewPoll;
$('pollDeadline').onfocus=()=>{$('pollDeadline').min=pollDeadlineInputValue(new Date().toISOString())};
$('pushNotificationBtn').onclick=setPushNotificationEnabled;
$('pushTestBtn').onclick=testPushNotification;
updatePushNotificationButton();
$('androidRemoteAPlus').onclick=()=>handleAndroidRemoteAction('teamAPlus');
$('androidRemoteBPlus').onclick=()=>handleAndroidRemoteAction('teamBPlus');
$('androidRemoteUndo').onclick=()=>handleAndroidRemoteAction('undo');
$('androidRemoteLogin').onclick=()=>$('adminLoginBtn').click();
$('androidRemoteKeyAccessBtn').onclick=()=>{
  try{window.BcmAndroid?.openRemoteKeyAccessSettings?.()}catch{setAndroidRemoteFeedback('請到 Android 設定開啟按鍵存取權限','error')}
};
$('androidRemoteRecordingToggle').onclick=()=>{
  if(!isHost){setAndroidRemoteFeedback('請先完成管理員登入','error');return}
  if(!isAndroidRemoteKeyAccessEnabled()){setAndroidRemoteFeedback('請先開啟按鍵存取權限','error');return}
  try{window.BcmAndroid?.setRecordingModeEnabled?.(!isAndroidRecordingModeEnabled());renderAndroidRemote()}catch{setAndroidRemoteFeedback('無法切換錄影計分模式','error')}
};
$('androidRemoteOpenCamera').onclick=()=>{
  if(!isHost){setAndroidRemoteFeedback('請先完成管理員登入','error');return}
  if(!isAndroidRemoteKeyAccessEnabled()){setAndroidRemoteFeedback('請先開啟按鍵存取權限','error');return}
  try{window.BcmAndroid?.openVideoCamera?.()}catch{setAndroidRemoteFeedback('無法開啟相機錄影','error')}
};
$('androidRemoteRefresh').onclick=()=>location.reload();
$('scoreRemoteBtn').onclick=openScoreRemoteSettings;
$('scoreRemoteQuickBtn').onclick=openScoreRemoteSettings;
$('closeScoreRemote').onclick=closeScoreRemoteSettings;
$('scoreRemoteToggle').onclick=()=>{scoreRemoteEnabled=!scoreRemoteEnabled;localStorage.setItem(SCORE_REMOTE_ENABLED_KEY,scoreRemoteEnabled?'1':'0');scoreRemoteStatusKind='';scoreRemoteStatusMessage=scoreRemoteEnabled?'已開啟，等待遙控器按鍵':'遙控計分已關閉';updateScoreRemoteUi()};
$('resetScoreRemote').onclick=()=>{if(!confirm('恢復預設按鍵設定？'))return;scoreRemoteBindings={...DEFAULT_SCORE_REMOTE_BINDINGS};saveScoreRemoteBindings();scoreRemoteLearningAction='';scoreRemoteStatusMessage='已恢復預設按鍵';updateScoreRemoteUi()};
all('[data-remote-learn]').forEach(button=>button.onclick=()=>startScoreRemoteLearning(button.dataset.remoteLearn));
$('scoreRemoteModal').addEventListener('click',event=>{if(event.target===$('scoreRemoteModal'))closeScoreRemoteSettings()});
document.addEventListener('keydown',handleScoreRemoteKeyboard,true);
document.addEventListener('keypress',handleScoreRemoteKeyboard,true);
document.addEventListener('keyup',handleScoreRemoteKeyboard,true);
document.addEventListener('click',handleScoreRemoteVirtualClick,true);
updateScoreRemoteUi();
if(!$('pollTime').value)$('pollTime').value='01:00';
if(!$('pollEndTime').value)$('pollEndTime').value=suggestedEndTime($('pollTime').value);
$('pollTime').addEventListener('change',()=>{$('pollEndTime').value=suggestedEndTime($('pollTime').value)});
updateDeviceSyncControls();
initializeDeviceProfileSync().catch(error=>console.warn('Device profile initialization failed',error));
const APP_THEME_KEY='bcmAppThemeV1';
const APP_RANDOM_THEME_KEY='bcmRandomAppThemeV1';
const APP_THEMES=new Set(['default','court','ocean','sunset','lavender','rose','midnight','dawn','mint','peach','lagoon','starlight','sand']);
const APP_THEME_COLORS={default:'#031523',court:'#072a24',ocean:'#05263a',sunset:'#2d1b23',lavender:'#1d1936',rose:'#301b2b',midnight:'#02111f',dawn:'#302617',mint:'#082a25',peach:'#321f22',lagoon:'#062a2b',starlight:'#11102b',sand:'#2b2419'};
const appThemeSelect=$('appThemeSelect');
const randomAppThemeToggle=$('randomAppThemeToggle');
let randomAppThemeEnabled=localStorage.getItem(APP_RANDOM_THEME_KEY)==='1',appThemeWasHidden=false;
function applyAppTheme(value){
  const theme=APP_THEMES.has(value)?value:'default';
  document.documentElement.dataset.appTheme=theme;
  if(appThemeSelect)appThemeSelect.value=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',APP_THEME_COLORS[theme]);
  localStorage.setItem(APP_THEME_KEY,theme);
}
function randomAppTheme(){const current=localStorage.getItem(APP_THEME_KEY)||'default',themes=[...APP_THEMES].filter(theme=>theme!==current),value=crypto.getRandomValues(new Uint32Array(1))[0];return themes[value%themes.length]}
function updateRandomAppThemeButton(){if(!randomAppThemeToggle)return;randomAppThemeToggle.setAttribute('aria-pressed',randomAppThemeEnabled?'true':'false');randomAppThemeToggle.textContent=randomAppThemeEnabled?'🎲 隨機背景已開啟':'🎲 開啟隨機背景';randomAppThemeToggle.title=randomAppThemeEnabled?'點擊關閉每次開啟隨機背景':'點擊開啟每次開啟隨機背景'}
applyAppTheme(randomAppThemeEnabled?randomAppTheme():localStorage.getItem(APP_THEME_KEY)||'default');
updateRandomAppThemeButton();
if(appThemeSelect)appThemeSelect.onchange=()=>applyAppTheme(appThemeSelect.value);
if(randomAppThemeToggle)randomAppThemeToggle.onclick=()=>{randomAppThemeEnabled=!randomAppThemeEnabled;localStorage.setItem(APP_RANDOM_THEME_KEY,randomAppThemeEnabled?'1':'0');if(randomAppThemeEnabled)applyAppTheme(randomAppTheme());updateRandomAppThemeButton()};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){appThemeWasHidden=true;return}if(appThemeWasHidden){appThemeWasHidden=false;if(randomAppThemeEnabled)applyAppTheme(randomAppTheme())}});
const roomMoreBtn=$('roomMoreBtn'),roomMoreMenu=$('roomMoreMenu');
function setRoomMoreOpen(open){roomMoreMenu.classList.toggle('hidden',!open);roomMoreBtn.setAttribute('aria-expanded',open?'true':'false');roomMoreBtn.textContent=open?'收起':'⋯ 更多'}
roomMoreBtn.onclick=e=>{e.stopPropagation();setRoomMoreOpen(roomMoreMenu.classList.contains('hidden'))};
roomMoreMenu.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&button.id!=='wakeLockBtn')setRoomMoreOpen(false)});
document.addEventListener('click',e=>{if(!roomMoreMenu.classList.contains('hidden')&&!e.target.closest('.roombar'))setRoomMoreOpen(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setRoomMoreOpen(false)});

const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+7);$('pollDate').value=localDateKey(tomorrow);updateVoiceButton();$('backupExportBtn').onclick=exportBackup;$('backupImportBtn').onclick=()=>$('backupImportFile').click();$('backupImportFile').onchange=e=>{if(e.target.files?.[0])importBackup(e.target.files[0]);e.target.value=''};$('createCloudBackup').onclick=()=>createCloudBackup('manual').catch(e=>alert(formatError(e)));$('refreshBackups').onclick=loadBackups;renderRoomLibrary();$('autoReturnRoom').checked=localStorage.getItem(ROOM_AUTO_KEY)==='1';const q=new URLSearchParams(location.search),rid=(q.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);const skipAutoOnce=sessionStorage.getItem(ROOM_SKIP_AUTO_ONCE)==='1';if(skipAutoOnce)sessionStorage.removeItem(ROOM_SKIP_AUTO_ONCE);if(rid)connectRoom(rid);else if(!skipAutoOnce&&localStorage.getItem(ROOM_AUTO_KEY)==='1'){const lastId=localStorage.getItem('bcmLastRoomV1'),r=roomRecord(lastId);if(r)setTimeout(()=>openSavedRoom(r.id),180)}
function exportBackup(){const data={schemaVersion:1,appVersion:BCM_VERSION,createdAt:new Date().toISOString(),roomId,counts:backupCounts(),data:encodeState(state)};downloadJson(data,`BCM_Backup_${roomId||'LOCAL'}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`)}
function importBackup(file){const fr=new FileReader();fr.onload=async()=>{try{const b=JSON.parse(fr.result),data=b.data||b;if(!data||!Array.isArray(data.roster)||!Array.isArray(data.history))throw new Error('備份檔缺少球員或歷史資料');if(!roomRef||!isHost)throw new Error('請先以管理員身分進入球局');if(!confirm(`準備還原本機備份：\n球員 ${data.roster.length} 人\n紀錄 ${data.history.length} 場\n\n還原前會先建立 Emergency Backup。`))return;const typed=prompt('請輸入「還原」：','');if(typed!=='還原')return;await createCloudBackup('emergency',{silent:true});state=cleanState(data);await saveNow();renderAll();alert('本機備份還原成功。');await loadBackups()}catch(e){alert('無法還原：'+(e.message||e))}};fr.readAsText(file)}
const refreshAppButtons=all('[data-refresh-app]');
refreshAppButtons.forEach(button=>button.onclick=()=>{refreshAppButtons.forEach(item=>{item.disabled=true;item.setAttribute('aria-busy','true');item.textContent=item.id==='refreshApp'?'↻':'↻ 重新載入…'});const url=new URL(location.href);url.searchParams.set('_refresh',Date.now().toString());setTimeout(()=>location.replace(url.toString()),50)});

const fullscreenScoreBtn=$('fullscreenScore'),fullscreenScoreView=$('scoreView');
const SCORE_THEME_KEY='bcmScoreThemeV1';
const SCORE_RANDOM_THEME_KEY='bcmRandomScoreThemeV1';
const SCORE_THEMES=new Set(['green','blue','black','purple','red','brown','teal','indigo','rose','amber','aurora','galaxy','sunset','waves']);
const scoreThemeSelect=$('scoreTheme');
const randomThemeToggle=$('randomThemeToggle');
let randomScoreThemeEnabled=localStorage.getItem(SCORE_RANDOM_THEME_KEY)==='1';
function applyScoreTheme(value){
  const theme=SCORE_THEMES.has(value)?value:'green';
  fullscreenScoreView.dataset.scoreTheme=theme;
  if(scoreThemeSelect)scoreThemeSelect.value=theme;
  localStorage.setItem(SCORE_THEME_KEY,theme);
}
function updateRandomThemeButton(){
  if(!randomThemeToggle)return;
  const action=randomScoreThemeEnabled?'關閉下一場隨機背景':'開啟下一場隨機背景';
  randomThemeToggle.setAttribute('aria-pressed',randomScoreThemeEnabled?'true':'false');
  randomThemeToggle.setAttribute('aria-label',action);
  randomThemeToggle.title=action;
  randomThemeToggle.textContent='🎲';
}
function randomizeScoreThemeAtMatchStart(){
  if(!randomScoreThemeEnabled)return;
  const current=fullscreenScoreView.dataset.scoreTheme;
  const choices=[...SCORE_THEMES].filter(theme=>theme!==current);
  applyScoreTheme(choices[Math.floor(Math.random()*choices.length)]||'green');
}
applyScoreTheme(localStorage.getItem(SCORE_THEME_KEY)||'green');
if(scoreThemeSelect)scoreThemeSelect.onchange=()=>applyScoreTheme(scoreThemeSelect.value);
updateRandomThemeButton();
if(randomThemeToggle)randomThemeToggle.onclick=()=>{
  randomScoreThemeEnabled=!randomScoreThemeEnabled;
  localStorage.setItem(SCORE_RANDOM_THEME_KEY,randomScoreThemeEnabled?'1':'0');
  updateRandomThemeButton();
};
function currentFullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null}
function isScoreFullscreen(){return !!currentFullscreenElement()||fullscreenScoreView?.classList.contains('immersive-mode')}
function updateFullscreenButton(){
  if(!fullscreenScoreBtn)return;
  const fullscreen=isScoreFullscreen();
  fullscreenScoreBtn.textContent='⛶';
  fullscreenScoreBtn.setAttribute('aria-label',fullscreen?'離開全螢幕':'進入全螢幕');
  fullscreenScoreBtn.title=fullscreen?'離開全螢幕':'進入全螢幕';
}
async function exitScoreFullscreen(){fullscreenScoreView?.classList.remove('immersive-mode');if(currentFullscreenElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document)}updateFullscreenButton()}
async function toggleScoreFullscreen(){if(isScoreFullscreen())return exitScoreFullscreen();const enter=fullscreenScoreView?.requestFullscreen||fullscreenScoreView?.webkitRequestFullscreen;if(enter){try{await enter.call(fullscreenScoreView);return updateFullscreenButton()}catch{}}fullscreenScoreView?.classList.add('immersive-mode');updateFullscreenButton()}
if(fullscreenScoreBtn)fullscreenScoreBtn.onclick=toggleScoreFullscreen;
document.addEventListener('fullscreenchange',updateFullscreenButton);
document.addEventListener('webkitfullscreenchange',updateFullscreenButton);
const exitScoreBtn=$('exitScore');if(exitScoreBtn)exitScoreBtn.addEventListener('click',exitScoreFullscreen);

window.bcmMarkBooted?.();
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){
  const swRevision='20260723-353';
  navigator.serviceWorker.register(`./sw.js?v=${swRevision}`,{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
}
