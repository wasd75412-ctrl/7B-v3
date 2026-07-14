import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, onSnapshot, setDoc, serverTimestamp, runTransaction, collection, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import noSleepMedia from 'nosleep.js/src/media.js';
import appPackage from '../package.json';

const firebaseConfig={apiKey:'AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM',authDomain:'badminton-7a1c3.firebaseapp.com',projectId:'badminton-7a1c3',storageBucket:'badminton-7a1c3.firebasestorage.app',messagingSenderId:'883534015507',appId:'1:883534015507:web:a7f6fb318151b6d07563e6',measurementId:'G-C97B98H7YW'};
const fbApp=initializeApp(firebaseConfig);
const db=initializeFirestore(fbApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const BCM_VERSION=appPackage.version;
const brandFontRequest=document.fonts?.load('400 1em "JasonHandwriting9"','7B 羽球社').then(faces=>faces.length>0).catch(()=>false)??Promise.resolve(false);
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
function wholeAmount(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n):0}
const initialState=()=>({version:9.4,roster:[],attendance:[],court:[],waitingQueue:[],queueDraftChosen:[],priority:null,match:{active:false,players:[[],[]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null},rules:{target:11,cap:15,deuce:true},history:[],nextCall:null,schedulePoll:{status:'open',deadlineAt:'',options:[],votes:{},voterPlayers:{}},nextEvent:null,updatedAt:null});
let state=initialState(), roomId='', roomRef=null, isHost=false, hostToken='', adminPinHash='', unsubscribe=null, applying=false, saveTimer=null, editId=null;const expandedPlayerNotes=new Set();let profileOriginal=null,profileDirty={name:false,voiceName:false,racket:false,racketTension:false,racketString:false,backupRacket:false,backupTension:false,backupString:false,note:false};let voiceEnabled=localStorage.getItem('bdV76Voice')!=='0';let dismissedResultKey='';const selfToken=localStorage.getItem('bdV73SelfToken')||randomToken();localStorage.setItem('bdV73SelfToken',selfToken);let selfHash='';
let roomSnapshotFromCache=false,snapshotHasPendingWrites=false,pendingRoomWrites=0,roomWriteScheduled=false;
const requestedPage=new URLSearchParams(location.search).get('page');

async function sha256(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function encodeState(src){
  const m=src.match||{};
  return {
    version:9.4,
    roster:Array.isArray(src.roster)?src.roster:[],
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
      matchId:m.matchId||null
    },
    rules:{...src.rules},
    nextCall:src.nextCall&&Array.isArray(src.nextCall.players)?{
      players:src.nextCall.players.filter(Boolean).slice(0,4),
      createdAt:src.nextCall.createdAt||''
    }:null,
    schedulePoll:{
      status:src.schedulePoll?.status==='closed'?'closed':'open',
      deadlineAt:src.schedulePoll?.deadlineAt||'',
      options:(Array.isArray(src.schedulePoll?.options)?src.schedulePoll.options:[]).map(o=>({id:o.id||randomToken(),date:o.date||'',time:o.time||'',note:o.note||''})),
      votes:src.schedulePoll?.votes&&typeof src.schedulePoll.votes==='object'?src.schedulePoll.votes:{},
      voterPlayers:src.schedulePoll?.voterPlayers&&typeof src.schedulePoll.voterPlayers==='object'?src.schedulePoll.voterPlayers:{}
    },
    nextEvent:src.nextEvent?{optionId:src.nextEvent.optionId||'',date:src.nextEvent.date||'',time:src.nextEvent.time||'',location:src.nextEvent.location||'',note:src.nextEvent.note||'',rentalTotal:wholeAmount(src.nextEvent.rentalTotal),participantCount:wholeAmount(src.nextEvent.participantCount),perPersonFee:wholeAmount(src.nextEvent.perPersonFee),publishedAt:src.nextEvent.publishedAt||''}:null,
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
    roster:Array.isArray(d.roster)?d.roster.map(p=>({...p,voiceName:p.voiceName||defaultVoiceName(p.name),backupRacket:p.backupRacket||'',racketTension:p.racketTension||'',racketString:p.racketString||'',backupTension:p.backupTension||'',backupString:p.backupString||'',favorite:!!p.favorite})):[],
    attendance:Array.isArray(d.attendance)?d.attendance:[],
    court:Array.isArray(d.court)?d.court:[],
    waitingQueue:Array.isArray(d.waitingQueue)?d.waitingQueue:[],
    queueDraftChosen:Array.isArray(d.queueDraftChosen)?d.queueDraftChosen:[],
    nextCall:d.nextCall&&Array.isArray(d.nextCall.players)?{
      players:d.nextCall.players.filter(Boolean).slice(0,4),
      createdAt:d.nextCall.createdAt||''
    }:null,
    schedulePoll:{
      status:d.schedulePoll?.status==='closed'?'closed':'open',
      deadlineAt:d.schedulePoll?.deadlineAt||'',
      options:Array.isArray(d.schedulePoll?.options)?d.schedulePoll.options:[],
      votes:d.schedulePoll?.votes&&typeof d.schedulePoll.votes==='object'?d.schedulePoll.votes:{},
      voterPlayers:d.schedulePoll?.voterPlayers&&typeof d.schedulePoll.voterPlayers==='object'?d.schedulePoll.voterPlayers:{}
    },
    nextEvent:d.nextEvent&&typeof d.nextEvent==='object'?{...d.nextEvent,rentalTotal:wholeAmount(d.nextEvent.rentalTotal),participantCount:wholeAmount(d.nextEvent.participantCount),perPersonFee:wholeAmount(d.nextEvent.perPersonFee)}:null,
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
function wakeAudioOutput(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();g.gain.setValueAtTime(0.0001,audioContext.currentTime);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.03)}catch(e){console.warn('音訊輸出初始化失敗',e)}}
function speakerTest(){wakeAudioOutput();if(!('speechSynthesis'in window))return alert('此瀏覽器不支援語音播報。');const wasEnabled=voiceEnabled;voiceEnabled=true;speak('喇叭測試，比分播報音量測試，GAME！',()=>{voiceEnabled=wasEnabled;updateVoiceButton()});}
function speak(text,onend){
  if(!('speechSynthesis'in window)||!text||!voiceEnabled)return;
  wakeAudioOutput();
  const runId=++speechRunId,synth=window.speechSynthesis;
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
function formatEventDate(date,time){if(!date)return'';const d=new Date(`${date}T${time||'00:00'}`);if(isNaN(d.getTime()))return `${date}${time?' '+time:''}`;const dateText=d.toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});return `${dateText}${time?` ${time}`:''}`}
function formatMoney(value){return new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(wholeAmount(value))}
function renderNextEventAnnouncement(){
  const box=$('nextEventAnnouncement'),e=state.nextEvent;
  if(!box)return;
  box.classList.toggle('hidden',!e?.date);
  if(!e?.date){box.innerHTML='';return}
  const rentalTotal=wholeAmount(e.rentalTotal),participantCount=wholeAmount(e.participantCount),perPersonFee=wholeAmount(e.perPersonFee);
  const fees=rentalTotal&&participantCount&&perPersonFee?`<div class="next-event-fees"><div class="next-event-fee"><span>場租總金額</span><strong>NT$ ${formatMoney(rentalTotal)}</strong><small>${participantCount} 人平均分攤</small></div><div class="next-event-fee"><span>每人需繳</span><strong>NT$ ${formatMoney(perPersonFee)}</strong><small>元以下無條件進位</small></div></div>`:'';
  box.innerHTML=`<h3>📣 下一次打球</h3><div class="next-event-main">${esc(formatEventDate(e.date,e.time))}</div><div class="next-event-place">📍 ${esc(e.location||'場地待公告')}</div>${e.note?`<div class="next-event-note">${esc(e.note)}</div>`:''}${fees}`;
}
function renderPollDeadlineAnnouncement(){const box=$('pollDeadlineAnnouncement'),poll=state.schedulePoll||{},hasPoll=(poll.options||[]).length>0,deadline=poll.deadlineAt||'';if(!box)return;box.classList.toggle('hidden',!hasPoll||!deadline);if(!hasPoll||!deadline){box.innerHTML='';return}const expired=isPollDeadlinePassed(poll),closed=isPollClosed(poll),time=esc(formatPollDeadline(deadline)),status=expired?'投票已截止':closed?'投票已提前關閉':'下次球局投票中',detail=expired?`已於 ${time} 截止`:closed?`原訂截止：${time}`:`截止時間：${time}`;box.className=`poll-deadline-card${closed?' closed':''}`;box.innerHTML=`<div><strong>🗳️ ${status}</strong><p>${detail}</p></div><button id="dashboardPollBtn" class="btn ${closed?'':'primary'}" type="button">${closed?'查看結果':'前往投票'}</button>`;$('dashboardPollBtn').onclick=()=>page(6)}
function calloutText(sourceIds){const ids=sourceIds||state.nextCall?.players||[];if(ids.length!==4||new Set(ids).size!==4)return'';return `下一場是左方 ${vname(ids[0])}和${vname(ids[1])}，對戰右方 ${vname(ids[2])}和${vname(ids[3])}。`}
function renderDashboard() {
    if (!$('dashScore')) return;

    renderNextEventAnnouncement();
    renderPollDeadlineAnnouncement();

    $('dashboardDate').textContent = new Date().toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
    });

    const m = state.match,
        teams = m.players || [[], []];

    $('dashScore').innerHTML = `
        <div class="dash-team">
            <div>A隊</div>
            <div class="dash-num">${m.scores?.[0] || 0}</div>
            <div class="dash-players">${(teams[0] || []).map(pname).join('／') || '尚未安排'}</div>
        </div>

        <div class="dash-vs">VS</div>

        <div class="dash-team">
            <div>B隊</div>
            <div class="dash-num">${m.scores?.[1] || 0}</div>
            <div class="dash-players">${(teams[1] || []).map(pname).join('／') || '尚未安排'}</div>
        </div>
    `;

    const played = state.history.filter(h => historyDate(h) === localDateKey()).length,
        active = state.attendance.length,
        waiting = state.attendance.filter(id => !state.court.includes(id)).length;

    $('dashMetrics').innerHTML = `
        <div class="metric"><strong>${played}</strong><span class="sub">今日場次</span></div>
        <div class="metric"><strong>${active}</strong><span class="sub">今日出席</span></div>
        <div class="metric"><strong>${waiting}</strong><span class="sub">候場人數</span></div>
        <div class="metric"><strong>${state.rules.target}</strong><span class="sub">勝利分</span></div>
    `;

    const eligibleWait = state.attendance.filter(id => !state.court.includes(id)),
        waitIds = uniqueIds(state.waitingQueue).filter(id => eligibleWait.includes(id));

    for (const id of eligibleWait) {
        if (!waitIds.includes(id)) waitIds.push(id);
    }

    $('dashWaiting').innerHTML =
        waitIds.map((id, i) => `
            <div class="dash-row">
                <span>${avatar(id, 'tiny')} ${esc(pname(id))}</span>
                <strong>${esc(queueLabel(i, waitIds.length))}</strong>
            </div>
        `).join('') ||
        '<p class="sub">目前沒有候場球員。</p>';

    const nc = state.nextCall?.players || [];

    $('nextCall').classList.toggle('hidden', nc.length !== 4);

    if (nc.length === 4) {
        $('nextCall').innerHTML = `
            <h3>🔔 下一場叫號</h3>
            <div><strong>A隊：</strong>${esc(pname(nc[0]))}、${esc(pname(nc[1]))}</div>
            <div><strong>B隊：</strong>${esc(pname(nc[2]))}、${esc(pname(nc[3]))}</div>
        `;
    }

    // ===== 修改開始 =====
    const { hot } = todayLeaders();

    $('hotCold').innerHTML = `
        <div class="leader-card hot">
            <strong>🔥 手感火熱</strong>
            <div>
                ${
                    hot
                        ? `${avatar(hot.p.id, 'tiny')} ${esc(hot.p.name)} · ${hot.s.streak} 連勝`
                        : '尚無連勝資料'
                }
            </div>
        </div>
    `;
    // ===== 修改結束 =====
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
function pollSignature(){return `${(state.schedulePoll?.options||[]).map(o=>o.id).sort().join(',')}|${state.schedulePoll?.deadlineAt||''}`}
function pollSeenKey(){return `bcmPollSeenV1:${roomId||'local'}`}
function isPollUnseen(){const sig=pollSignature();return !!(state.schedulePoll?.options||[]).length&&localStorage.getItem(pollSeenKey())!==sig}
function markPollSeen(){const sig=pollSignature();if(sig)localStorage.setItem(pollSeenKey(),sig);renderPollNotice()}
function renderPollNotice(){const poll=state.schedulePoll||{},unseen=isPollUnseen()&&!isPollClosed(poll),dot=$('pollTabDot'),card=$('pollReminder'),text=$('pollReminderText');if(dot)dot.classList.toggle('hidden',!unseen);if(card)card.classList.toggle('hidden',!unseen);if(text)text.textContent=poll.deadlineAt?`請於 ${formatPollDeadline(poll.deadlineAt)} 前完成投票；不能參加也可以直接回覆。`:'請查看可參加的日期；不能參加也可以直接回覆。'}
function ownedPlayerId(){return state.roster.find(p=>p.ownerHash&&p.ownerHash===selfHash)?.id||''}
const PUSH_ENABLED_PREFIX='bcmPushEnabledV1:';
function pushEnabledKey(id=roomId){return `${PUSH_ENABLED_PREFIX}${id||'none'}`}
function supportsPush(){return 'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window}
function isIosLike(){return /iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function isStandaloneApp(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true}
function base64UrlBytes(value){const padded=value.padEnd(Math.ceil(value.length/4)*4,'=').replace(/-/g,'+').replace(/_/g,'/'),raw=atob(padded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes}
async function pushApi(path,options={}){const response=await fetch(`/.netlify/functions/${path}`,options);let data={};try{data=await response.json()}catch{}if(!response.ok){const error=new Error(data.error||'通知服務暫時無法使用');error.status=response.status;throw error}return data}
function updatePushNotificationButton(){const button=$('pushNotificationBtn'),testButton=$('pushTestBtn');if(!button)return;const supported=supportsPush(),enabled=!!roomId&&localStorage.getItem(pushEnabledKey())==='1'&&Notification.permission==='granted';button.setAttribute('aria-pressed',enabled?'true':'false');button.disabled=!roomId||!supported;if(testButton)testButton.disabled=!enabled||!supported;if(!supported)button.textContent='🔕 此裝置不支援通知';else if(Notification.permission==='denied')button.textContent='🔕 通知已被封鎖';else button.textContent=enabled?'🔔 本球局通知已開啟':'🔔 啟用投票通知'}
async function sendPushTest(subscription){return pushApi('push-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId,endpoint:subscription.endpoint})})}
async function testPushNotification(){
  const button=$('pushTestBtn');
  if(!roomId||!supportsPush())return alert('這個瀏覽器目前無法測試手機通知。');
  button.disabled=true;button.textContent='正在傳送測試通知…';
  try{
    if(Notification.permission!=='granted')throw new Error('請先啟用本球局通知。');
    const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
    if(!subscription){localStorage.removeItem(pushEnabledKey());throw new Error('這台裝置的通知訂閱已失效，請重新啟用投票通知。')}
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
    const playerId=ownedPlayerId()||$('pollVoter')?.value||'',playerName=playerId?pname(playerId):'';
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
      alert('已關閉這個球局的投票截止提醒。');
      return;
    }
    if(isIosLike()&&!isStandaloneApp())throw new Error('iPhone／iPad 請先用 Safari「加入主畫面」，再從主畫面開啟 7B 羽球社後設定通知。');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error(permission==='denied'?'通知權限已被封鎖，請到手機的網站通知設定中允許。':'你尚未允許通知。');
    const [config,registration]=await Promise.all([pushApi('push-config'),navigator.serviceWorker.ready]);
    const existing=await registration.pushManager.getSubscription();
    const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlBytes(config.publicKey)});
    const playerId=ownedPlayerId()||$('pollVoter')?.value||'',playerName=playerId?pname(playerId):'';
    await pushApi('push-subscription',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,roomId,clientHash:selfHash,playerId,playerName,subscription:subscription.toJSON()})});
    localStorage.setItem(pushEnabledKey(),'1');
    try{await sendPushTest(subscription);alert('投票通知已開啟，測試通知也已送出。之後會在投票截止前一天提醒。')}catch{alert('投票通知已開啟，但測試通知未成功送達；請稍後使用「傳送測試通知」再試一次。')}
  }catch(error){alert(error.message||'無法設定通知。')}finally{updatePushNotificationButton()}
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
function pollOptionLabel(o){if(!o?.date)return '未設定日期';const d=new Date(`${o.date}T${o.time||'00:00'}`);const date=isNaN(d)?o.date:d.toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});return `${date}${o.time?` ${o.time}`:''}${o.note?` · ${o.note}`:''}`}
function updateConfirmFeePreview(){
  const optionId=$('confirmPollOption')?.value||'',rentalTotal=wholeAmount($('confirmRentalTotal')?.value),participantCount=pollParticipantCount(optionId),perPersonFee=rentalTotal&&participantCount?Math.ceil(rentalTotal/participantCount):0;
  if($('confirmPerPersonFee'))$('confirmPerPersonFee').value=perPersonFee?`NT$ ${formatMoney(perPersonFee)}`:'';
  if($('confirmFeeHint'))$('confirmFeeHint').textContent=!optionId?'請先選擇已確定的日期。':!participantCount?'該日期目前沒有投票參加者。':!rentalTotal?`共 ${participantCount} 人參加；輸入場租後自動計算。`:`共 ${participantCount} 人參加，總額 NT$ ${formatMoney(rentalTotal)}，每人 NT$ ${formatMoney(perPersonFee)}（元以下進位）。`;
  return{rentalTotal,participantCount,perPersonFee};
}
function renderPoll(){
  if(!$('pollOptions'))return;
  const poll=state.schedulePoll||{status:'open',deadlineAt:'',options:[],votes:{},voterPlayers:{}},options=poll.options||[],counts=pollCounts(),mine=pollSelectionList(poll.votes?.[selfHash]),max=Math.max(0,...Object.values(counts));
  const deadlineExpired=isPollDeadlinePassed(poll);if(deadlineExpired&&poll.status!=='closed'){poll.status='closed';if(isHost&&roomRef)setTimeout(()=>saveSoon(),0)}const closed=isPollClosed(poll);
  const unavailableCount=Object.values(poll.votes||{}).filter(v=>pollSelectionList(v).includes(POLL_UNAVAILABLE)).length;
  const own=ownedPlayerId(),voter=$('pollVoter'),current=poll.voterPlayers?.[selfHash]||own||voter.value||'';
  voter.innerHTML='<option value="">請選擇姓名</option>'+state.roster.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  voter.value=state.roster.some(p=>p.id===current)?current:'';voter.disabled=!!own||closed;
  $('pollStatus').textContent=deadlineExpired?'投票已截止':closed?'投票已關閉':'投票開放中';$('pollStatus').className='poll-status '+(closed?'closed':'');$('togglePoll').textContent=closed?'重新開放投票':'關閉投票';
  const leaders=options.filter(o=>max>0&&counts[o.id]===max);
  $('pollSummary').innerHTML=options.length?(max?`目前最高票：<strong>${leaders.map(pollOptionLabel).map(esc).join('、')}</strong>（${max} 票）${unavailableCount?` · 無法參加 ${unavailableCount} 人`:''}`:`尚未有人選擇日期。${unavailableCount?`目前有 ${unavailableCount} 人無法參加。`:''}`):'管理員尚未新增候選日期。';
  const deadlineInfo=$('pollDeadlineInfo'),deadlineText=poll.deadlineAt?formatPollDeadline(poll.deadlineAt):'';deadlineInfo.className=`poll-deadline-info${closed?' closed':''}`;deadlineInfo.innerHTML=poll.deadlineAt?`<strong>${deadlineExpired?'⏰ 投票已截止':closed?'⏸️ 投票已關閉':'⏰ 投票截止'}</strong><span>${deadlineExpired?'截止時間：':closed?'原訂截止：':'請於 '}${esc(deadlineText)}${!closed?' 前完成投票':''}</span>`:`<strong>${closed?'⏸️ 投票已關閉':'⏰ 尚未設定投票截止時間'}</strong>`;
  const deadlineInput=$('pollDeadline');if(deadlineInput&&document.activeElement!==deadlineInput)deadlineInput.value=pollDeadlineInputValue(poll.deadlineAt);if($('clearPollDeadline'))$('clearPollDeadline').disabled=!poll.deadlineAt;
  const dateRows=options.map(o=>{const voters=Object.entries(poll.votes||{}).filter(([,v])=>pollSelectionList(v).includes(o.id)).map(([hash])=>pname(poll.voterPlayers?.[hash]||'')).filter(n=>n!=='未知球員');return `<label class="poll-option ${max>0&&counts[o.id]===max?'leading':''} ${closed?'closed':''}"><input class="viewer-enabled poll-choice poll-date-choice" type="checkbox" value="${o.id}" ${mine.includes(o.id)?'checked':''} ${closed?'disabled':''}><div><strong>${esc(pollOptionLabel(o))}</strong><div class="poll-voters">${voters.length?`已選：${esc(voters.join('、'))}`:'尚無人選擇'} ${isHost?`<button type="button" class="btn danger-outline host-only poll-delete" data-poll-delete="${o.id}" style="padding:5px 8px;margin-left:6px">刪除候選</button>`:''}</div></div><span class="poll-count">${counts[o.id]||0} 票</span></label>`}).join('');
  const unavailableVoters=Object.entries(poll.votes||{}).filter(([,v])=>pollSelectionList(v).includes(POLL_UNAVAILABLE)).map(([hash])=>pname(poll.voterPlayers?.[hash]||'')).filter(n=>n!=='未知球員');
  const unavailableRow=options.length?`<label class="poll-option unavailable ${closed?'closed':''}"><input class="viewer-enabled poll-choice poll-unavailable-choice" type="checkbox" value="${POLL_UNAVAILABLE}" ${mine.includes(POLL_UNAVAILABLE)?'checked':''} ${closed?'disabled':''}><div><strong>無法參加</strong><div class="poll-voters">${unavailableVoters.length?`已選：${esc(unavailableVoters.join('、'))}`:'目前無人選擇'}</div></div><span class="poll-count">${unavailableCount} 人</span></label>`:'';
  $('pollOptions').innerHTML=(dateRows+unavailableRow)||'<div class="poll-empty">尚無候選日期。</div>';
  $('submitVote').disabled=closed||!options.length;
  all('.poll-date-choice').forEach(x=>x.onchange=()=>{if(x.checked){const no= document.querySelector('.poll-unavailable-choice');if(no)no.checked=false}});
  const noChoice=document.querySelector('.poll-unavailable-choice');if(noChoice)noChoice.onchange=()=>{if(noChoice.checked)all('.poll-date-choice').forEach(x=>x.checked=false)};
  all('[data-poll-delete]').forEach(b=>b.onclick=e=>{e.preventDefault();deletePollOption(b.dataset.pollDelete)});
  const cp=$('confirmPollOption');
  if(cp){
    const current=state.nextEvent?.optionId||cp.value;
    cp.innerHTML='<option value="">請選擇已確定的日期</option>'+options.map(o=>`<option value="${o.id}">${esc(pollOptionLabel(o))}</option>`).join('');
    cp.value=options.some(o=>o.id===current)?current:'';
    $('confirmLocation').value=state.nextEvent?.location||'';
    $('confirmEventNote').value=state.nextEvent?.note||'';
    $('confirmRentalTotal').value=state.nextEvent?.rentalTotal||'';
    $('clearNextEvent').disabled=!state.nextEvent?.date;
    updateConfirmFeePreview();
  }
  schedulePollDeadlineTimer(poll);renderPollNotice();
}
function addPollOption(){const date=$('pollDate').value,time=$('pollTime').value,note=$('pollNote').value.trim();if(!date)return alert('請先選擇候選日期。');if(state.schedulePoll.options.some(o=>o.date===date&&o.time===time))return alert('這個日期與時間已經存在。');state.schedulePoll.options.push({id:randomToken(),date,time,note});state.schedulePoll.options.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));$('pollNote').value='';renderPoll();saveSoon()}
function deletePollOption(id){if(!confirm('刪除這個候選日期？相關票數也會移除。'))return;state.schedulePoll.options=state.schedulePoll.options.filter(o=>o.id!==id);for(const key of Object.keys(state.schedulePoll.votes||{}))state.schedulePoll.votes[key]=pollSelectionList(state.schedulePoll.votes[key]).filter(x=>x!==id).join('|');renderPoll();saveSoon()}
function confirmNextEvent(){
  const optionId=$('confirmPollOption').value,option=(state.schedulePoll.options||[]).find(o=>o.id===optionId),location=$('confirmLocation').value.trim(),note=$('confirmEventNote').value.trim();
  if(!option)return alert('請先選擇已確定的日期與時間。');
  if(!location)return alert('請填寫已預約的場地。');
  const {rentalTotal,participantCount,perPersonFee}=updateConfirmFeePreview();
  if(!rentalTotal)return alert('請填寫場租總金額。');
  if(!participantCount)return alert('這個日期目前沒有投票參加者，無法計算每人費用。');
  state.nextEvent={optionId:option.id,date:option.date,time:option.time||'',location,note,rentalTotal,participantCount,perPersonFee,publishedAt:new Date().toISOString()};
  renderDashboard();renderPoll();saveSoon();alert(`下一次打球資訊已發布到總覽。\n每人需繳 NT$ ${formatMoney(perPersonFee)}。`);
}
function clearNextEvent(){if(!state.nextEvent)return;if(!confirm('確定取消總覽中的下一次打球公告？'))return;state.nextEvent=null;renderDashboard();renderPoll();saveSoon()}
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
      tx.update(roomRef,{schedulePoll:{status:poll.status||'open',deadlineAt:poll.deadlineAt||'',options:Array.isArray(poll.options)?poll.options:[],votes,voterPlayers},updatedAt:serverTimestamp()});
    });
    state.schedulePoll.votes[selfHash]=selected.join('|');
    state.schedulePoll.voterPlayers[selfHash]=voterId;
    renderPoll();setSync('已同步','online');
    alert(selected.includes(POLL_UNAVAILABLE)?'已記錄為無法參加。':selected.length?'投票已更新。':'已取消本裝置的投票。');
  }catch(e){
    setSync('同步失敗','error');setError(formatError(e));alert(formatError(e));
  }finally{
    btn.textContent='送出／更新我的投票';
    btn.disabled=isPollClosed(state.schedulePoll)||!(state.schedulePoll.options||[]).length;
  }
}
function savePollDeadline(){const input=$('pollDeadline'),value=input.value;if(!value)return alert('請先選擇投票截止日期與時間。');const deadline=new Date(value);if(isNaN(deadline.getTime()))return alert('投票截止時間格式不正確。');if(deadline.getTime()<=Date.now())return alert('投票截止時間必須晚於現在。');const wasExpired=isPollDeadlinePassed(state.schedulePoll);state.schedulePoll.deadlineAt=deadline.toISOString();if(wasExpired)state.schedulePoll.status='open';renderPoll();renderDashboard();saveSoon();alert(`投票截止時間已設定為 ${formatPollDeadline(state.schedulePoll.deadlineAt)}。`)}
function clearPollDeadline(){const poll=state.schedulePoll;if(!poll.deadlineAt)return;const wasExpired=isPollDeadlinePassed(poll);poll.deadlineAt='';if(wasExpired)poll.status='open';renderPoll();renderDashboard();saveSoon()}
function togglePoll(){const poll=state.schedulePoll;if(isPollClosed(poll)){if(isPollDeadlinePassed(poll)){if(!confirm('截止時間已過；重新開放投票會清除原截止時間。確定繼續？'))return;poll.deadlineAt=''}poll.status='open'}else poll.status='closed';renderPoll();renderDashboard();saveSoon()}
function clearPollVotes(){if(prompt('要清空所有人的投票，請輸入「清空」：')!=='清空')return;state.schedulePoll.votes={};state.schedulePoll.voterPlayers={};renderPoll();saveSoon()}
function setError(msg=''){const b=$('cloudError');b.textContent=msg;b.classList.toggle('hidden',!msg)}function setLandingError(msg=''){const b=$('landingError');b.textContent=msg;b.classList.toggle('hidden',!msg)}function setSync(text,type=''){$('syncBadge').textContent=text;$('syncBadge').className='pill '+type}
function updateSyncBadge(){
  if(!roomRef)return;
  const pending=roomWriteScheduled||pendingRoomWrites>0||snapshotHasPendingWrites;
  if(!navigator.onLine||roomSnapshotFromCache)return setSync(isHost?'離線計分中':'離線瀏覽中','offline');
  if(pending)return setSync('正在補同步','pending');
  setSync('已同步','online');
}
window.addEventListener('offline',updateSyncBadge);
window.addEventListener('online',()=>{if(roomRef){setSync('重新連線中','pending');setError('')}});
function formatError(e){const code=e?.code||'unknown';if(!navigator.onLine&&(code==='unavailable'||code==='not-found'))return '目前沒有網路，而且這台裝置尚未快取此球局。請先連線進入一次，之後即可離線使用。';if(code==='permission-denied')return 'Firestore 權限被拒絕（permission-denied）。請到 Firebase → Firestore → 規則，發布 ZIP 內 FIRESTORE_RULES.txt 的內容。';if(code==='invalid-argument'&&String(e?.message||'').includes('Nested arrays'))return '資料格式錯誤：Firestore 不支援巢狀陣列。請部署 BCM 2.2.18 Two-Digit Score Fix 最新版。';return `Firebase 連線失敗：${code}\n${e?.message||e}`}
function hostKey(id){return `bcmHost_${id}`}
function currentUrl(id=roomId){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('room',id);return u.toString()}
function hostUrl(id=roomId,token=hostToken){const u=new URL(currentUrl(id));u.hash=`host=${encodeURIComponent(token)}`;return u.toString()}
function parseHostHash(){const m=location.hash.match(/(?:^#|&)host=([^&]+)/);return m?decodeURIComponent(m[1]):''}


const ROOM_LIBRARY_KEY='bcmRoomLibraryV1',ROOM_AUTO_KEY='bcmAutoReturnRoomV1',ROOM_SKIP_AUTO_ONCE='bcmSkipAutoReturnOnceV1';
function roomLibrary(){try{const x=JSON.parse(localStorage.getItem(ROOM_LIBRARY_KEY)||'[]');return Array.isArray(x)?x.filter(r=>r&&/^[A-Z0-9]{6}$/.test(r.id||'')):[]}catch{return[]}}
function saveRoomLibrary(rows){localStorage.setItem(ROOM_LIBRARY_KEY,JSON.stringify(rows.slice(0,20)))}
function roomRecord(id){return roomLibrary().find(r=>r.id===id)||null}
function roomDisplayName(r){return r?.name?.trim()||`7B 球局 ${r?.id||''}`}
function rememberRoom(id,host=false){const now=Date.now(),rows=roomLibrary();const old=rows.find(r=>r.id===id)||{};const next={id,name:old.name||'',favorite:!!old.favorite,lastUsed:now,lastRole:host?'host':'viewer'};saveRoomLibrary([next,...rows.filter(r=>r.id!==id)].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed));localStorage.setItem('bcmLastRoomV1',id);renderRoomLibrary();return next}
function updateRoomRecord(id,patch){const rows=roomLibrary(),idx=rows.findIndex(r=>r.id===id);if(idx<0)rows.unshift({id,name:'',favorite:false,lastUsed:Date.now(),lastRole:'viewer',...patch});else rows[idx]={...rows[idx],...patch};saveRoomLibrary(rows.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed));renderRoomLibrary();if(id===roomId)updateCurrentRoomControls()}
function forgetRoom(id){const r=roomRecord(id);if(!confirm(`確定從這台裝置移除「${roomDisplayName(r)}」？\n不會刪除 Firebase 裡的球局資料。`))return;saveRoomLibrary(roomLibrary().filter(x=>x.id!==id));if(localStorage.getItem('bcmLastRoomV1')===id)localStorage.removeItem('bcmLastRoomV1');localStorage.removeItem(hostKey(id));renderRoomLibrary()}
function openSavedRoom(id){location.href=currentUrl(id)}
function roomTime(ts){if(!ts)return'';const d=new Date(ts),today=new Date();const day=Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);if(day===0)return'今天使用';if(day===1)return'昨天使用';if(day<7)return`${day} 天前使用`;return d.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'})}
function savedRoomCard(r){return `<div class="saved-room ${r.favorite?'favorite':''}"><div class="saved-room-main"><div class="saved-room-name">${r.favorite?'⭐ ':''}${esc(roomDisplayName(r))}</div><div class="saved-room-meta">房號 ${esc(r.id)} · ${r.lastRole==='host'?'管理員':'觀看者'} · ${esc(roomTime(r.lastUsed))}</div></div><div class="saved-room-actions"><button class="btn primary" data-open-room="${r.id}">直接進入</button><button class="btn" data-toggle-room="${r.id}">${r.favorite?'取消常用':'加入常用'}</button><button class="btn danger-outline" data-forget-room="${r.id}">忘記</button></div></div>`}
function bindRoomLibraryActions(){all('[data-open-room]').forEach(b=>b.onclick=()=>openSavedRoom(b.dataset.openRoom));all('[data-toggle-room]').forEach(b=>b.onclick=()=>{const r=roomRecord(b.dataset.toggleRoom);updateRoomRecord(b.dataset.toggleRoom,{favorite:!r?.favorite})});all('[data-forget-room]').forEach(b=>b.onclick=()=>forgetRoom(b.dataset.forgetRoom))}
function renderRoomLibrary(){const rows=roomLibrary().sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsed-a.lastUsed),lastId=localStorage.getItem('bcmLastRoomV1'),last=rows.find(r=>r.id===lastId)||rows[0],cont=$('continueRoom'),fav=$('favoriteRooms'),recent=$('recentRooms');if(cont){cont.classList.toggle('hidden',!last);cont.innerHTML=last?`<strong>回到上次球局</strong><div style="font-size:1.25rem;font-weight:1000;margin-top:5px">${esc(roomDisplayName(last))}</div><div class="sub">房號 ${esc(last.id)} · ${esc(roomTime(last.lastUsed))}</div><button class="btn" data-open-room="${last.id}">繼續使用</button>`:''}const favorites=rows.filter(r=>r.favorite),recents=rows.filter(r=>!r.favorite).slice(0,5);if(fav){fav.classList.toggle('hidden',!favorites.length);fav.innerHTML=favorites.length?`<div class="room-library-title"><h3>⭐ 常用球局</h3></div>${favorites.map(savedRoomCard).join('')}`:''}if(recent){recent.classList.toggle('hidden',!recents.length);recent.innerHTML=recents.length?`<div class="room-library-title"><h3>最近加入</h3></div>${recents.map(savedRoomCard).join('')}`:''}bindRoomLibraryActions()}
function updateCurrentRoomControls(){if(!roomId)return;const r=roomRecord(roomId)||{id:roomId};$('favoriteRoomBtn').textContent=r.favorite?'★ 已加入常用':'☆ 加入常用';$('roomLocalName').textContent=r.name?` · ${r.name}`:''}
async function createRoom(){setLandingError('');let pin=prompt('請設定 4～8 位管理員 PIN。之後可在 iPad 或其他裝置輸入 PIN 進入管理員模式：','2580');if(pin===null)return;pin=pin.trim();if(!/^\d{4,8}$/.test(pin))return setLandingError('管理員 PIN 請輸入 4～8 位數字。');const id=randomCode(),token=randomToken(),ref=doc(db,'badmintonRooms',id);const pinHash=await sha256(pin);const data={...encodeState(initialState()),hostToken:token,adminPinHash:pinHash,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};try{await setDoc(ref,data);localStorage.setItem(hostKey(id),token);location.href=hostUrl(id,token)}catch(e){setLandingError(formatError(e))}}
async function enterRoom(id){id=id.trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);if(id.length!==6)return setLandingError('請輸入正確的 6 位房間代碼。');location.href=currentUrl(id)}
async function connectRoom(id){
  roomId=id;
  roomRef=doc(db,'badmintonRooms',id);
  selfHash=await sha256(selfToken);
  setSync(navigator.onLine?'連線中':'讀取離線資料','pending');
  try{
    const snap=await getDoc(roomRef);
    if(!snap.exists())throw Object.assign(new Error('找不到此房間'),{code:'not-found'});
    roomSnapshotFromCache=!!snap.metadata?.fromCache;
    snapshotHasPendingWrites=!!snap.metadata?.hasPendingWrites;
    const data=snap.data();
    adminPinHash=data.adminPinHash||'';
    hostToken=parseHostHash()||localStorage.getItem(hostKey(id))||'';
    isHost=!!hostToken&&hostToken===data.hostToken;
    if(isHost)localStorage.setItem(hostKey(id),hostToken);
    rememberRoom(id,isHost);
    applyState(data);
    $('landing').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('roomCode').textContent=id;
    $('scoreRoom').textContent=id;
    updateCurrentRoomControls();
    $('roleBadge').textContent=isHost?'管理員':'觀看者';
    $('roleBadge').className='pill '+(isHost?'host':'');
    $('viewerNote').classList.toggle('hidden',isHost);
    applyRole();
    updatePushNotificationButton();
    reconcilePushSubscription();
    if(requestedPage==='poll')page(6);
    unsubscribe=onSnapshot(roomRef,{includeMetadataChanges:true},s=>{
      if(!s.exists())return;
      applyState(s.data());
      roomSnapshotFromCache=!!s.metadata.fromCache;
      snapshotHasPendingWrites=!!s.metadata.hasPendingWrites;
      updateSyncBadge();
      if(!roomSnapshotFromCache&&!snapshotHasPendingWrites)setError('');
    },e=>{setSync(navigator.onLine?'同步中斷':isHost?'離線計分中':'離線瀏覽中',navigator.onLine?'error':'offline');setError(formatError(e))});
    updateSyncBadge();
    if(isHost&&navigator.onLine)setTimeout(ensureGenesisAndDaily,900);
  }catch(e){
    setLandingError(formatError(e));
    history.replaceState(null,'',location.pathname);
  }
}
function applyRole(){all('.host-only').forEach(el=>el.classList.toggle('hidden',!isHost));if(!isHost){$('resultModal').classList.add('hidden');$('scoreView').classList.add('hidden');}$('adminLoginBtn').classList.toggle('hidden',isHost);$('scoreRole').textContent=isHost?'管理員':'觀看模式';$('scoreA').classList.toggle('clickable',isHost);$('scoreB').classList.toggle('clickable',isHost);all('input,select,textarea').forEach(el=>{if(['editName','editRacket','editRacketTension','editRacketString','editBackupRacket','editBackupTension','editBackupString','editNote','editPhoto','joinCode','playerSearch','playerSort'].includes(el.id)||el.classList.contains('viewer-enabled'))return;if(!isHost)el.disabled=true;else el.disabled=false});if($('editVoiceName'))$('editVoiceName').disabled=!isHost}
function cleanState(d){return decodeState(d)}
function applyState(data){applying=true;state=cleanState(data);renderAll();applying=false}
function payload(){return {...encodeState(state),updatedAt:serverTimestamp()}}
function saveSoon(){
  if(!isHost||applying||!roomRef)return;
  clearTimeout(saveTimer);
  roomWriteScheduled=true;
  updateSyncBadge();
  saveTimer=setTimeout(()=>{
    roomWriteScheduled=false;
    pendingRoomWrites++;
    updateSyncBadge();
    setDoc(roomRef,payload(),{merge:true}).then(()=>{
      pendingRoomWrites=Math.max(0,pendingRoomWrites-1);
      updateSyncBadge();
    }).catch(e=>{
      pendingRoomWrites=Math.max(0,pendingRoomWrites-1);
      setSync('同步失敗','error');
      setError(formatError(e));
    });
  },120);
}
function page(n){all('.page').forEach(x=>x.classList.add('hidden'));$('page'+n).classList.remove('hidden');all('.tab').forEach(x=>x.classList.toggle('active',+x.dataset.page===n));if(n===0)renderDashboard();if(n===4)renderStats();if(n===5)renderHistory();if(n===6){markPollSeen();renderPoll()}if(n===7)loadBackups()}
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
function renderAttendance(){const box=$('attendance');box.innerHTML=state.roster.map(p=>`<button class="person ${state.attendance.includes(p.id)?'selected':''}" data-att="${p.id}">${avatar(p.id)}<span class="name">${esc(p.name)}</span></button>`).join('')||'<p class="sub">請先建立球員。</p>';all('[data-att]').forEach(b=>b.onclick=()=>{if(!isHost)return;const id=b.dataset.att;state.attendance=state.attendance.includes(id)?state.attendance.filter(x=>x!==id):[...state.attendance,id];state.court=state.court.filter(x=>state.attendance.includes(x));state.waitingQueue=state.waitingQueue.filter(x=>state.attendance.includes(x));state.queueDraftChosen=state.queueDraftChosen.filter(x=>state.attendance.includes(x));reconcileWaitingQueue();renderAttendance();renderCourt();saveSoon()})}
function options(selected=''){return `<option value="">請選擇</option>`+state.attendance.map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(pname(id))}</option>`).join('')}
function renderCourt(){for(let i=0;i<4;i++){const s=$('p'+i);s.innerHTML=options(state.court[i]||'');s.value=state.court[i]||'';s.onchange=()=>{if(!isHost)return;state.court[i]=s.value;reconcileWaitingQueue(state.court.filter(Boolean));renderWaiting();saveSoon()}}$('target').value=state.rules.target;$('cap').value=state.rules.cap;$('deuce').value=state.rules.deuce?'1':'0';renderWaiting()}
function renderWaiting(){const used=state.court.filter(Boolean),eligible=state.attendance.filter(id=>!used.includes(id));const ordered=uniqueIds(state.waitingQueue).filter(id=>eligible.includes(id));for(const id of eligible)if(!ordered.includes(id))ordered.push(id);state.priority=ordered[0]||null;$('waiting').innerHTML=ordered.map((id,i)=>`<span class="chip ${i===0?'priority':''}">${esc(queueLabel(i,ordered.length))} · ${esc(pname(id))}</span>`).join('')||'<span class="sub">目前沒有候場球員</span>'}
function winFor(sc){const {target,cap,deuce}=state.rules;for(let t=0;t<2;t++){const o=1-t;if(!deuce&&sc[t]>=target)return t;if(deuce&&sc[t]>=target&&sc[t]-sc[o]>=2)return t;if(deuce&&sc[t]>=cap)return t}return null}
function replay(){const m=state.match;m.scores=[0,0];m.serving=0;m.positions=[[0,1],[0,1]];m.winner=null;for(const t of m.rallies){if(m.winner!==null)break;const same=m.serving===t;m.scores[t]++;if(same)m.positions[t].reverse();else m.serving=t;m.winner=winFor(m.scores)}renderScore();if(m.winner!==null)finishMatch();saveSoon()}
function gamePoint(){const m=state.match;if(m.winner!==null)return false;for(let t=0;t<2;t++){const test=[...m.scores];test[t]++;if(winFor(test)===t)return true}return false}
function currentResultKey(){const m=state.match;if(m.winner===null)return'';return m.matchId||[m.winner,(m.scores||[]).join('-'),...(m.players||[]).flat()].join('|')}
function setServingPlayer(team,playerIndex){const m=state.match;if(!isHost||!m.active||m.winner!==null)return;m.serving=team;const serverSide=m.scores[team]%2===0?1:0;const positions=m.positions[team]||[0,1];const currentSide=positions.indexOf(playerIndex);if(currentSide!==serverSide&&currentSide>=0){const other=positions[serverSide];positions[serverSide]=playerIndex;positions[currentSide]=other;m.positions[team]=positions}renderScore();saveSoon()}
const hasNativeWakeLock=()=>!!navigator.wakeLock?.request;
function createVideoWakeLock(){
  const video=document.createElement('video');
  video.setAttribute('title','螢幕恆亮備援');
  video.setAttribute('playsinline','');
  video.setAttribute('muted','');
  video.muted=true;
  for(const type of ['webm','mp4']){const source=document.createElement('source');source.src=noSleepMedia[type];source.type=`video/${type}`;video.appendChild(source)}
  video.addEventListener('loadedmetadata',()=>{if(video.duration<=1)video.loop=true});
  video.addEventListener('timeupdate',()=>{if(video.duration>1&&video.currentTime>.5)video.currentTime=Math.random()*.4});
  let enabled=false;
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
function appWakeLockActive(){return (!!appWakeLock&&!appWakeLock.released)||fallbackNoSleep.isEnabled}
function renderAppWakeLockStatus(){
  const button=$('wakeLockBtn'),feedback=$('wakeLockFeedback');
  if(!button)return;
  const active=appWakeLockWanted&&appWakeLockActive(),pending=appWakeLockWanted&&(!!appWakeLockRequest||!!fallbackWakeLockRequest);
  button.setAttribute('aria-pressed',active?'true':'false');
  button.setAttribute('aria-busy',pending?'true':'false');
  button.textContent=!appWakeLockWanted?'🌙 恆亮已關閉（點擊開啟）':active?'☀️ 恆亮已開啟（點擊關閉）':pending?'☀️ 正在啟用恆亮…':'☀️ 點擊開啟螢幕恆亮';
  button.title=appWakeLockWanted?'點擊關閉螢幕恆亮':'點擊開啟螢幕恆亮';
  if(feedback){
    feedback.className=`wake-lock-feedback ${active?'success':appWakeLockWanted&&appWakeLockLastError?'error':pending?'pending':''}`;
    feedback.textContent=!appWakeLockWanted?'已關閉；iPad 將依系統設定熄屏。':active?'✅ 已開啟；點按上方按鈕即可關閉。':appWakeLockLastError?`⚠️ 尚未啟用：${appWakeLockLastError}`:pending?'正在向 iPad 取得螢幕恆亮權限…':'尚未啟用；請點上方按鈕。';
  }
}
function enableFallbackWakeLock(){
  if(!appWakeLockWanted)return Promise.resolve(false);
  if(fallbackNoSleep.isEnabled)return Promise.resolve(true);
  if(fallbackWakeLockRequest)return fallbackWakeLockRequest;
  fallbackWakeLockRequest=fallbackNoSleep.enable().then(()=>{if(!appWakeLockWanted){fallbackNoSleep.disable();return false}appWakeLockLastError='';return true}).catch(()=>{appWakeLockLastError='iPad 未允許防熄屏，請關閉低耗電模式後再點一次。';return false}).finally(()=>{fallbackWakeLockRequest=null;renderAppWakeLockStatus()});
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
  renderAppWakeLockStatus();
}
async function syncAppWakeLock(userActivated=false){
  if(!appWakeLockWanted){await releaseAppWakeLock();return}
  if(document.hidden){await releaseAppWakeLock();return}
  if(appWakeLockActive()){renderAppWakeLockStatus();return}
  if(appWakeLockRequest){
    if(userActivated&&!fallbackNoSleep.isEnabled)void enableFallbackWakeLock().then(()=>{if(appWakeLock&&!appWakeLock.released&&fallbackNoSleep.isEnabled)fallbackNoSleep.disable();renderAppWakeLockStatus()});
    renderAppWakeLockStatus();
    try{await appWakeLockRequest}catch{}
    if(fallbackWakeLockRequest)await fallbackWakeLockRequest;
    return;
  }
  if(!hasNativeWakeLock()){
    await enableFallbackWakeLock();
    return;
  }
  const fallbackAttempt=userActivated?enableFallbackWakeLock():null;
  appWakeLockRequest=navigator.wakeLock.request('screen');
  renderAppWakeLockStatus();
  try{
    const lock=await appWakeLockRequest;
    if(document.hidden||!appWakeLockWanted){await lock.release();return}
    appWakeLock=lock;
    appWakeLockLastError='';
    if(fallbackAttempt)await fallbackAttempt;
    if(fallbackNoSleep.isEnabled)fallbackNoSleep.disable();
    lock.addEventListener('release',()=>{
      if(appWakeLock===lock)appWakeLock=null;
      renderAppWakeLockStatus();
      scheduleAppWakeLockRetry();
    },{once:true});
  }catch(error){
    const fallbackEnabled=fallbackAttempt?await fallbackAttempt:await enableFallbackWakeLock();
    if(!fallbackEnabled){appWakeLockLastError='iPad 拒絕螢幕恆亮，請關閉低耗電模式後再試。';console.warn('無法保持 App 螢幕亮起',error)}
  }
  finally{appWakeLockRequest=null;renderAppWakeLockStatus()}
}
document.addEventListener('visibilitychange',()=>{void syncAppWakeLock()});
document.addEventListener('pointerdown',()=>{void syncAppWakeLock(true)},{passive:true});
document.addEventListener('touchend',()=>{void syncAppWakeLock(true)},{passive:true});
document.addEventListener('keydown',()=>{void syncAppWakeLock(true)});
window.addEventListener('focus',()=>scheduleAppWakeLockRetry(100));
window.addEventListener('pageshow',()=>scheduleAppWakeLockRetry(100));
window.addEventListener('pagehide',()=>{void releaseAppWakeLock()});
$('wakeLockBtn').onclick=async()=>{
  appWakeLockWanted=!appWakeLockWanted;
  localStorage.setItem(APP_WAKE_LOCK_KEY,appWakeLockWanted?'1':'0');
  appWakeLockLastError='';
  renderAppWakeLockStatus();
  if(appWakeLockWanted)await syncAppWakeLock(true);else await releaseAppWakeLock();
  renderAppWakeLockStatus();
};
setInterval(()=>{if(appWakeLockWanted&&!document.hidden&&!appWakeLockActive())void syncAppWakeLock()},30000);
void syncAppWakeLock();
function renderScore(){
  const m=state.match;
  const scoreAEl=$('scoreA'),scoreBEl=$('scoreB');
  scoreAEl.textContent=m.scores[0];
  scoreBEl.textContent=m.scores[1];
  scoreAEl.classList.toggle('two-digit',m.scores[0]>=10);
  scoreBEl.classList.toggle('two-digit',m.scores[1]>=10);

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
      return `<div class="court-name ${serving?'server':''}"><span class="score-player">${avatar(id,'score-large')}<span class="court-player-copy"><span class="court-position">${physicalSide}</span><span class="court-player-name${scoreNameClass(displayName)}">${esc(displayName)}</span></span></span></div>`;
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
  $('scoreView').classList.toggle('hidden',!m.active||!isHost);
  const resultKey=currentResultKey();
  if(!isHost){
    $('resultModal').classList.add('hidden');
  }else if(m.active&&m.winner!==null&&resultKey&&resultKey!==dismissedResultKey){
    $('resultModal').classList.remove('hidden');
  }else if(m.winner===null){
    $('resultModal').classList.add('hidden');
  }
}
function renderHistory(){const list=state.history.map((h,index)=>({h,index})).reverse();$('history').innerHTML=list.map(({h,index})=>`<div class="history-item"><div class="history-main"><strong>${esc((h.teams?.[0]||[]).map(pname).join('／'))} ${h.scores?.[0]??0}：${h.scores?.[1]??0} ${esc((h.teams?.[1]||[]).map(pname).join('／'))}</strong><div class="sub">${esc(h.time||'')}</div></div><div class="history-actions host-only"><button class="btn danger-outline" data-delete-history="${index}">刪除</button></div></div>`).join('')||'<p class="sub">尚無比賽紀錄。</p>';all('[data-delete-history]').forEach(btn=>btn.onclick=()=>deleteHistoryRecord(+btn.dataset.deleteHistory));applyRole()}
function deleteHistoryRecord(index){if(!isHost)return;const h=state.history[index];if(!h)return;const title=`${(h.teams?.[0]||[]).map(pname).join('／')} ${h.scores?.[0]??0}：${h.scores?.[1]??0} ${(h.teams?.[1]||[]).map(pname).join('／')}`;if(!confirm(`確定刪除這筆比賽紀錄？\n\n${title}\n${h.time||''}`))return;state.history.splice(index,1);renderAll();saveSoon()}
function clearAllHistory(){if(!isHost)return;if(!state.history.length)return alert('目前沒有比賽紀錄。');if(!confirm(`即將刪除全部 ${state.history.length} 筆比賽紀錄。\n球員名單與目前比分不會被刪除。`))return;const text=prompt('為避免誤刪，請輸入「清空」：','');if(text!=='清空')return alert('輸入不正確，已取消清空。');state.history=[];renderAll();saveSoon();alert('全部比賽紀錄已清空。')}
function renderAll(){renderRoster();renderAttendance();renderCourt();renderHistory();renderScore();renderDashboard();renderStats();renderPoll();applyRole()}
function startMatch(){dismissedResultKey='';const ids=state.court.filter(Boolean);if(ids.length!==4||new Set(ids).size!==4)return alert('請選擇四位不同球員。');reconcileWaitingQueue(ids);state.queueDraftChosen=[];randomizeScoreThemeAtMatchStart();state.match={active:true,players:[[ids[0],ids[1]],[ids[2],ids[3]]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null};saveSoon();renderScore()}
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
  const four=shuffle([...winners,...chosen]);
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
  dismissedResultKey='';const vals=[0,1,2,3].map(i=>$('n'+i).value);
  if(vals.some(x=>!x)||new Set(vals).size!==4)return alert('下一場需要四位不同球員。');
  const winners=state.match.players[state.match.winner];if(!winners.every(id=>vals.includes(id)))return alert('勝方兩位必須留場。');
  const finalCall=calloutText(vals);
  state.waitingQueue=projectedQueueForLineup(vals);state.queueDraftChosen=[];state.priority=state.waitingQueue[0]||null;
  state.court=[...vals];state.nextCall=null;
  randomizeScoreThemeAtMatchStart();
  state.match={active:true,players:[[vals[0],vals[1]],[vals[2],vals[3]]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null};
  $('resultModal').classList.add('hidden');renderAll();saveSoon();if(isHost&&voiceEnabled&&finalCall)setTimeout(()=>speak(finalCall),180)
}

function backupsRef(){return collection(db,'badmintonRooms',roomId,'backups')}
function backupDocRef(id){return doc(db,'badmintonRooms',roomId,'backups',id)}
function backupCounts(data=state){return{players:data.roster?.length||0,history:data.history?.length||0,attendance:data.attendance?.length||0,pollOptions:data.schedulePoll?.options?.length||0}}
function backupCompleteness(data=state){const checks=[Array.isArray(data.roster),Array.isArray(data.history),Array.isArray(data.attendance),!!data.match,!!data.rules,!!data.schedulePoll];return Math.round(checks.filter(Boolean).length/checks.length*100)}
function backupId(type,custom=''){if(custom)return custom;const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);return `${type}_${stamp}_${randomToken().slice(0,5)}`}
function backupLabel(type){return({genesis:'Genesis Backup',manual:'手動備份',auto:'賽後自動備份',daily:'每日備份',emergency:'還原前保護備份'})[type]||'備份'}
function makeBackupRecord(type='manual',id=''){const clean=encodeState(state),now=new Date();return{schemaVersion:1,appVersion:BCM_VERSION,roomId,type,label:backupLabel(type),createdAt:now.toISOString(),createdAtMs:now.getTime(),createdBy:type==='auto'||type==='daily'?'系統':'管理員',counts:backupCounts(state),completeness:backupCompleteness(state),data:clean}}
async function createCloudBackup(type='manual',opts={}){if(!roomId||!roomRef)throw new Error('尚未進入球局');if(!isHost&&!opts.system)throw new Error('只有管理員可以建立備份');const id=backupId(type,opts.id||'');const ref=backupDocRef(id);if(opts.id&&['genesis','daily','auto'].includes(type)){const exists=await getDoc(ref);if(exists.exists())return{id,skipped:true}}const record=makeBackupRecord(type,id);await setDoc(ref,record);if(type==='auto'||type==='daily')await pruneAutomaticBackups();if(!opts.silent){alert(`${record.label}已建立`);await loadBackups()}return{id,record}}
async function ensureGenesisAndDaily(){if(!isHost||!roomId)return;try{await createCloudBackup('genesis',{id:'genesis',silent:true,system:true});const day=localDateKey();await createCloudBackup('daily',{id:`daily_${day}`,silent:true,system:true});await loadBackups()}catch(e){console.warn('自動備份未建立',e);setError('雲端備份尚未啟用：'+formatError(e))}}
async function pruneAutomaticBackups(){const snaps=await getDocs(query(backupsRef(),orderBy('createdAtMs','desc'),limit(60)));const autos=snaps.docs.filter(d=>['auto','daily'].includes(d.data().type));for(const d of autos.slice(10))await deleteDoc(d.ref)}
function backupTypeName(type){return({genesis:'Genesis',manual:'手動',auto:'自動',daily:'每日',emergency:'保護'})[type]||type}
function formatBackupTime(v){const d=new Date(v||0);return isNaN(d)?'—':d.toLocaleString('zh-TW')}
let backupRows=[];
async function loadBackups(){const box=$('backupList'),health=$('backupHealth');if(!box||!health)return;if(!roomId){box.innerHTML='<div class="backup-loading">請先進入球局。</div>';return}box.innerHTML='<div class="backup-loading">正在讀取備份紀錄…</div>';try{const snaps=await getDocs(query(backupsRef(),orderBy('createdAtMs','desc'),limit(50)));backupRows=snaps.docs.map(d=>({id:d.id,...d.data()}));renderBackupCenter()}catch(e){box.innerHTML=`<div class="error-box">${esc(formatError(e))}</div>`;health.innerHTML='<div class="health-box"><span>備份狀態</span><strong>無法讀取</strong></div>'}}
function renderBackupCenter(){const rows=backupRows,genesis=rows.find(x=>x.id==='genesis'),last=rows[0],autoCount=rows.filter(x=>['auto','daily'].includes(x.type)).length,manualCount=rows.filter(x=>x.type==='manual').length;$('backupHealth').innerHTML=`<div class="health-box"><span class="sub">最後備份</span><strong>${last?esc(formatBackupTime(last.createdAt)):'尚未建立'}</strong></div><div class="health-box"><span class="sub">Genesis</span><strong>${genesis?'存在 ✅':'尚未建立'}</strong></div><div class="health-box"><span class="sub">自動／每日</span><strong>${autoCount} 份</strong></div><div class="health-box"><span class="sub">資料完整度</span><strong>${backupCompleteness()}%</strong></div>`;$('backupList').innerHTML=rows.length?rows.map(b=>`<div class="backup-row"><div><div class="backup-title"><span class="backup-type ${esc(b.type)}">${esc(backupTypeName(b.type))}</span>${esc(b.label||b.id)}</div><div class="backup-meta">${esc(formatBackupTime(b.createdAt))} · BCM ${esc(b.appVersion||'—')} · 球員 ${b.counts?.players??0} · 紀錄 ${b.counts?.history??0} · 完整度 ${b.completeness??'—'}%</div></div><div class="backup-row-actions"><button class="btn" data-backup-export="${esc(b.id)}">匯出</button>${isHost?`<button class="btn blue" data-backup-restore="${esc(b.id)}">還原</button>${b.id!=='genesis'?`<button class="btn danger-outline" data-backup-delete="${esc(b.id)}">刪除</button>`:''}`:''}</div></div>`).join(''):'<div class="poll-empty">尚無雲端備份。管理員可建立第一份備份。</div>';all('[data-backup-export]').forEach(b=>b.onclick=()=>exportCloudBackup(b.dataset.backupExport));all('[data-backup-restore]').forEach(b=>b.onclick=()=>restoreCloudBackup(b.dataset.backupRestore));all('[data-backup-delete]').forEach(b=>b.onclick=()=>deleteCloudBackup(b.dataset.backupDelete))}
async function exportCloudBackup(id){try{const snap=await getDoc(backupDocRef(id));if(!snap.exists())throw new Error('找不到備份');downloadJson(snap.data(),`BCM_Cloud_${roomId}_${id}.json`)}catch(e){alert(formatError(e))}}
function downloadJson(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function restoreCloudBackup(id){if(!isHost)return alert('只有管理員可以還原。');const row=backupRows.find(x=>x.id===id);if(!row)return alert('找不到備份。');if(!confirm(`確定還原「${row.label||id}」？\n\n球員 ${row.counts?.players??0} 人\n紀錄 ${row.counts?.history??0} 場\n時間 ${formatBackupTime(row.createdAt)}\n\n系統會先建立目前資料的保護備份。`))return;const typed=prompt('為避免誤操作，請輸入「還原」：','');if(typed!=='還原')return alert('已取消還原。');try{setSync('建立保護備份');await createCloudBackup('emergency',{silent:true});const snap=await getDoc(backupDocRef(id));if(!snap.exists())throw new Error('備份不存在');const b=snap.data();if(!b.data)throw new Error('備份資料不完整');await setDoc(roomRef,{...b.data,updatedAt:serverTimestamp()},{merge:true});state=cleanState(b.data);renderAll();setSync('還原完成','online');alert('還原成功，所有裝置會即時同步。');await loadBackups()}catch(e){setSync('還原失敗','error');alert(formatError(e))}}
async function deleteCloudBackup(id){if(id==='genesis')return alert('Genesis Backup 不可刪除。');if(!confirm('確定刪除這份雲端備份？'))return;try{await deleteDoc(backupDocRef(id));await loadBackups()}catch(e){alert(formatError(e))}}

let pendingAvatar=null;function refreshProfilePreview(){const p=player(editId),src=pendingAvatar!==null?pendingAvatar:(p?.avatar||'');$('editAvatarPreview').innerHTML=src?`<img src="${src}" alt="">`:esc(initials(p?.name));$('profileTitle').textContent=p?.name||'球員資料';const st=playerStats(editId),td=scopedStats(editId,'today'),mo=scopedStats(editId,'month'),status=playerStatus(editId),rel=relationshipStats(editId);$('statGames').textContent=st.games;$('statWins').textContent=st.wins;$('statRate').textContent=st.rate+'%';$('ringRate').textContent=st.rate+'%';$('profileWinRing').style.setProperty('--rate',st.rate);$('profileSummary').textContent=p?.racket?`🏸 ${p.racket}`:'🏸 尚未填寫球拍資料';$('profileMainRacket').textContent=[p?.racket,p?.racketTension,p?.racketString].filter(Boolean).join(' · ')||'尚未填寫';$('profileBackupRacket').textContent=[p?.backupRacket,p?.backupTension,p?.backupString].filter(Boolean).join(' · ')||'尚未填寫';$('profileStatus').textContent=status.label;const streak=td.streak?(td.kind==='W'?`🔥 ${td.streak}連勝`:`🧊 ${td.streak}連敗`):'—';$('profileToday').textContent=`${td.wins}勝 ${td.losses}敗`;$('profileMonth').textContent=`${mo.wins}勝 ${mo.losses}敗`;$('profileStreak').textContent=streak;$('profileBadges').innerHTML=careerBadges(editId).map(([icon,label,on])=>`<span class="career-badge ${on?'':'locked'}">${icon} ${label}</span>`).join('');$('profilePartnerRanking').innerHTML=relationRows(rel.partners,'尚無搭檔紀錄');$('profileOpponent').innerHTML=relationRows(rel.opponents,'尚無對戰紀錄');$('profileRecent').innerHTML='<h3>最近比賽</h3>'+((td.list.slice().reverse().slice(0,5).map(x=>`<div class="recent-game">${x.won?'✅ 勝':'❌ 敗'} · ${esc(x.h.scores[0]+'：'+x.h.scores[1])} · ${esc(x.h.time||'')}</div>`).join(''))||'<div class="sub">今日尚無比賽。</div>')}
function canEditPlayer(p){return !!p&&(isHost||p.ownerHash===selfHash)}
function updateProfilePermissions(){const p=player(editId),editable=canEditPlayer(p),claimable=!isHost&&p&&!editable;const claimBtn=$('claimPlayer');claimBtn.classList.toggle('hidden',!claimable);claimBtn.textContent=p?.ownerHash?'這是我的資料／重新認領':'這是我／認領資料';$('saveEdit').classList.toggle('hidden',!editable);$('profileEditFields').classList.toggle('hidden',!editable);$('photoHint').classList.toggle('hidden',!editable);['editName','editRacket','editRacketTension','editRacketString','editBackupRacket','editBackupTension','editBackupString','editNote','editPhoto','removePhoto'].forEach(id=>{const el=$(id);if(el)el.disabled=!editable});const voiceSection=$('voiceAdminSection');if(voiceSection)voiceSection.classList.toggle('hidden',!isHost);const voiceInput=$('editVoiceName');if(voiceInput)voiceInput.disabled=!isHost;const testVoice=$('testVoiceName');if(testVoice)testVoice.disabled=!isHost}
function openEdit(id){editId=id;const p=player(id);pendingAvatar=null;profileOriginal={name:p?.name||'',voiceName:p?.voiceName||defaultVoiceName(p?.name),racket:p?.racket||'',racketTension:p?.racketTension||'',racketString:p?.racketString||'',backupRacket:p?.backupRacket||'',backupTension:p?.backupTension||'',backupString:p?.backupString||'',note:p?.note||''};profileDirty={name:false,voiceName:false,racket:false,racketTension:false,racketString:false,backupRacket:false,backupTension:false,backupString:false,note:false};$('editName').value=profileOriginal.name;$('editVoiceName').value=profileOriginal.voiceName;$('editRacket').value=profileOriginal.racket;$('editRacketTension').value=profileOriginal.racketTension;$('editRacketString').value=profileOriginal.racketString;$('editBackupRacket').value=profileOriginal.backupRacket;$('editBackupTension').value=profileOriginal.backupTension;$('editBackupString').value=profileOriginal.backupString;$('editNote').value=profileOriginal.note;refreshProfilePreview();updateProfilePermissions();$('editModal').classList.remove('hidden')}
function compressPhoto(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const size=128,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d'),scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72))}catch(e){reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('照片讀取失敗'))};img.src=url})}
async function saveSelfPlayer(updated){try{setSync('同步中');const snap=await getDoc(roomRef);if(!snap.exists())throw new Error('房間不存在');const data=snap.data(),decoded=decodeState(data),idx=decoded.roster.findIndex(p=>p.id===updated.id);if(idx<0)throw new Error('找不到球員');decoded.roster[idx]={...decoded.roster[idx],...updated};await setDoc(roomRef,{roster:decoded.roster,updatedAt:serverTimestamp()},{merge:true});setSync('已同步','online')}catch(e){setSync('同步失敗','error');setError(formatError(e));throw e}}
async function saveEdit(){const p=player(editId);if(!canEditPlayer(p))return alert('你只能修改自己的資料。');const n=$('editName').value.trim();if(profileDirty.name&&!n)return alert('姓名不可空白');if(profileDirty.name&&state.roster.some(x=>x.id!==editId&&x.name===n))return alert('已有相同姓名');const updated={id:p.id};if(profileDirty.name)updated.name=n;if(isHost&&profileDirty.voiceName)updated.voiceName=$('editVoiceName').value.trim();if(profileDirty.racket)updated.racket=$('editRacket').value.trim();if(profileDirty.racketTension)updated.racketTension=$('editRacketTension').value.trim();if(profileDirty.racketString)updated.racketString=$('editRacketString').value.trim();if(profileDirty.backupRacket)updated.backupRacket=$('editBackupRacket').value.trim();if(profileDirty.backupTension)updated.backupTension=$('editBackupTension').value.trim();if(profileDirty.backupString)updated.backupString=$('editBackupString').value.trim();if(profileDirty.note)updated.note=$('editNote').value.trim();if(pendingAvatar!==null)updated.avatar=pendingAvatar;if(Object.keys(updated).length===1){$('editModal').classList.add('hidden');return}try{if(isHost){Object.assign(p,updated);renderAll();saveSoon()}else{await saveSelfPlayer(updated);Object.assign(p,updated);renderAll()}$('editModal').classList.add('hidden');alert('球員資料已儲存。')}catch(e){alert('球員資料儲存失敗：'+formatError(e))}}

$('clearHistory').onclick=clearAllHistory;$('addPollOption').onclick=addPollOption;$('submitVote').onclick=submitPollVote;$('confirmNextEvent').onclick=confirmNextEvent;$('clearNextEvent').onclick=clearNextEvent;$('togglePoll').onclick=togglePoll;$('clearPollVotes').onclick=clearPollVotes;$('announceBtn').onclick=()=>{const text=calloutText();if(!text)return alert('目前尚未安排下一場。');speak(text)};$('monthPick').value=localMonthKey();$('monthPick').onchange=renderStats;$('thisMonthBtn').onclick=()=>{$('monthPick').value=localMonthKey();renderStats()};$('createRoom').onclick=createRoom;$('joinRoom').onclick=()=>enterRoom($('joinCode').value);$('favoriteRoomBtn').onclick=()=>{const r=roomRecord(roomId)||rememberRoom(roomId,isHost);updateRoomRecord(roomId,{favorite:!r.favorite})};$('renameRoomBtn').onclick=()=>{const r=roomRecord(roomId)||rememberRoom(roomId,isHost),name=prompt('替這台裝置上的球局取一個名稱：',r.name||'7B 羽球團');if(name===null)return;updateRoomRecord(roomId,{name:name.trim().slice(0,30)})};$('autoReturnRoom').checked=localStorage.getItem(ROOM_AUTO_KEY)==='1';$('autoReturnRoom').onchange=()=>localStorage.setItem(ROOM_AUTO_KEY,$('autoReturnRoom').checked?'1':'0');$('adminLoginBtn').onclick=async()=>{const pin=prompt('輸入管理員 PIN：');if(pin===null)return;const h=await sha256(pin.trim());if(!adminPinHash||h!==adminPinHash)return alert('PIN 不正確。');hostToken=(await getDoc(roomRef)).data().hostToken;localStorage.setItem(hostKey(roomId),hostToken);isHost=true;$('roleBadge').textContent='管理員';$('roleBadge').className='pill host';$('viewerNote').classList.add('hidden');applyRole();renderAll();alert('已切換為管理員模式。建議現在於 iPad Safari 加入主畫面。')};$('qrBtn').onclick=()=>{const url=currentUrl();$('qrImage').src='https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(url);$('qrRoomCode').textContent='房間代碼：'+roomId;$('qrModal').classList.remove('hidden')};$('closeQr').onclick=()=>$('qrModal').classList.add('hidden');$('installHelpBtn').onclick=()=>$('installModal').classList.remove('hidden');$('closeInstall').onclick=()=>$('installModal').classList.add('hidden');$('claimPlayer').onclick=async()=>{const p=player(editId);if(!p)return;if(p.ownerHash&&p.ownerHash!==selfHash&&!confirm(`「${p.name}」目前綁定在另一台裝置。確定這是你的資料，並改綁到目前裝置嗎？`))return;const updated={...p,ownerHash:selfHash};await saveSelfPlayer(updated);$('selfNote').textContent=`你已認領「${p.name}」，現在可在這台裝置修改姓名、球拍與備註。`;$('selfNote').classList.remove('hidden');state.roster=state.roster.map(x=>x.id===p.id?updated:x);updateProfilePermissions();renderRoster()};$('joinCode').onkeydown=e=>{if(e.key==='Enter')enterRoom(e.target.value)};$('leaveBtn').onclick=()=>{if(unsubscribe)unsubscribe();sessionStorage.setItem(ROOM_SKIP_AUTO_ONCE,'1');history.replaceState(null,'',location.pathname);location.reload()};$('shareBtn').onclick=async()=>{const url=currentUrl();try{await navigator.clipboard.writeText(url);alert(`觀看網址已複製。\n房間代碼：${roomId}`)}catch{prompt('複製觀看網址：',url)}};$('openPollReminder').onclick=()=>page(6);all('.tab').forEach(b=>b.onclick=()=>page(+b.dataset.page));$('addPlayer').onclick=()=>{const n=$('newName').value.trim();if(!n)return;if(state.roster.some(p=>p.name===n))return alert('已有相同姓名');state.roster.push({id:randomToken(),name:n,voiceName:defaultVoiceName(n),avatar:'',racket:'',racketTension:'',racketString:'',backupRacket:'',backupTension:'',backupString:'',note:'',favorite:false,ownerHash:''});$('newName').value='';renderAll();saveSoon()};$('allAttend').onclick=()=>{state.attendance=state.roster.map(p=>p.id);reconcileWaitingQueue();renderAll();saveSoon()};$('clearAttend').onclick=()=>{state.attendance=[];state.court=[];state.waitingQueue=[];state.queueDraftChosen=[];state.priority=null;renderAll();saveSoon()};$('goCourt').onclick=()=>{if(state.attendance.length<4)return alert('至少需要四位出席球員');if(state.court.length<4)state.court=state.attendance.slice(0,4);reconcileWaitingQueue(state.court);renderAll();page(3);saveSoon()};$('randomCourt').onclick=()=>{state.court=shuffle(state.attendance).slice(0,4);reconcileWaitingQueue(state.court);renderAll();saveSoon()};$('target').onchange=()=>{state.rules.target=Math.max(1,+$('target').value||11);saveSoon()};$('cap').onchange=()=>{state.rules.cap=Math.max(state.rules.target,+$('cap').value||15);saveSoon()};$('deuce').onchange=()=>{state.rules.deuce=$('deuce').value==='1';saveSoon()};$('startMatch').onclick=startMatch;function addPointAndSpeak(team){if(!isHost||state.match.winner!==null)return;state.match.rallies.push(team);replay();if(voiceEnabled)setTimeout(announceScore,80)}const scoreSideA=$('namesA').closest('.score-side'),scoreSideB=$('namesB').closest('.score-side');scoreSideA.classList.add('clickable');scoreSideB.classList.add('clickable');scoreSideA.onclick=()=>addPointAndSpeak(0);scoreSideB.onclick=()=>addPointAndSpeak(1);$('scoreA').onclick=e=>{e.stopPropagation();addPointAndSpeak(0)};$('scoreB').onclick=e=>{e.stopPropagation();addPointAndSpeak(1)};$('undo').onclick=()=>{if(state.match.rallies.length){state.match.rallies.pop();replay()}};$('minusA').onclick=()=>{const i=state.match.rallies.lastIndexOf(0);if(i>=0){state.match.rallies.splice(i,1);replay()}};$('minusB').onclick=()=>{const i=state.match.rallies.lastIndexOf(1);if(i>=0){state.match.rallies.splice(i,1);replay()}};$('exitScore').onclick=()=>{state.match.active=false;renderScore();saveSoon()};$('shuffleNext').onclick=()=>{const vals=shuffle([0,1,2,3].map(i=>$('n'+i).value));vals.forEach((v,i)=>{$('n'+i).value=v});updatePriority()};$('startNext').onclick=startNext;$('closeResult').onclick=()=>{dismissedResultKey=currentResultKey();$('resultModal').classList.add('hidden')};$('voiceToggle').onclick=()=>{voiceEnabled=!voiceEnabled;localStorage.setItem('bdV76Voice',voiceEnabled?'1':'0');if(!voiceEnabled&&'speechSynthesis'in window)window.speechSynthesis.cancel();updateVoiceButton()};$('speakerTest').onclick=speakerTest;$('audioHelp').onclick=()=>$('audioHelpModal').classList.remove('hidden');$('closeAudioHelp').onclick=()=>$('audioHelpModal').classList.add('hidden');$('editName').addEventListener('input',()=>profileDirty.name=true);$('editVoiceName').addEventListener('input',()=>profileDirty.voiceName=true);$('testVoiceName').onclick=()=>{if(!isHost)return;const p=player(editId);const name=$('editVoiceName').value.trim()||p?.name||'球員';speak(`請${name}準備上場。`)};$('editRacket').addEventListener('input',()=>profileDirty.racket=true);$('editRacketTension').addEventListener('input',()=>profileDirty.racketTension=true);$('editRacketString').addEventListener('input',()=>profileDirty.racketString=true);$('editBackupRacket').addEventListener('input',()=>profileDirty.backupRacket=true);$('editBackupTension').addEventListener('input',()=>profileDirty.backupTension=true);$('editBackupString').addEventListener('input',()=>profileDirty.backupString=true);$('editNote').addEventListener('input',()=>profileDirty.note=true);$('editPhoto').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{pendingAvatar=await compressPhoto(file);refreshProfilePreview()}catch(err){alert(err.message||'照片處理失敗')}e.target.value=''};$('removePhoto').onclick=()=>{pendingAvatar='';refreshProfilePreview()};$('saveEdit').onclick=saveEdit;$('deletePlayer').onclick=()=>{if(!confirm('刪除這位球員？'))return;state.roster=state.roster.filter(p=>p.id!==editId);state.attendance=state.attendance.filter(x=>x!==editId);state.court=state.court.filter(x=>x!==editId);state.waitingQueue=state.waitingQueue.filter(x=>x!==editId);state.queueDraftChosen=state.queueDraftChosen.filter(x=>x!==editId);$('editModal').classList.add('hidden');renderAll();saveSoon()};$('closeEdit').onclick=()=>$('editModal').classList.add('hidden');$('playerSearch').addEventListener('input',renderRoster);$('playerSort').addEventListener('change',renderRoster);document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
$('confirmPollOption').addEventListener('change',updateConfirmFeePreview);
$('confirmRentalTotal').addEventListener('input',updateConfirmFeePreview);
$('statsSort').onchange=renderStats;
$('statsOrder').onchange=renderStats;
$('savePollDeadline').onclick=savePollDeadline;
$('clearPollDeadline').onclick=clearPollDeadline;
$('pollDeadline').onfocus=()=>{$('pollDeadline').min=pollDeadlineInputValue(new Date().toISOString())};
$('pushNotificationBtn').onclick=setPushNotificationEnabled;
$('pushTestBtn').onclick=testPushNotification;
updatePushNotificationButton();
const APP_THEME_KEY='bcmAppThemeV1';
const APP_THEMES=new Set(['default','court','ocean','sunset','lavender','rose','midnight']);
const APP_THEME_COLORS={default:'#eaf1f7',court:'#cce8da',ocean:'#cceaf6',sunset:'#f8dfd6',lavender:'#e5def7',rose:'#f5dfe7',midnight:'#0b2238'};
const appThemeSelect=$('appThemeSelect');
function applyAppTheme(value){
  const theme=APP_THEMES.has(value)?value:'default';
  document.documentElement.dataset.appTheme=theme;
  if(appThemeSelect)appThemeSelect.value=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',APP_THEME_COLORS[theme]);
  localStorage.setItem(APP_THEME_KEY,theme);
}
applyAppTheme(localStorage.getItem(APP_THEME_KEY)||'default');
if(appThemeSelect)appThemeSelect.onchange=()=>applyAppTheme(appThemeSelect.value);
const roomMoreBtn=$('roomMoreBtn'),roomMoreMenu=$('roomMoreMenu');
function setRoomMoreOpen(open){roomMoreMenu.classList.toggle('hidden',!open);roomMoreBtn.setAttribute('aria-expanded',open?'true':'false');roomMoreBtn.textContent=open?'收起':'⋯ 更多'}
roomMoreBtn.onclick=e=>{e.stopPropagation();setRoomMoreOpen(roomMoreMenu.classList.contains('hidden'))};
roomMoreMenu.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&button.id!=='wakeLockBtn')setRoomMoreOpen(false)});
document.addEventListener('click',e=>{if(!roomMoreMenu.classList.contains('hidden')&&!e.target.closest('.roombar'))setRoomMoreOpen(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setRoomMoreOpen(false)});

const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+7);$('pollDate').value=localDateKey(tomorrow);updateVoiceButton();$('backupExportBtn').onclick=exportBackup;$('backupImportBtn').onclick=()=>$('backupImportFile').click();$('backupImportFile').onchange=e=>{if(e.target.files?.[0])importBackup(e.target.files[0]);e.target.value=''};$('createCloudBackup').onclick=()=>createCloudBackup('manual').catch(e=>alert(formatError(e)));$('refreshBackups').onclick=loadBackups;renderRoomLibrary();$('autoReturnRoom').checked=localStorage.getItem(ROOM_AUTO_KEY)==='1';const q=new URLSearchParams(location.search),rid=(q.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);const skipAutoOnce=sessionStorage.getItem(ROOM_SKIP_AUTO_ONCE)==='1';if(skipAutoOnce)sessionStorage.removeItem(ROOM_SKIP_AUTO_ONCE);if(rid)connectRoom(rid);else if(!skipAutoOnce&&localStorage.getItem(ROOM_AUTO_KEY)==='1'){const lastId=localStorage.getItem('bcmLastRoomV1'),r=roomRecord(lastId);if(r)setTimeout(()=>openSavedRoom(r.id),180)}
function exportBackup(){const data={schemaVersion:1,appVersion:BCM_VERSION,createdAt:new Date().toISOString(),roomId,counts:backupCounts(),data:encodeState(state)};downloadJson(data,`BCM_Backup_${roomId||'LOCAL'}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`)}
function importBackup(file){const fr=new FileReader();fr.onload=async()=>{try{const b=JSON.parse(fr.result),data=b.data||b;if(!data||!Array.isArray(data.roster)||!Array.isArray(data.history))throw new Error('備份檔缺少球員或歷史資料');if(!roomRef||!isHost)throw new Error('請先以管理員身分進入球局');if(!confirm(`準備還原本機備份：\n球員 ${data.roster.length} 人\n紀錄 ${data.history.length} 場\n\n還原前會先建立 Emergency Backup。`))return;const typed=prompt('請輸入「還原」：','');if(typed!=='還原')return;await createCloudBackup('emergency',{silent:true});await setDoc(roomRef,{...encodeState(decodeState(data)),updatedAt:serverTimestamp()},{merge:true});state=cleanState(data);renderAll();alert('本機備份還原成功。');await loadBackups()}catch(e){alert('無法還原：'+(e.message||e))}};fr.readAsText(file)}
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

if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
