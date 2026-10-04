import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { allRoomSubscriptions, configureWebPush, indexSubscription, normalizeVapidKey, pushSettings, roomSubscriptions, sendWebPush, subscriptionIndexKey, unindexSubscription } from '../netlify/functions/lib/push-shared.mjs';

function vapidPair(){
  const ecdh=createECDH('prime256v1');ecdh.generateKeys();
  return{publicKey:ecdh.getPublicKey().toString('base64url'),privateKey:ecdh.getPrivateKey().toString('base64url')};
}

function memoryStore({listFails=false}={}){
  const data=new Map();let lists=0;
  return{
    data,
    get lists(){return lists},
    async list({prefix=''}={}){lists++;if(listFails)throw new Error('KV list() limit exceeded for the day.');return{blobs:[...data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}},
    async get(key){return data.has(key)?JSON.parse(data.get(key)):null},
    async setJSON(key,value){data.set(key,JSON.stringify(value))},
    async delete(key){data.delete(key)}
  };
}

const subscription=id=>({endpoint:`https://push.example/${id}`,keys:{p256dh:'p',auth:'a'}});

test('push settings accept quoted or padded keys and reject masked or mismatched keys',()=>{
  const pair=vapidPair(),other=vapidPair();
  assert.equal(normalizeVapidKey(` "${pair.privateKey}=" `),pair.privateKey);
  const settings=pushSettings({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:`"${pair.privateKey}"`,URL:'https://7b-v3.pages.dev/',VAPID_SUBJECT:'****'});
  assert.equal(settings.siteUrl,'https://7b-v3.pages.dev');
  assert.equal(settings.subject,'https://7b-v3.pages.dev');
  assert.equal(pushSettings({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:'****************OLX0',URL:'https://7b-v3.pages.dev'}),null);
  assert.equal(pushSettings({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:other.privateKey,URL:'https://7b-v3.pages.dev'}),null);
  assert.equal(pushSettings({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:pair.privateKey,URL:'****'}),null);
});

test('web push is sent with fetch and keeps push service status codes',async()=>{
  const pair=vapidPair(),client=createECDH('prime256v1');client.generateKeys();
  assert.ok(configureWebPush({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:pair.privateKey,URL:'https://7b-v3.pages.dev'}));
  const target={endpoint:'https://push.example/send/1',keys:{p256dh:client.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  const originalFetch=globalThis.fetch,calls=[];
  try{
    globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response('',{status:calls.length===1?201:410})};
    assert.deepEqual(await sendWebPush(target,'{"title":"t"}',{TTL:60,urgency:'high'}),{statusCode:201});
    assert.equal(calls[0].url,target.endpoint);
    assert.equal(calls[0].init.method,'POST');
    assert.match(calls[0].init.headers.Authorization,/^vapid t=.+, k=/);
    assert.equal(calls[0].init.headers['Content-Encoding'],'aes128gcm');
    assert.equal(calls[0].init.headers['Content-Length'],undefined);
    await assert.rejects(sendWebPush(target,'{"title":"t"}'),error=>error.statusCode===410);
  }finally{globalThis.fetch=originalFetch}
});

test('room subscriptions come from the index without KV list once complete',async()=>{
  const store=memoryStore();
  await store.setJSON('ABCDEF/1',{roomId:'ABCDEF',subscription:subscription(1)});
  await store.setJSON('ABCDEF/2',{roomId:'ABCDEF',subscription:subscription(2)});
  assert.deepEqual((await roomSubscriptions(store,'ABCDEF')).map(row=>row.key),['ABCDEF/1','ABCDEF/2']);
  assert.equal(store.lists,1);
  await store.delete('ABCDEF/2');
  assert.deepEqual((await roomSubscriptions(store,'ABCDEF')).map(row=>row.key),['ABCDEF/1']);
  assert.deepEqual((await store.get(subscriptionIndexKey('ABCDEF'))).keys,['ABCDEF/1']);
  assert.equal(store.lists,1);
});

test('subscriptions stay reachable when KV list quota is exhausted',async()=>{
  const store=memoryStore({listFails:true});
  await store.setJSON('ABCDEF/1',{roomId:'ABCDEF',subscription:subscription(1)});
  await indexSubscription(store,'ABCDEF','ABCDEF/1');
  await store.setJSON('GHIJKL/9',{roomId:'GHIJKL',subscription:subscription(9)});
  await indexSubscription(store,'GHIJKL','GHIJKL/9');
  assert.deepEqual((await roomSubscriptions(store,'ABCDEF')).map(row=>row.key),['ABCDEF/1']);
  const all=await allRoomSubscriptions(store);
  assert.deepEqual([...all.keys()],['ABCDEF','GHIJKL']);
  await unindexSubscription(store,'ABCDEF','ABCDEF/1');
  assert.deepEqual(await roomSubscriptions(store,'ABCDEF'),[]);
});

test('scheduled scans rebuild every room index from one list and then skip list',async()=>{
  const store=memoryStore();
  await store.setJSON('ABCDEF/1',{roomId:'ABCDEF',subscription:subscription(1)});
  await store.setJSON('GHIJKL/2',{roomId:'GHIJKL',subscription:subscription(2)});
  assert.deepEqual([...(await allRoomSubscriptions(store)).keys()],['ABCDEF','GHIJKL']);
  const lists=store.lists;
  await allRoomSubscriptions(store);
  await roomSubscriptions(store,'GHIJKL');
  assert.equal(store.lists,lists);
});
