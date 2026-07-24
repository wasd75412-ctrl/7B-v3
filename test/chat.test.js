import test from 'node:test';
import assert from 'node:assert/strict';
import { claimedChatSenderFromDocument, normalizeStoredChatMessage, shouldNotifyChatSubscription } from '../netlify/functions/chat-mention.mjs';
import { addPlayerOwnerHash, claimedChatPlayerId, CHAT_MESSAGE_MAX_LENGTH, chatMentionSearch, chatMessagePreview, cleanChatText, hasChatAllMention, mentionIdsFromText, normalizeChatMentionIds, playerOwnerHashes, removeChatAllMention, removeChatMention } from '../src/chat.js';

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

test('only uses the player claimed by this device for chat',()=>{
  const players=[
    {id:'claimed',name:'建昱',ownerHash:'device-1'},
    {id:'other',name:'Yoyo',ownerHash:'device-2'}
  ];
  assert.equal(claimedChatPlayerId(players,'device-1'),'claimed');
  assert.equal(claimedChatPlayerId(players,'device-3'),'');
  assert.equal(claimedChatPlayerId(players,''),'');
});

test('keeps multiple claimed devices for the same player',()=>{
  const player=addPlayerOwnerHash({id:'p1',name:'建昱',ownerHash:'device-1'},'device-2');
  assert.deepEqual(playerOwnerHashes(player),['device-1','device-2']);
  assert.equal(claimedChatPlayerId([player],'device-1'),'p1');
  assert.equal(claimedChatPlayerId([player],'device-2'),'p1');
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

test('recognizes and removes an all-player mention without matching similar words',()=>{
  assert.equal(hasChatAllMention('@All 明天記得投票'),true);
  assert.equal(hasChatAllMention('請找 @all，謝謝'),true);
  assert.equal(hasChatAllMention('@Ally 明天見'),false);
  assert.equal(removeChatAllMention('提醒 @All 明天見'),'提醒 明天見');
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
    mentionAll:false,
    createdAt:'2026-07-23T08:00:00.000Z',
    clientCreatedAt:123
  });
});

test('normalizes @All from message text and targets every other subscribed device',()=>{
  const message=normalizeStoredChatMessage({
    id:'message-all',
    text:'@All 請記得投票',
    senderId:'p1',
    senderName:'建昱',
    senderHash:'device-1',
    mentions:[],
    createdAt:'2026-07-23T08:00:00.000Z'
  });
  assert.equal(message.mentionAll,true);
  assert.equal(shouldNotifyChatSubscription(
    {roomId:'RTYBSJ',clientHash:'device-2',playerId:''},
    message,
    {roomId:'RTYBSJ',messageId:'message-all'}
  ),true);
  assert.equal(shouldNotifyChatSubscription(
    {roomId:'RTYBSJ',clientHash:'device-1',playerId:'p1'},
    message,
    {roomId:'RTYBSJ',messageId:'message-all'}
  ),false);
});

test('server accepts only the player claimed by the supplied device identity',()=>{
  const document={fields:{roster:{arrayValue:{values:[
    {mapValue:{fields:{id:{stringValue:'p1'},name:{stringValue:'建昱'},ownerHash:{stringValue:'device-1'}}}},
    {mapValue:{fields:{id:{stringValue:'p2'},name:{stringValue:'Yoyo'},ownerHash:{stringValue:'device-2'}}}}
  ]}}}};
  assert.deepEqual(claimedChatSenderFromDocument(document,{senderId:'p1',senderHash:'device-1'}),{
    senderId:'p1',
    senderName:'建昱',
    senderHash:'device-1'
  });
  assert.equal(claimedChatSenderFromDocument(document,{senderId:'p2',senderHash:'device-1'}),null);
});

test('server accepts a secondary claimed device without removing the original device',()=>{
  const document={fields:{roster:{arrayValue:{values:[
    {mapValue:{fields:{id:{stringValue:'p1'},name:{stringValue:'建昱'},ownerHash:{stringValue:'device-1'},ownerHashes:{stringValue:'device-1|device-2'}}}}
  ]}}}};
  assert.equal(claimedChatSenderFromDocument(document,{senderId:'p1',senderHash:'device-2'})?.senderName,'建昱');
});
