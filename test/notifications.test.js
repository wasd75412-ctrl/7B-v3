import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldAskToClaimPlayer, shouldShowNotificationPrompt, storedDeviceToken, notificationClientToFocus } from '../src/notifications.js';

test('shows the notification question to an eligible user once',()=>{
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:false,alreadyAnswered:false,alreadyShown:false}),true);
});

test('does not ask users who already enabled or answered the notification question',()=>{
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:true,alreadyAnswered:false,alreadyShown:false}),false);
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:false,alreadyAnswered:true,alreadyShown:false}),false);
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:false,alreadyAnswered:false,alreadyShown:true}),false);
});

test('keeps an existing device token instead of minting over an empty read',()=>{
  assert.equal(storedDeviceToken('','legacy-token'),'legacy-token');
  assert.equal(storedDeviceToken('sync-token','legacy-token'),'sync-token');
  assert.equal(storedDeviceToken('',''),'');
});

test('does not ask a tagged user to reclaim while the room is still the cached copy',()=>{
  assert.equal(shouldAskToClaimPlayer({hasHash:true,claimed:false,fromCache:true,serverChecked:false}),false);
  assert.equal(shouldAskToClaimPlayer({hasHash:true,claimed:true,fromCache:true,serverChecked:false}),false);
  assert.equal(shouldAskToClaimPlayer({hasHash:false,claimed:false,fromCache:false,serverChecked:true}),false);
  assert.equal(shouldAskToClaimPlayer({hasHash:true,claimed:false,fromCache:false,serverChecked:true}),true);
  assert.equal(shouldAskToClaimPlayer({hasHash:true,claimed:false,fromCache:true,serverChecked:true}),true);
});

test('focuses the open room instead of reloading it from a notification',()=>{
  const target='https://7b.example/?room=ABC123&page=chat';
  const other={url:'https://7b.example/?room=OTHER1',focused:true};
  const room={url:'https://7b.example/?room=ABC123',focused:false};
  assert.equal(notificationClientToFocus([other,room],target),room);
  assert.equal(notificationClientToFocus([{url:'https://other.example/?room=ABC123',focused:true}],target),null);
  const worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.match(worker,/bcm-open-notification/);
  assert.doesNotMatch(worker,/client\.navigate/);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/bcm-open-notification/);
  assert.match(main,/shouldAskToClaimPlayer/);
});


