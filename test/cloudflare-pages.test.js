import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const serviceWorkerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const pagesFunctionSource = readFileSync(new URL('../functions/api/functions/[name].js', import.meta.url), 'utf8');
const wranglerSource = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('routes browser function calls through Cloudflare Pages functions', () => {
  assert.match(mainSource, /\/api\/functions\/\$\{path\}/);
  assert.match(mainSource, /\/api\/functions\/chat-media/);
  assert.doesNotMatch(mainSource, /\/\.netlify\/functions/);
});

test('keeps Cloudflare Pages function responses out of the app shell cache', () => {
  assert.match(serviceWorkerSource, /\/api\/functions\//);
  assert.doesNotMatch(serviceWorkerSource, /\/\.netlify\/functions/);
});

test('maps Cloudflare Pages function names to existing handlers', () => {
  assert.match(pagesFunctionSource, /'push-subscription': pushSubscription/);
  assert.match(pagesFunctionSource, /'chat-media': chatMedia/);
  assert.match(pagesFunctionSource, /__SEVEN_B_CLOUDFLARE_ENV__/);
});

test('uses the stable Cloudflare Pages URL for push notification links', () => {
  assert.match(pagesFunctionSource, /CANONICAL_SITE_URL = 'https:\/\/7b-v3\.pages\.dev'/);
  assert.match(pagesFunctionSource, /hostname\.endsWith\('\.7b-v3\.pages\.dev'\)/);
  assert.match(pagesFunctionSource, /process\.env\.URL = process\.env\.URL \|\| cloudflareSiteUrl\(env\)/);
});

test('declares the Cloudflare Pages build output and Node compatibility', () => {
  assert.match(wranglerSource, /pages_build_output_dir = "dist"/);
  assert.match(wranglerSource, /compatibility_date = "2025-10-03"/);
  assert.match(wranglerSource, /compatibility_flags = \["nodejs_compat"\]/);
});
