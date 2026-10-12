import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import weeklyPoll from '../netlify/functions/weekly-poll.mjs';
import { subscriptionKey } from '../netlify/functions/lib/push-shared.mjs';

function memoryKv(){
  const map=new Map();
  return{
    map,
    async get(key,type){const value=map.get(key);if(value===undefined)return null;return type==='json'?JSON.parse(value):value},
    async getWithMetadata(key,type){return{value:await this.get(key,type),metadata:{}}},
    async put(key,value){map.set(key,String(value))},
    async delete(key){map.delete(key)},
    async list({prefix=''}={}){return{keys:[...map.keys()].filter(key=>key.startsWith(prefix)).map(name=>({name}))}}
  };
}

function subscription(endpoint){
  const ecdh=createECDH('prime256v1');ecdh.generateKeys();
  return{endpoint,keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
}

test('sends the weekly poll push to devices missed when the poll opened, once each, and retries failures',async t=>{
  const now=Date.parse('2026-10-12T02:30:00.000Z'),cycle='2026-10-12',roomId='RTYBSJ';
  const kv=memoryKv(),vapid=webpush.generateVAPIDKeys();
  const endpoints=['https://push.example/ok-1','https://push.example/ok-2','https://push.example/fail'];
  const keys=endpoints.map(endpoint=>subscriptionKey(roomId,endpoint));
  endpoints.forEach((endpoint,index)=>kv.map.set(`7b-push-subscriptions/${keys[index]}`,JSON.stringify({roomId,playerName:`P${index}`,subscription:subscription(endpoint)})));
  kv.map.set(`7b-push-subscriptions/index/${roomId}`,JSON.stringify({keys,complete:true}));
  kv.map.set('7b-push-subscriptions/index/rooms',JSON.stringify({rooms:[roomId],complete:true}));
  kv.map.set('weekly-poll-state/scan',JSON.stringify({scannedAt:now-60*1000,openedCycle:cycle}));

  const pushes=[],originals={fetch:globalThis.fetch,now:Date.now,env:globalThis.__SEVEN_B_CLOUDFLARE_ENV__,processEnv:{...process.env}};
  let failing=true;
  globalThis.__SEVEN_B_CLOUDFLARE_ENV__={SEVEN_B_BLOBS:kv};
  Object.assign(process.env,{VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,URL:'https://example.com'});
  Date.now=()=>now;
  globalThis.fetch=async(url,options={})=>{
    url=String(url);
    if(url.startsWith('https://firestore.googleapis.com/')){
      assert.match(url,/mask\.fieldPaths=weeklyPollCycle/);
      return new Response(JSON.stringify({fields:{weeklyPollCycle:{stringValue:cycle}}}),{status:200});
    }
    pushes.push(url);
    return new Response('',{status:url.endsWith('/fail')&&failing?500:201});
  };
  t.after(()=>{globalThis.fetch=originals.fetch;Date.now=originals.now;globalThis.__SEVEN_B_CLOUDFLARE_ENV__=originals.env;process.env=originals.processEnv});

  const first=await (await weeklyPoll()).json();
  assert.equal(first.skipped,true);
  assert.deepEqual({sent:first.notify.sent,failed:first.notify.failed},{sent:2,failed:1});
  assert.equal(first.notify.failures[0].host,'push.example');
  assert.equal(first.notify.failures[0].status,500);
  assert.equal(JSON.parse(kv.map.get(`7b-push-subscriptions/${keys[0]}`)).lastWeeklyPollCycle,cycle);
  assert.equal(JSON.parse(kv.map.get('weekly-poll-state/notify')).sent,2);

  failing=false;pushes.length=0;
  const second=await (await weeklyPoll()).json();
  assert.deepEqual(pushes,['https://push.example/fail']);
  assert.equal(second.notify.sent,1);

  pushes.length=0;
  const third=await (await weeklyPoll()).json();
  assert.deepEqual(pushes,[]);
  assert.equal(third.notify.sent,0);
});
