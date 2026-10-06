import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERROR_LOG_DAILY_UPLOADS, ERROR_LOG_MAX_ENTRIES, ERROR_LOG_UPLOAD_GAP_MS, canUploadErrorLog, describeLoggedArgs, emptyErrorLog, errorLogPayload, markErrorLogUploaded, matchInPlay, normalizeErrorLog, reachedDailyUploads, recordErrorEntry } from '../src/error-log.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('repeated errors that differ only by numbers collapse into one counted entry',()=>{
  let log=emptyErrorLog();
  log=recordErrorEntry(log,{kind:'warn',message:'Connection failed 1 times'},1000);
  log=recordErrorEntry(log,{kind:'warn',message:'Connection failed 2 times'},2000);
  assert.equal(log.entries.length,1);
  assert.deepEqual(errorLogPayload(log),[{k:'warn',m:'Connection failed 2 times',s:'',n:2,f:1000,l:2000}]);
  assert.equal(log.dirty,true);
});

test('entries stay small and capped',()=>{
  let log=emptyErrorLog();
  for(let i=0;i<ERROR_LOG_MAX_ENTRIES+10;i++)log=recordErrorEntry(log,{message:`錯誤 ${'x'.repeat(i)} ${'y'.repeat(400)}`,source:'z'.repeat(300)},i);
  assert.equal(log.entries.length,ERROR_LOG_MAX_ENTRIES);
  for(const entry of errorLogPayload(log)){
    assert.ok(entry.m.length<=160);
    assert.ok(entry.s.length<=80);
  }
  assert.ok(JSON.stringify(errorLogPayload(log)).length<10_000);
});

test('empty messages are ignored',()=>{
  const log=emptyErrorLog();
  assert.equal(recordErrorEntry(log,{message:'   '}),log);
});

test('uploads wait for a break, a connection, a minute gap and the daily cap',()=>{
  const day='2026-10-06';
  let log=recordErrorEntry(emptyErrorLog(),{message:'即時比分寫入失敗'},0);
  assert.equal(canUploadErrorLog(log,{matchInProgress:true,now:ERROR_LOG_UPLOAD_GAP_MS,day}),false);
  assert.equal(canUploadErrorLog(log,{online:false,now:ERROR_LOG_UPLOAD_GAP_MS,day}),false);
  assert.equal(canUploadErrorLog(log,{now:ERROR_LOG_UPLOAD_GAP_MS,day}),true);
  log=markErrorLogUploaded(log,ERROR_LOG_UPLOAD_GAP_MS,day);
  assert.equal(canUploadErrorLog(log,{now:ERROR_LOG_UPLOAD_GAP_MS*3,day}),false,'nothing new to send');
  log=recordErrorEntry(log,{message:'另一個錯誤'},ERROR_LOG_UPLOAD_GAP_MS+1);
  assert.equal(canUploadErrorLog(log,{now:ERROR_LOG_UPLOAD_GAP_MS*1.5,day}),false,'within a minute of the last upload');
  assert.equal(canUploadErrorLog(log,{now:ERROR_LOG_UPLOAD_GAP_MS*2,day}),true);
  log={...log,uploadDay:day,uploadsToday:ERROR_LOG_DAILY_UPLOADS};
  assert.equal(reachedDailyUploads(log,day),true);
  assert.equal(canUploadErrorLog(log,{now:ERROR_LOG_UPLOAD_GAP_MS*10,day}),false);
  assert.equal(canUploadErrorLog(log,{now:ERROR_LOG_UPLOAD_GAP_MS*10,day:'2026-10-07'}),true);
  assert.equal(markErrorLogUploaded(log,0,'2026-10-07').uploadsToday,1);
});

test('an open match blocks uploads until it has a winner',()=>{
  assert.equal(matchInPlay({active:true,winner:null}),true);
  assert.equal(matchInPlay({active:true,winner:'A'}),false);
  assert.equal(matchInPlay({active:false,winner:null}),false);
  assert.equal(matchInPlay(null),false);
});

test('a stored log survives reloads and rejects junk',()=>{
  const log=recordErrorEntry(emptyErrorLog(),{kind:'ui',message:'雲端同步失敗',source:'main.js:12'},5);
  const restored=normalizeErrorLog(JSON.parse(JSON.stringify(log)));
  assert.deepEqual(errorLogPayload(restored),errorLogPayload(log));
  assert.equal(restored.dirty,true);
  assert.deepEqual(normalizeErrorLog('bad'),emptyErrorLog());
  assert.deepEqual(normalizeErrorLog({entries:[{m:''},null]}).entries,[]);
});

test('console arguments are summarized from strings and errors',()=>{
  const error=Object.assign(new Error('Missing permissions'),{code:'permission-denied'});
  assert.equal(describeLoggedArgs(['即時比分寫入失敗',error]),'即時比分寫入失敗 permission-denied: Missing permissions');
  assert.equal(describeLoggedArgs([{message:'boom'},42]),'boom');
});

test('the site records errors locally and uploads only from admin devices between matches',()=>{
  assert.match(main,/console\[level\]=\(\.\.\.args\)=>\{original\(\.\.\.args\);noteClientError\(level,describeLoggedArgs\(args\)\)\};/);
  assert.match(main,/window\.addEventListener\('error',event=>noteClientError\(/);
  assert.match(main,/window\.addEventListener\('unhandledrejection',event=>noteClientError\(/);
  assert.match(main,/function setError\(msg=''\)\{[^\n]*if\(msg\)noteClientError\('ui',msg\)\}/);
  const upload=main.match(/function uploadErrorLog\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(upload,/if\(!roomId\|\|!isHost\|\|!canUploadErrorLog\(errorLog,\{matchInProgress:matchInPlay\(state\.match\),online:navigator\.onLine,now,day\}\)\)\{scheduleErrorLogUpload\(\);return\}/);
  assert.match(upload,/doc\(db,'badmintonRooms',roomId,'remoteControl',`errors-\$\{scoreDeviceId\}`\),\{platform:'web',device:scoreDeviceId,/);
  assert.doesNotMatch(upload,/onSnapshot/);
});
