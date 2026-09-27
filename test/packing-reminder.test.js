import test from 'node:test';
import assert from 'node:assert/strict';
import { duePackingEvent, eventStartMs, firestoreEventsFromDocument } from '../netlify/functions/lib/packing-reminder.mjs';
import fs from 'node:fs';

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

test('沒有未帶物品時不發送提醒',()=>{
  assert.match(reminderSource,/if\(!items\.length\)continue/);
});
