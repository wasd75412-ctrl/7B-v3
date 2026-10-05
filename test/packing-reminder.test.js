import test from 'node:test';
import assert from 'node:assert/strict';
import { duePackingEvent, eventStartMs, firestoreEventsFromDocument, roomEventsWithFallback } from '../netlify/functions/lib/packing-reminder.mjs';
import fs from 'node:fs';

function memoryStore(){
  const data=new Map();let writes=0;
  return{data,get writes(){return writes},async get(key){return data.has(key)?JSON.parse(data.get(key)):null},async setJSON(key,value){writes++;data.set(key,JSON.stringify(value))}};
}

const mapEvent=(id,date,time,location='')=>({mapValue:{fields:{id:{stringValue:id},date:{stringValue:date},time:{stringValue:time},location:{stringValue:location}}}});
const reminderSource=fs.readFileSync(new URL('../netlify/functions/packing-reminder.mjs',import.meta.url),'utf8');

test('開團提醒使用台北時間並只在設定的出發前區間觸發',()=>{
  const event={id:'e1',date:'2026-09-07',time:'18:00'};
  assert.equal(eventStartMs(event),Date.parse('2026-09-07T10:00:00.000Z'));
  assert.equal(duePackingEvent([event],'',60,Date.parse('2026-09-07T09:01:00.000Z'))?.id,'e1');
  assert.equal(duePackingEvent([event],'',60,Date.parse('2026-09-07T08:59:00.000Z')),null);
  assert.equal(duePackingEvent([event],'e1',60,Date.parse('2026-09-07T09:30:00.000Z')),null);
});

test('從 Firestore 房間資料讀取多場球局',()=>{
  const events=firestoreEventsFromDocument({fields:{nextEvents:{arrayValue:{values:[mapEvent('e1','2026-09-07','18:00','立羽')]}}}});
  assert.deepEqual(events,[{id:'e1',date:'2026-09-07',time:'18:00',location:'立羽'}]);
});

test('Firestore 讀取失敗時改用最後一次快取的球局時間',async()=>{
  const store=memoryStore(),events=[{id:'e1',date:'2026-10-05',time:'01:00',location:'立羽會館'}];
  assert.deepEqual(await roomEventsWithFallback(store,'RTYBSJ',async()=>events),events);
  assert.deepEqual(await roomEventsWithFallback(store,'RTYBSJ',async()=>{throw new Error('Firestore RTYBSJ: 429')}),events);
  await assert.rejects(roomEventsWithFallback(store,'ABCDEF',async()=>{throw new Error('Firestore ABCDEF: 429')}),/429/);
});

test('球局時間沒變時不重寫快取',async()=>{
  const store=memoryStore(),events=[{id:'e1',date:'2026-10-05',time:'01:00',location:''}];
  await roomEventsWithFallback(store,'RTYBSJ',async()=>events);
  await roomEventsWithFallback(store,'RTYBSJ',async()=>events);
  assert.equal(store.writes,1);
  await roomEventsWithFallback(store,'RTYBSJ',async()=>[]);
  assert.equal(store.writes,2);
});

test('發布球局公告時同步快取開團提醒用的球局時間',()=>{
  const source=fs.readFileSync(new URL('../netlify/functions/event-announcement.mjs',import.meta.url),'utf8');
  assert.match(source,/await cachePackingEvents\(roomId,room\.events\)/);
});

test('沒有未帶物品時不發送提醒',()=>{
  assert.match(reminderSource,/if\(!items\.length\)continue/);
});
