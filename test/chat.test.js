import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoredChatMessage } from '../netlify/functions/chat-mention.mjs';
import { CHAT_MESSAGE_MAX_LENGTH, chatMessagePreview, cleanChatText, normalizeChatMentionIds } from '../src/chat.js';

test('cleans and limits chat messages',()=>{
  assert.equal(cleanChatText('  大家好\r\n明天見  '),'大家好\n明天見');
  assert.equal(cleanChatText('a'.repeat(CHAT_MESSAGE_MAX_LENGTH+20)).length,CHAT_MESSAGE_MAX_LENGTH);
});

test('keeps unique valid mentions and excludes the sender',()=>{
  assert.deepEqual(
    normalizeChatMentionIds(['p2','p2','p1','missing','p3'],{validIds:['p1','p2','p3'],senderId:'p1'}),
    ['p2','p3']
  );
});

test('creates a concise notification preview',()=>{
  assert.equal(chatMessagePreview('  @Yoyo  明天記得帶球拍  '),'@Yoyo 明天記得帶球拍');
  assert.match(chatMessagePreview('訊息'.repeat(80)),/…$/);
});

test('normalizes authoritative stored chat messages',()=>{
  assert.deepEqual(normalizeStoredChatMessage({
    id:'message-1',
    text:'@Yoyo 明天見',
    senderId:'p1',
    senderName:'建昱',
    senderHash:'device-1',
    mentions:['p2','p2','p3'],
    createdAt:'2026-07-23T08:00:00.000Z',
    clientCreatedAt:123
  }),{
    id:'message-1',
    text:'@Yoyo 明天見',
    senderId:'p1',
    senderName:'建昱',
    senderHash:'device-1',
    mentions:['p2','p3'],
    createdAt:'2026-07-23T08:00:00.000Z',
    clientCreatedAt:123
  });
});
