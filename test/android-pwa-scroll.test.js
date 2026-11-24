import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('installed Android pages scroll the viewport instead of a trapped card', () => {
  assert.match(html, /Android\/i\.test\(navigator\.userAgent\)/);
  assert.match(html, /classList\.add\("android-device"\)/);
  assert.match(css, /html\.android-device\{[^}]*overflow-y:auto!important/);
  assert.match(css, /html\.android-device body\{[^}]*overflow:visible!important/);
  assert.match(css, /html\.android-device #app \.page:not\(\.chat-page\)\{[^}]*overflow:visible!important/);
  assert.match(css, /html\.android-device body\.player-modal-open,html\.android-device body\.next-event-modal-open\{[^}]*overflow:hidden!important/);
  assert.doesNotMatch(css, /overflow-y:scroll!important/);
});

