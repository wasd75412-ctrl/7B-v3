import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { PUSH_STORE, jsonResponse, normalizeVapidKey, pushSettings, subscriptionIndexKey, vapidKeyPairMatches, validRoomId } from './lib/push-shared.mjs';

const BINDINGS = ['SEVEN_B_BLOBS', 'NETLIFY_BLOBS', 'BLOBS', 'KV'];

export default async request => {
  const env = globalThis.__SEVEN_B_CLOUDFLARE_ENV__ || {};
  const bindings = Object.fromEntries(BINDINGS.map(name => [name, !!env[name] && typeof env[name].get === 'function' && typeof env[name].put === 'function']));
  const roomId = new URL(request.url).searchParams.get('roomId')?.toUpperCase() || '';
  const publicKey = normalizeVapidKey(process.env.VAPID_PUBLIC_KEY), privateKey = normalizeVapidKey(process.env.VAPID_PRIVATE_KEY);
  const push = pushSettings();
  let subscriptionKeys = 0, subscriptionIndexComplete = false, subscriptionError = '';
  if(validRoomId(roomId)){
    try{
      const index = await getStore({name:PUSH_STORE,consistency:'strong'}).get(subscriptionIndexKey(roomId), {type:'json'});
      subscriptionKeys = Array.isArray(index?.keys) ? index.keys.length : 0;
      subscriptionIndexComplete = index?.complete === true;
    }catch(error){
      subscriptionError = error?.message || 'subscription index read failed';
    }
  }
  return jsonResponse({
    ok: true,
    cloudflareEnv: !!globalThis.__SEVEN_B_CLOUDFLARE_ENV__,
    bindings,
    vapid: {
      publicKeyLength: publicKey.length,
      privateKeyLength: privateKey.length,
      pairMatches: vapidKeyPairMatches(publicKey, privateKey)
    },
    siteUrl: push?.siteUrl || '',
    ready: !!push,
    roomId,
    subscriptionKeys,
    subscriptionIndexComplete,
    subscriptionError
  });
};
