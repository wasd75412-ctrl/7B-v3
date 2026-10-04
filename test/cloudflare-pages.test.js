import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEDULED_FUNCTIONS, runScheduledFunctions } from '../workers/scheduler/index.js';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const serviceWorkerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const pagesFunctionSource = readFileSync(new URL('../functions/api/functions/[name].js', import.meta.url), 'utf8');
const clubFunctionSource = readFileSync(new URL('../functions/club/[name].js', import.meta.url), 'utf8');
const wranglerSource = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const schedulerConfigSource = readFileSync(new URL('../workers/scheduler/wrangler.toml', import.meta.url), 'utf8');

test('routes browser function calls through Cloudflare Pages functions', () => {
  assert.match(mainSource, /\/club\/\$\{apiFunctionPath\(path\)\}/);
  assert.match(mainSource, /\/api\/functions\/chat-media/);
  assert.match(mainSource, /'chat-mention':'chat-sync'/);
  assert.match(mainSource, /'push-config':'settings'/);
  assert.match(mainSource, /'push-subscription':'device-link'/);
  assert.match(mainSource, /'push-test':'device-check'/);
  assert.doesNotMatch(mainSource, /\/\.netlify\/functions/);
});

test('keeps Cloudflare Pages function responses out of the app shell cache', () => {
  assert.match(serviceWorkerSource, /\/api\/functions\//);
  assert.match(serviceWorkerSource, /\/bcm\//);
  assert.match(serviceWorkerSource, /\/club\//);
  assert.doesNotMatch(serviceWorkerSource, /\/\.netlify\/functions/);
});

test('maps Cloudflare Pages function names to existing handlers', () => {
  assert.match(pagesFunctionSource, /'chat-sync': chatMention/);
  assert.match(pagesFunctionSource, /'device-link': pushSubscription/);
  assert.match(pagesFunctionSource, /'device-check': pushTest/);
  assert.match(pagesFunctionSource, /'settings': pushConfig/);
  assert.match(pagesFunctionSource, /'notification-health': pushHealth/);
  assert.match(pagesFunctionSource, /'push-health': pushHealth/);
  assert.match(pagesFunctionSource, /'push-subscription': pushSubscription/);
  assert.match(pagesFunctionSource, /'notify-subscription': pushSubscription/);
  assert.match(pagesFunctionSource, /'notify-config': pushConfig/);
  assert.match(pagesFunctionSource, /'notify-test': pushTest/);
  assert.match(pagesFunctionSource, /'chat-media': chatMedia/);
  assert.match(pagesFunctionSource, /__SEVEN_B_CLOUDFLARE_ENV__/);
  assert.match(clubFunctionSource, /api\/functions\/\[name\]\.js/);
});

test('uses the stable Cloudflare Pages URL for push notification links', () => {
  assert.match(pagesFunctionSource, /CANONICAL_SITE_URL = 'https:\/\/7b-v3\.pages\.dev'/);
  assert.match(pagesFunctionSource, /hostname\.endsWith\('\.7b-v3\.pages\.dev'\)/);
  assert.match(pagesFunctionSource, /process\.env\.URL = cloudflareSiteUrl\(env\) \|\| CANONICAL_SITE_URL/);
});

test('triggers the formerly Netlify-scheduled functions from a five-minute Worker cron', async () => {
  assert.match(schedulerConfigSource, /main = "index\.js"/);
  assert.match(schedulerConfigSource, /crons = \["\*\/5 \* \* \* \*"\]/);
  assert.match(schedulerConfigSource, /SITE_URL = "https:\/\/7b-v3\.pages\.dev"/);
  assert.deepEqual(SCHEDULED_FUNCTIONS, ['weekly-poll', 'poll-deadline-reminder', 'packing-reminder']);
  for(const name of SCHEDULED_FUNCTIONS)assert.match(pagesFunctionSource, new RegExp(`'${name}': `));
  const calls = [];
  const results = await runScheduledFunctions({ SITE_URL: 'https://7b-v3.pages.dev/' }, async url => {
    calls.push(url);
    if(url.endsWith('/packing-reminder'))throw new Error('offline');
    return new Response('{"ok":true}', { status: url.endsWith('/weekly-poll') ? 500 : 200 });
  });
  assert.deepEqual(calls, SCHEDULED_FUNCTIONS.map(name => `https://7b-v3.pages.dev/api/functions/${name}`));
  assert.deepEqual(results.map(result => result.status), [500, 200, 0]);
});

test('declares the Cloudflare Pages build output and Node compatibility', () => {
  assert.match(wranglerSource, /pages_build_output_dir = "dist"/);
  assert.match(wranglerSource, /compatibility_date = "2025-10-03"/);
  assert.match(wranglerSource, /compatibility_flags = \["nodejs_compat"\]/);
  assert.match(wranglerSource, /\[\[kv_namespaces\]\][\s\S]*binding = "SEVEN_B_BLOBS"[\s\S]*id = "139d657934a541819ec6d56ae27933d4"/);
  assert.match(wranglerSource, /\[\[env\.production\.kv_namespaces\]\][\s\S]*binding = "SEVEN_B_BLOBS"[\s\S]*id = "139d657934a541819ec6d56ae27933d4"/);
  assert.match(wranglerSource, /\[\[env\.preview\.kv_namespaces\]\][\s\S]*binding = "SEVEN_B_BLOBS"[\s\S]*id = "139d657934a541819ec6d56ae27933d4"/);
});
