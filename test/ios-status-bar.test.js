import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

test('keeps the installed iPad status bar opaque so the court picture stays sharp', () => {
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="default"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.doesNotMatch(html, /black-translucent/);
  assert.match(css, /@media \(display-mode: standalone\)\{[\s\S]*?padding-top:env\(safe-area-inset-top\)/);
  assert.match(main, /function syncStatusBarColor\(\)\{[\s\S]*?--score-court-bg/);
  assert.match(main, /\$\('scoreView'\)\.classList\.toggle\('hidden',!scoreVisible\);\s*syncStatusBarColor\(\)/);
  assert.equal(manifest.theme_color, '#031523');
});
