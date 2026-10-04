import { jsonResponse } from './lib/push-shared.mjs';

const BINDINGS = ['SEVEN_B_BLOBS', 'NETLIFY_BLOBS', 'BLOBS', 'KV'];

export default async () => {
  const env = globalThis.__SEVEN_B_CLOUDFLARE_ENV__ || {};
  const bindings = Object.fromEntries(BINDINGS.map(name => [name, !!env[name] && typeof env[name].get === 'function' && typeof env[name].put === 'function']));
  return jsonResponse({
    ok: true,
    cloudflareEnv: !!globalThis.__SEVEN_B_CLOUDFLARE_ENV__,
    bindings,
    hasUrl: !!(process.env.URL || process.env.DEPLOY_PRIME_URL || env.URL || env.DEPLOY_PRIME_URL || env.CF_PAGES_URL)
  });
};
