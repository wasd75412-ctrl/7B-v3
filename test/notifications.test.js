import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowNotificationPrompt } from '../src/notifications.js';

test('shows the notification question to an eligible user once',()=>{
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:false,alreadyAnswered:false,alreadyShown:false}),true);
});

test('does not ask users who already enabled or answered the notification question',()=>{
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:true,alreadyAnswered:false,alreadyShown:false}),false);
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:false,alreadyAnswered:true,alreadyShown:false}),false);
  assert.equal(shouldShowNotificationPrompt({roomId:'RTYBSJ',supported:true,enabled:false,alreadyAnswered:false,alreadyShown:true}),false);
});
