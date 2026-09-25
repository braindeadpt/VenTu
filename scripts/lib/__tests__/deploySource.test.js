import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  OVERLAY_PATHS,
  GREEN_RUN_MAX_AGE_DAYS_DEFAULT,
  LAG_WARN_COMMITS_DEFAULT,
  LAG_WARN_HOURS_DEFAULT,
  isAcceptableGreenRun,
  pickGreenRun,
  evaluateDeploySource,
  formatDeploySummary,
} = require('../deploySource.js');

const NOW = new Date('2026-09-25T12:00:00Z').getTime();
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();

const run = (over = {}) => ({
  conclusion: 'success',
  event: 'push',
  head_sha: 'a'.repeat(40),
  created_at: hoursAgo(2),
  html_url: 'https://github.com/braindeadpt/VenTu/actions/runs/1',
  run_number: 101,
  ...over,
});

describe('deploySource — escolha do run verde', () => {
  it('overlays only public/data (the product the SSG reads at build time)', () => {
    expect(OVERLAY_PATHS).toEqual(['public/data']);
  });

  it('accepts a green push run within the window', () => {
    expect(isAcceptableGreenRun(run(), { nowMs: NOW })).toBe(true);
  });

  it('rejects failed / cancelled runs', () => {
    expect(isAcceptableGreenRun(run({ conclusion: 'failure' }), { nowMs: NOW })).toBe(false);
    expect(isAcceptableGreenRun(run({ conclusion: 'cancelled' }), { nowMs: NOW })).toBe(false);
  });

  it('rejects pull_request runs even when green (says nothing about main)', () => {
    expect(isAcceptableGreenRun(run({ event: 'pull_request' }), { nowMs: NOW })).toBe(false);
  });

  it('rejects a run without head_sha', () => {
    expect(isAcceptableGreenRun(run({ head_sha: '' }), { nowMs: NOW })).toBe(false);
  });

  it('rejects a run without a parseable created_at', () => {
    expect(isAcceptableGreenRun(run({ created_at: 'not-a-date' }), { nowMs: NOW })).toBe(false);
  });

  it('rejects a green run older than the window', () => {
    const old = run({ created_at: hoursAgo((GREEN_RUN_MAX_AGE_DAYS_DEFAULT + 1) * 24) });
    expect(isAcceptableGreenRun(old, { nowMs: NOW })).toBe(false);
    const fresh = run({ created_at: hoursAgo((GREEN_RUN_MAX_AGE_DAYS_DEFAULT - 1) * 24) });
    expect(isAcceptableGreenRun(fresh, { nowMs: NOW })).toBe(true);
  });

  it('picks the NEWEST acceptable run, ignoring failed and PR runs', () => {
    const picked = pickGreenRun(
      [
        run({ head_sha: 'old', created_at: hoursAgo(10) }),
        run({ head_sha: 'new', created_at: hoursAgo(1) }),
        run({ head_sha: 'broken', created_at: hoursAgo(0.5), conclusion: 'failure' }),
        run({ head_sha: 'pr', created_at: hoursAgo(0.2), event: 'pull_request' }),
      ],
      { nowMs: NOW },
    );
    expect(picked.head_sha).toBe('new');
  });

  it('returns null when nothing is acceptable (never publishes blindly)', () => {
    expect(pickGreenRun([run({ conclusion: 'failure' })], { nowMs: NOW })).toBeNull();
    expect(pickGreenRun([], { nowMs: NOW })).toBeNull();
    expect(pickGreenRun(null, { nowMs: NOW })).toBeNull();
  });
});

describe('deploySource — decisão', () => {
  const manual = () =>
    evaluateDeploySource({ mode: 'workflow_dispatch', mainSha: 'main123' });

  it('workflow_dispatch stays ungated: same commit, no overlay', () => {
    const r = manual();
    expect(r.status).toBe('manual');
    expect(r.codeSha).toBe('main123');
    expect(r.dataSha).toBe('main123');
    expect(r.overlayPaths).toEqual([]);
    expect(r.warn).toBe(false);
  });

  it('fails loudly when there is no green run in the window', () => {
    const r = evaluateDeploySource({ mode: 'workflow_run', mainSha: 'main123', greenRun: null });
    expect(r.status).toBe('fail');
    expect(r.codeSha).toBeNull();
    expect(r.reason).toMatch(/nenhum run verde/);
  });

  it('fails when the green SHA is not an ancestor of main', () => {
    const r = evaluateDeploySource({
      mode: 'workflow_run',
      mainSha: 'main123',
      greenRun: run({ head_sha: 'deadbeef' }),
      greenIsAncestor: false,
    });
    expect(r.status).toBe('fail');
    expect(r.reason).toMatch(/não é antepassado/);
  });

  it('green code + fresh main data: publishes green SHA with main data overlaid', () => {
    const r = evaluateDeploySource({
      mode: 'workflow_run',
      mainSha: 'main123',
      greenRun: run({ head_sha: 'green456' }),
      greenIsAncestor: true,
      lagCommits: 4,
      lagHours: 3.5,
    });
    expect(r.status).toBe('ok');
    expect(r.codeSha).toBe('green456');
    expect(r.dataSha).toBe('main123');
    expect(r.overlayPaths).toEqual(['public/data']);
    expect(r.warn).toBe(false);
  });

  it('warns (but still publishes) when the code visibly lags main', () => {
    const byCommits = evaluateDeploySource({
      mode: 'workflow_run',
      mainSha: 'main123',
      greenRun: run({ head_sha: 'green456' }),
      greenIsAncestor: true,
      lagCommits: LAG_WARN_COMMITS_DEFAULT + 1,
      lagHours: 1,
    });
    expect(byCommits.status).toBe('ok');
    expect(byCommits.warn).toBe(true);
    expect(byCommits.warnReason).toMatch(/commits/);

    const byHours = evaluateDeploySource({
      mode: 'workflow_run',
      mainSha: 'main123',
      greenRun: run({ head_sha: 'green456' }),
      greenIsAncestor: true,
      lagCommits: 1,
      lagHours: LAG_WARN_HOURS_DEFAULT + 0.1,
    });
    expect(byHours.warn).toBe(true);
    expect(byHours.warnReason).toMatch(/h/);
  });
});

describe('deploySource — resumo', () => {
  it('always states code, data and lag — the lag must never be invisible', () => {
    const res = evaluateDeploySource({
      mode: 'workflow_run',
      mainSha: 'b'.repeat(40),
      greenRun: run({ head_sha: 'c'.repeat(40) }),
      greenIsAncestor: true,
      lagCommits: 30,
      lagHours: 60,
    });
    const md = formatDeploySummary(res, { greenRun: run({ head_sha: 'c'.repeat(40) }) });
    expect(md).toMatch(/c{9}/);
    expect(md).toMatch(/b{9}/);
    expect(md).toMatch(/30 commits \/ 60\.0 h/);
    expect(md).toMatch(/⚠️/);
    expect(md).toMatch(/public\/data/);
  });

  it('marks dry_run so a non-publishing run is unambiguous', () => {
    const res = evaluateDeploySource({ mode: 'workflow_dispatch', mainSha: 'main123' });
    expect(formatDeploySummary(res, { dryRun: true })).toMatch(/dry_run/);
  });
});
