import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_SCORE_PORT,
  LOCAL_SCORE_PROTOCOL,
  applyLocalAction,
  createHubSnapshot,
  createLocalMatch,
  createLocalScoreHub,
  decodeHubMessage,
  encodeHubMessage,
  localHubEndpoint,
  normalizeLocalAction,
} from '../src/local-score-sync.js';

test('normalizes supported local hotspot score actions', () => {
  assert.equal(normalizeLocalAction('teamAPlus'), 'teamAPlus');
  assert.equal(normalizeLocalAction('teamBPlus'), 'teamBPlus');
  assert.equal(normalizeLocalAction('undo'), 'undo');
  assert.equal(normalizeLocalAction('reset'), 'reset');
  assert.equal(normalizeLocalAction('nope'), '');
});

test('applies local score actions without Firebase', () => {
  let match = createLocalMatch({ scores: [0, 0], rallies: [] });
  let result = applyLocalAction(match, 'teamAPlus');
  assert.equal(result.ok, true);
  assert.deepEqual(result.match.scores, [1, 0]);
  assert.deepEqual(result.match.rallies, [0]);

  result = applyLocalAction(result.match, 'teamBPlus');
  assert.equal(result.ok, true);
  assert.deepEqual(result.match.scores, [1, 1]);

  result = applyLocalAction(result.match, 'undo');
  assert.equal(result.ok, true);
  assert.deepEqual(result.match.scores, [1, 0]);
  assert.deepEqual(result.match.rallies, [0]);
});

test('marks the match finished at target with two-point lead', () => {
  const match = createLocalMatch({ scores: [10, 9], rallies: Array(19).fill(0).map((_, i) => (i < 10 ? 0 : 1)), target: 11, cap: 15, deuce: true });
  match.rallies = [...Array(10).fill(0), ...Array(9).fill(1)];
  const result = applyLocalAction(match, 'teamAPlus');
  assert.equal(result.ok, true);
  assert.deepEqual(result.match.scores, [11, 9]);
  assert.equal(result.match.winner, 0);
});

test('keeps a pending Firebase upload flag until marked uploaded', () => {
  const hub = createLocalScoreHub({ match: createLocalMatch() });
  assert.equal(hub.getSnapshot().pendingUpload, false);
  const applied = hub.apply('teamAPlus');
  assert.equal(applied.ok, true);
  assert.equal(hub.getSnapshot().pendingUpload, true);
  assert.equal(hub.getSnapshot().revision, 1);
  assert.equal(hub.getSnapshot().match.scores[0], 1);
  hub.markUploaded();
  assert.equal(hub.getSnapshot().pendingUpload, false);
  const payload = hub.toUploadPayload();
  assert.equal(payload.source, 'local-hotspot');
  assert.equal(payload.match.scores[0], 1);
});

test('encodes hub messages with the shared protocol tag', () => {
  const encoded = encodeHubMessage('state', createHubSnapshot({ match: createLocalMatch({ scores: [2, 1] }), revision: 3 }));
  const decoded = decodeHubMessage(encoded);
  assert.equal(decoded.protocol, LOCAL_SCORE_PROTOCOL);
  assert.equal(decoded.type, 'state');
  assert.equal(decoded.revision, 3);
  assert.deepEqual(decoded.match.scores, [2, 1]);
  assert.equal(decodeHubMessage('not-json'), null);
});

test('builds the cleartext hotspot endpoint used by iPad and Android clients', () => {
  assert.equal(LOCAL_SCORE_PORT, 17878);
  assert.equal(localHubEndpoint('192.168.43.1'), 'http://192.168.43.1:17878/api/state');
  assert.equal(localHubEndpoint('http://10.0.0.2:17878/', '/api/action'), 'http://10.0.0.2:17878/api/action');
});

test('notifies subscribers when the in-memory hub score changes', () => {
  const hub = createLocalScoreHub();
  const seen = [];
  const stop = hub.subscribe(snapshot => seen.push(snapshot.revision));
  hub.apply('teamBPlus');
  hub.apply('teamBPlus');
  stop();
  assert.deepEqual(seen, [0, 1, 2]);
});
