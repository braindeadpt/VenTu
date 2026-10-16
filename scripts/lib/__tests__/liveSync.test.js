import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  evaluateLiveSync,
  fetchLiveMeta,
  listPendingDeploys,
  liveSyncBody,
  LIVE_SYNC_MAX_LAG_MIN_DEFAULT,
  DEPLOY_STUCK_MAX_MIN_DEFAULT,
} = require('../liveSync.js');

const NOW = Date.parse('2026-10-16T12:00:00Z');
const minAgo = (m) => new Date(NOW - m * 60000).toISOString();

describe('evaluateLiveSync', () => {
  it('limiares por defeito de 60 min', () => {
    expect(LIVE_SYNC_MAX_LAG_MIN_DEFAULT).toBe(60);
    expect(DEPLOY_STUCK_MAX_MIN_DEFAULT).toBe(60);
  });

  it('live igual à main → em dia', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(70) }, liveMeta: { lastRunAt: minAgo(70) }, nowMs: NOW });
    expect(r.behind).toBe(false);
    expect(r.lagMinutes).toBe(0);
  });

  it('run da main de há 30 min ainda não no live → normal (deploy em curso)', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(30) }, liveMeta: { lastRunAt: minAgo(150) }, nowMs: NOW });
    expect(r.behind).toBe(false);
    expect(r.liveBehind).toBe(false);
  });

  it('run da main de há 75 min ainda não no live → atrasado', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(75) }, liveMeta: { lastRunAt: minAgo(200) }, nowMs: NOW });
    expect(r.behind).toBe(true);
    expect(r.liveBehind).toBe(true);
    expect(Math.round(r.lagMinutes)).toBe(75);
    expect(r.reasons[0]).toMatch(/não chegou a ventu\.surf há 75 min/);
  });

  it('live sem lastRunAt conta como atrás', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(90) }, liveMeta: {}, nowMs: NOW });
    expect(r.liveBehind).toBe(true);
  });

  it('live mais novo que a main (checkout antigo) nunca é atraso', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(300) }, liveMeta: { lastRunAt: minAgo(20) }, nowMs: NOW });
    expect(r.behind).toBe(false);
  });

  it('live inalcançável → unknown, sem incidente fabricado', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(300) }, liveMeta: null, liveOk: false, nowMs: NOW });
    expect(r.unknown).toBe(true);
    expect(r.behind).toBe(false);
  });

  it('deploy em queued/waiting/pending há > 60 min → preso', () => {
    const r = evaluateLiveSync({
      mainMeta: { lastRunAt: minAgo(10) },
      liveMeta: { lastRunAt: minAgo(10) },
      pendingDeploys: [
        { status: 'queued', created_at: minAgo(61), html_url: 'https://x/runs/1' },
        { status: 'waiting', created_at: minAgo(30) },
        { status: 'pending', created_at: minAgo(95) },
        { status: 'in_progress', created_at: minAgo(200) },
      ],
      nowMs: NOW,
    });
    expect(r.behind).toBe(true);
    expect(r.liveBehind).toBe(false);
    expect(r.stuckDeploys.map((d) => d.status)).toEqual(['queued', 'pending']);
    expect(r.reasons.join(' ')).toMatch(/deploy em `queued` há 61 min \(https:\/\/x\/runs\/1\)/);
  });

  it('runs do deploy indisponíveis (null) não contam como presos', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(10) }, liveMeta: { lastRunAt: minAgo(10) }, pendingDeploys: null, nowMs: NOW });
    expect(r.behind).toBe(false);
  });

  it('o corpo da issue cita as razões e os dois lastRunAt', () => {
    const r = evaluateLiveSync({ mainMeta: { lastRunAt: minAgo(75) }, liveMeta: { lastRunAt: minAgo(200) }, nowMs: NOW });
    const body = liveSyncBody(r);
    expect(body).toMatch(/ventu\.surf não os está a servir/);
    expect(body).toContain(minAgo(75));
    expect(body).toContain(minAgo(200));
  });
});

describe('fetchLiveMeta', () => {
  it('usa cache-buster e devolve o meta', async () => {
    let seen = '';
    const fetchImpl = async (url) => {
      seen = url;
      return { ok: true, json: async () => ({ lastRunAt: 'x' }) };
    };
    const r = await fetchLiveMeta({ url: 'https://ventu.surf/data/pipeline-meta.json', fetchImpl, nowMs: 123 });
    expect(seen).toBe('https://ventu.surf/data/pipeline-meta.json?t=123');
    expect(r).toEqual({ ok: true, meta: { lastRunAt: 'x' } });
  });

  it('HTTP de erro ou excepção → ok:false', async () => {
    expect((await fetchLiveMeta({ fetchImpl: async () => ({ ok: false, status: 503 }) })).ok).toBe(false);
    const r = await fetchLiveMeta({
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    });
    expect(r).toMatchObject({ ok: false, error: 'ECONNRESET' });
  });
});

describe('listPendingDeploys', () => {
  it('junta waiting/queued/pending do deploy.yml', () => {
    const paths = [];
    const ghApi = (path) => {
      paths.push(path);
      if (path.includes('status=queued')) return JSON.stringify([{ id: 1, status: 'queued', created_at: 'a' }]);
      return '[]';
    };
    const r = listPendingDeploys(ghApi, { repo: 'o/r' });
    expect(r).toEqual([{ id: 1, status: 'queued', created_at: 'a' }]);
    expect(paths).toEqual([
      'repos/o/r/actions/workflows/deploy.yml/runs?status=waiting&per_page=20',
      'repos/o/r/actions/workflows/deploy.yml/runs?status=queued&per_page=20',
      'repos/o/r/actions/workflows/deploy.yml/runs?status=pending&per_page=20',
    ]);
  });

  it('API indisponível em todos → null (desconhecido, não vazio)', () => {
    expect(listPendingDeploys(() => null, { repo: 'o/r' })).toBeNull();
  });
});
