import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LocalScoreHubServer.java', import.meta.url), 'utf8');
const mode = readFileSync(new URL('../android-remote/app/src/main/java/tw/club7b/scoreremote/LocalScoreModeStore.java', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../android-remote/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

test('ships a local hotspot score hub server on port 17878', () => {
  assert.match(hub, /static final int PORT = 17878/);
  assert.match(hub, /\/api\/state/);
  assert.match(hub, /\/api\/action/);
  assert.match(hub, /local-hub\/index\.html/);
  assert.equal(existsSync(new URL('../android-remote/app/src/main/assets/local-hub/index.html', import.meta.url)), true);
});

test('Android remote can host or join the local hotspot hub', () => {
  assert.match(mode, /MODE_HOST/);
  assert.match(mode, /MODE_CLIENT/);
  assert.match(main, /startLocalScoreHub/);
  assert.match(main, /joinLocalScoreHub/);
  assert.match(main, /uploadAndroidLocalHubToFirebase/);
  assert.match(index, /androidLocalHub/);
  assert.match(index, /本機熱點測試/);
});

test('allows cleartext HTTP for same-hotspot devices including iPad', () => {
  assert.match(manifest, /networkSecurityConfig="@xml\/network_security_config"/);
  assert.match(manifest, /usesCleartextTraffic="true"/);
});

test('exposes a browser localScore test surface', () => {
  assert.match(index, /localScoreTestView/);
  assert.match(main, /requestedLocalScoreTest/);
  assert.match(main, /createLocalScoreHub/);
});
