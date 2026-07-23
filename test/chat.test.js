import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoredChatMessage } from '../netlify/functions/chat-mention.mjs';
import { CHAT_MESSAGE_MAX_LENGTH, chatMentionSearch, chatMessagePreview, cleanChatText, mentionIdsFromText, normalizeChatMentionIds, removeChatMention } from '../src/chat.js';

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

test('detects an at-sign player search at the cursor',()=>{
  assert.deepEqual(chatMentionSearch('大家找 @Yo'),{query:'Yo',start:4,end:7});
  assert.deepEqual(chatMentionSearch('嗨，@于萱'),{query:'于萱',start:2,end:5});
  assert.equal(chatMentionSearch('大家找 @Yoyo 再說'),null);
});

test('recognizes manually typed exact player tags without partial-name collisions',()=>{
  const players=[{id:'junior',name:'于萱Jr.'},{id:'yuan',name:'于萱'},{id:'yoyo',name:'Yoyo'}];
  assert.deepEqual(mentionIdsFromText('@于萱Jr. 跟 @Yoyo 記得投票',players),['junior','yoyo']);
  assert.deepEqual(mentionIdsFromText('@于萱 你好',players,{senderId:'yuan'}),[]);
});

test('removes a selected player tag from the composer',()=>{
  assert.equal(removeChatMention('明天請 @Yoyo 記得帶球','Yoyo'),'明天請 記得帶球');
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
