export const LOCAL_SCORE_PORT = 17878;
export const LOCAL_SCORE_PROTOCOL = 'bcm-local-score-v1';
export const LOCAL_SCORE_CHANNEL = 'bcm-local-score-hub-v1';

const ACTIONS = new Set(['teamAPlus', 'teamBPlus', 'undo', 'reset']);

export function createLocalMatch(seed = {}) {
  return {
    active: seed.active !== false,
    teamA: Array.isArray(seed.teamA) ? seed.teamA.filter(Boolean).slice(0, 2) : [],
    teamB: Array.isArray(seed.teamB) ? seed.teamB.filter(Boolean).slice(0, 2) : [],
    scores: normalizeScores(seed.scores),
    rallies: Array.isArray(seed.rallies)
      ? seed.rallies.filter(value => value === 0 || value === 1)
      : [],
    winner: seed.winner === 0 || seed.winner === 1 ? seed.winner : null,
    matchId: String(seed.matchId || `local-${Date.now()}`),
    startedAt: String(seed.startedAt || new Date().toISOString()),
    target: Math.max(1, Number(seed.target) || 11),
    cap: Math.max(1, Number(seed.cap) || 15),
    deuce: seed.deuce !== false,
  };
}

export function normalizeLocalAction(action) {
  const value = String(action || '').trim();
  return ACTIONS.has(value) ? value : '';
}

export function applyLocalAction(match, action, now = Date.now()) {
  const next = createLocalMatch(match);
  const name = normalizeLocalAction(action);
  if (!name || !next.active) {
    return { ok: false, match: next, reason: 'unavailable' };
  }
  if (name === 'reset') {
    return {
      ok: true,
      match: createLocalMatch({
        ...next,
        scores: [0, 0],
        rallies: [],
        winner: null,
        matchId: `local-${now}`,
        startedAt: new Date(now).toISOString(),
      }),
      reason: '',
    };
  }
  if (next.winner !== null && name !== 'undo') {
    return { ok: false, match: next, reason: 'finished' };
  }
  if (name === 'undo') {
    if (!next.rallies.length) return { ok: false, match: next, reason: 'empty' };
    const removed = next.rallies.pop();
    next.scores[removed] = Math.max(0, next.scores[removed] - 1);
    next.winner = null;
    return { ok: true, match: next, reason: '' };
  }
  const side = name === 'teamAPlus' ? 0 : 1;
  next.rallies.push(side);
  next.scores[side] += 1;
  next.winner = decideWinner(next);
  return { ok: true, match: next, reason: '' };
}

export function decideWinner(match) {
  const scores = normalizeScores(match?.scores);
  const target = Math.max(1, Number(match?.target) || 11);
  const cap = Math.max(target, Number(match?.cap) || 15);
  const deuce = match?.deuce !== false;
  const lead = Math.abs(scores[0] - scores[1]);
  const top = Math.max(scores[0], scores[1]);
  if (top >= cap) return scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  if (top < target) return null;
  if (!deuce || lead >= 2) return scores[0] > scores[1] ? 0 : 1;
  return null;
}

export function createHubSnapshot({ match, revision = 0, clients = 0, pendingUpload = false } = {}) {
  const live = createLocalMatch(match);
  return {
    protocol: LOCAL_SCORE_PROTOCOL,
    revision: Math.max(0, Number(revision) || 0),
    clients: Math.max(0, Number(clients) || 0),
    pendingUpload: !!pendingUpload,
    updatedAt: new Date().toISOString(),
    match: live,
  };
}

export function encodeHubMessage(type, payload = {}) {
  return JSON.stringify({
    protocol: LOCAL_SCORE_PROTOCOL,
    type: String(type || ''),
    ...payload,
  });
}

export function decodeHubMessage(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || data.protocol !== LOCAL_SCORE_PROTOCOL || !data.type) return null;
  return data;
}

export function createLocalScoreHub(seed = {}) {
  let snapshot = createHubSnapshot({
    match: createLocalMatch(seed.match),
    revision: seed.revision || 0,
    clients: seed.clients || 0,
    pendingUpload: !!seed.pendingUpload,
  });
  const listeners = new Set();

  const publish = () => {
    for (const listener of listeners) listener(getSnapshot());
  };

  const getSnapshot = () => structuredClone
    ? structuredClone(snapshot)
    : JSON.parse(JSON.stringify(snapshot));

  return {
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
    setClients(count) {
      snapshot = createHubSnapshot({
        ...snapshot,
        match: snapshot.match,
        revision: snapshot.revision,
        clients: count,
        pendingUpload: snapshot.pendingUpload,
      });
      publish();
      return getSnapshot();
    },
    apply(action) {
      const result = applyLocalAction(snapshot.match, action);
      if (!result.ok) return { ...result, snapshot: getSnapshot() };
      snapshot = createHubSnapshot({
        match: result.match,
        revision: snapshot.revision + 1,
        clients: snapshot.clients,
        pendingUpload: true,
      });
      publish();
      return { ok: true, match: result.match, reason: '', snapshot: getSnapshot() };
    },
    markUploaded() {
      snapshot = createHubSnapshot({
        match: snapshot.match,
        revision: snapshot.revision,
        clients: snapshot.clients,
        pendingUpload: false,
      });
      publish();
      return getSnapshot();
    },
    toUploadPayload() {
      return {
        schemaVersion: 1,
        source: 'local-hotspot',
        uploadedAt: new Date().toISOString(),
        match: createLocalMatch(snapshot.match),
        pendingUpload: snapshot.pendingUpload,
        revision: snapshot.revision,
      };
    },
  };
}

export function localHubEndpoint(host, path = '/api/state') {
  const cleanHost = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const withPort = cleanHost.includes(':') ? cleanHost : `${cleanHost}:${LOCAL_SCORE_PORT}`;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${withPort}${cleanPath}`;
}

function normalizeScores(value) {
  const scores = Array.isArray(value) ? value.slice(0, 2) : [0, 0];
  return [Math.max(0, Number(scores[0]) || 0), Math.max(0, Number(scores[1]) || 0)];
}
