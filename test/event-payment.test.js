import test from 'node:test';
import assert from 'node:assert/strict';
import { canReportEventPayment, eventPaymentStatus, normalizeEventPayments, normalizeSessionFee, pendingEventPaymentPlayerIds, updateEventPayment } from '../src/event-payment.js';
import { sessionFeeNoticeFromRoom, sessionFeeNoticePayload, sessionFeeNoticeText, sessionFeeSubscriptionTargets } from '../src/session-fee-notice.js';
import { roomStateFromDocument } from '../netlify/functions/session-fee-notice.mjs';

test('球友繳費回報綁定球局內的球員並先進入待確認',()=>{
  const event=updateEventPayment({id:'event-1'},'player-1','pending','2026-09-08T10:00:00.000Z');
  assert.equal(eventPaymentStatus(event,'player-1'),'pending');
  assert.deepEqual(pendingEventPaymentPlayerIds(event),['player-1']);
});

test('管理員可確認或取消單一球員繳費且不影響其他人',()=>{
  let event={id:'event-1',payments:{p1:{status:'pending',reportedAt:'a'},p2:{status:'confirmed',reportedAt:'b',confirmedAt:'c'}}};
  event=updateEventPayment(event,'p1','confirmed','d');
  assert.equal(eventPaymentStatus(event,'p1'),'confirmed');
  assert.equal(eventPaymentStatus(event,'p2'),'confirmed');
  event=updateEventPayment(event,'p1','unpaid');
  assert.equal(eventPaymentStatus(event,'p1'),'unpaid');
  assert.equal(eventPaymentStatus(event,'p2'),'confirmed');
});

test('球局當日才可回報繳費',()=>{
  assert.equal(canReportEventPayment('2026-09-30','2026-09-29'),false);
  assert.equal(canReportEventPayment('2026-09-30','2026-09-30'),true);
  assert.equal(canReportEventPayment('2026-09-30','2026-10-01'),true);
  assert.equal(canReportEventPayment('','2026-09-30'),false);
});

test('結束球局的繳費快照保留金額、出賽球員與通知時間',()=>{
  assert.deepEqual(normalizeSessionFee({amount:216.6,playerIds:['p1','p1','p2',''],noticeAt:'2026-09-30T05:00:00.000Z'}),{amount:217,playerIds:['p1','p2'],noticeAt:'2026-09-30T05:00:00.000Z'});
  assert.equal(normalizeSessionFee({amount:0,playerIds:['p1'],noticeAt:'a'}),null);
  assert.equal(normalizeSessionFee({amount:200,playerIds:[],noticeAt:'a'}),null);
});

test('繳費通知包含金額、轉帳帳號與回報提示',()=>{
  assert.equal(sessionFeeNoticeText(217,{transferBankCode:'812',transferAccount:'00123456789'}).body,'今日繳費 217 元｜轉帳帳號 (812) 00123456789｜若已轉帳請按回報繳費');
  assert.equal(sessionFeeNoticeText(200).body,'今日繳費 200 元｜若已轉帳請按回報繳費');
});

test('伺服器依當日出賽紀錄計算金額，並包含提早退席的球員',()=>{
  const room={
    nextEvents:[{id:'e1',date:'2026-09-30',rentalTotal:1200,transferBankCode:'812',transferAccount:'001'}],
    history:[
      {dateKey:'2026-09-30',teamA1:'early',teamA2:'p2',teamB1:'p3',teamB2:'p4'},
      {dateKey:'2026-09-30',teamA1:'p2',teamA2:'p3',teamB1:'p4',teamB2:'p5'},
      {dateKey:'2026-09-30',testMode:true,teamA1:'test',teamA2:'p2',teamB1:'p3',teamB2:'p4'},
      {dateKey:'2026-09-29',teamA1:'old',teamA2:'p2',teamB1:'p3',teamB2:'p4'}
    ],
    shuttleTubes:[]
  };
  const notice=sessionFeeNoticeFromRoom(room,'2026-09-30');
  assert.deepEqual(notice.playerIds,['early','p2','p3','p4','p5']);
  assert.equal(notice.amount,240);
  assert.equal(notice.transferAccount,'001');
  assert.equal(sessionFeeNoticeFromRoom(room,'2026-10-01'),null);
});

test('繳費通知只送給出賽球員，點開後回到可複製帳號與回報繳費的畫面',()=>{
  const records=[{playerId:'early'},{playerId:'absent'},{playerId:'p2'}];
  assert.deepEqual(sessionFeeSubscriptionTargets(records,['early','p2']),[records[0],records[2]]);
  const payload=sessionFeeNoticePayload({siteUrl:'https://7b.test/',roomId:'ABC123',eventId:'e1',amount:240,noticeId:'2026-09-30T05:00:00.000Z',transferBankCode:'812',transferAccount:'001'});
  assert.equal(payload.url,'https://7b.test/?room=ABC123&page=payment&event=e1');
  assert.match(payload.body,/轉帳帳號 \(812\) 001/);
  assert.deepEqual(payload.actions,[{action:'report-payment',title:'回報繳費'}]);
});

test('伺服器從 Firestore 文件讀取球局、紀錄與管理員憑證',()=>{
  const room=roomStateFromDocument({fields:{hostToken:{stringValue:'host'},nextEvents:{arrayValue:{values:[{mapValue:{fields:{id:{stringValue:'e1'},rentalTotal:{integerValue:'1200'}}}}]}}}});
  assert.equal(room.hostToken,'host');
  assert.deepEqual(room.nextEvents,[{id:'e1',rentalTotal:1200}]);
  assert.deepEqual(room.history,[]);
});

test('無效繳費資料不會進入球局狀態',()=>{
  assert.deepEqual(normalizeEventPayments({p1:{status:'unknown'},'':{status:'pending'},p2:{status:'confirmed'}}),{p2:{status:'confirmed',reportedAt:'',confirmedAt:''}});
});
