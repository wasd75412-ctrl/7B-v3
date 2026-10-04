import { jsonResponse } from './lib/push-shared.mjs';
import { getBlobStore as getStore } from './lib/blob-store.mjs';
import { PUSH_STORE } from './lib/push-shared.mjs';

const BINDINGS = ['SEVEN_B_BLOBS', 'NETLIFY_BLOBS', 'BLOBS', 'KV'];

export default async request => {
  const env = globalThis.__SEVEN_B_CLOUDFLARE_ENV__ || {};
  const bindings = Object.fromEntries(BINDINGS.map(name => [name, !!env[name] && typeof env[name].get === 'function' && typeof env[name].put === 'function']));
  const roomId = new URL(request.url).searchParams.get('roomId')?.toUpperCase() || '';
  let subscriptionKeys = 0;
  if(roomId){
    const store = getStore({name:PUSH_STORE,consistency:'strong'});
    const listing = await store.list({prefix:`${roomId}/`});
    subscriptionKeys = listing.blobs.length;
  }
  return jsonResponse({
    ok: true,
    cloudflareEnv: !!globalThis.__SEVEN_B_CLOUDFLARE_ENV__,
    bindings,
    roomId,
    subscriptionKeys,
    hasUrl: !!(process.env.URL || process.env.DEPLOY_PRIME_URL || env.URL || env.DEPLOY_PRIME_URL || env.CF_PAGES_URL)
  });
};
