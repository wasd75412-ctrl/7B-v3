import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getFirestore, doc, getDoc, onSnapshot, setDoc, serverTimestamp, runTransaction, collection, getDocs, deleteDoc, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

const firebaseConfig={apiKey:'AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM',authDomain:'badminton-7a1c3.firebaseapp.com',projectId:'badminton-7a1c3',storageBucket:'badminton-7a1c3.firebasestorage.app',messagingSenderId:'883534015507',appId:'1:883534015507:web:a7f6fb318151b6d07563e6',measurementId:'G-C97B98H7YW'};
const fbApp=initializeApp(firebaseConfig);const db=getFirestore(fbApp);setTimeout(()=>document.getElementById('splash')?.classList.add('hide'),900);
const $=id=>document.getElementById(id), all=q=>[...document.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const randomCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let x='';crypto.getRandomValues(new Uint32Array(6)).forEach(n=>x+=chars[n%chars.length]);return x};
const randomToken=()=>crypto.randomUUID?.()||([...crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(36)).join(''));
const shuffle=a=>{a=[...a];const r=new Uint32Array(Math.max(1,a.length));crypto.getRandomValues(r);for(let i=a.length-1;i>0;i--){const j=r[i]% (i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const initialState=()=>({version:9.2,roster:[],attendance:[],court:[],waitingQueue:[],queueDraftChosen:[],priority:null,match:{active:false,players:[[],[]],scores:[0,0],rallies:[],serving:0,positions:[[0,1],[0,1]],winner:null},rules:{target:11,cap:15,deuce:true},history:[],nextCall:null,schedulePoll:{status:'open',options:[],votes:{},voterPlayers:{}},nextEvent:null,updatedAt:null});
let state=initialState(), roomId='', roomRef=null, isHost=false, hostToken='', adminPinHash='', unsubscribe=null, applying=false, saveTimer=null, editId=null;const expandedPlayerNotes=new Set();let profileOriginal=null,profileDirty={name:false,voiceName:false,racket:false,racketTension:false,racketString:false,backupRacket:false,backupTension:false,backupString:false,note:false};let voiceEnabled=localStorage.getItem('bdV76Voice')!=='0';let dismissedResultKey='';const selfToken=localStorage.getItem('bdV73SelfToken')||randomToken();localStorage.setItem('bdV73SelfToken',selfToken);let selfHash='';

async function sha256(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function encodeState(src){
  const m=src.match||{};
  return {
    version:9.2,
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
      options:(Array.isArray(src.schedulePoll?.options)?src.schedulePoll.options:[]).map(o=>({id:o.id||randomToken(),date:o.date||'',time:o.time||'',note:o.note||''})),
      votes:src.schedulePoll?.votes&&typeof src.schedulePoll.votes==='object'?src.schedulePoll.votes:{},
      voterPlayers:src.schedulePoll?.voterPlayers&&typeof src.schedulePoll.voterPlayers==='object'?src.schedulePoll.voterPlayers:{}
    },
    nextEvent:src.nextEvent?{optionId:src.nextEvent.optionId||'',date:src.nextEvent.date||'',time:src.nextEvent.time||'',location:src.nextEvent.location||'',note:src.nextEvent.note||'',publishedAt:src.nextEvent.publishedAt||''}:null,
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
      options:Array.isArray(d.schedulePoll?.options)?d.schedulePoll.options:[],
      votes:d.schedulePoll?.votes&&typeof d.schedulePoll.votes==='object'?d.schedulePoll.votes:{},
      voterPlayers:d.schedulePoll?.voterPlayers&&typeof d.schedulePoll.voterPlayers==='object'?d.schedulePoll.voterPlayers:{}
    },
    nextEvent:d.nextEvent&&typeof d.nextEvent==='object'?d.nextEvent:null,
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
