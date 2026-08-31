import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ARCHIVE_WINDOW_DAYS,
  dayKeyOf,
  emptyArchive,
  readArchive,
  writeArchive,
  mergeSnapshot,
  pruneArchive,
  buildRegressionReport,
  readReport,
  writeReport,
  notifyRegressions,
} from '../skillRegression.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-regression-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const tmpFile = (name) => path.join(tmpDir, name);

/** Snapshot with a day key N days ago (wall day in UTC — fine for tests). */
function snap(daysAgo, overrides = {}) {
  const t = new Date(Date.now() - daysAgo * 86_400_000);
  return {
    day: t.toISOString().slice(0, 10),
    buoyId: '19',
    name: 'CSA92/D',
    n: 40,
    me: 0.1,
    rmse: 0.4,
    ...overrides,
  };
}

/** Seed an archive: `baselineDays` days of good stats, then `recentDays` of bad. */
function seededArchive({ baselineDays = 15, recentDays = 7, rmse = 0.9, me = 0.1 } = {}) {
  const a = emptyArchive();
  for (let i = baselineDays + recentDays; i >= recentDays; i--) {
    a.snapshots.push(snap(i, { rmse: 0.4 }));
  }
  for (let i = recentDays - 1; i >= 0; i--) {
    a.snapshots.push(snap(i, { rmse, me }));
  }
  return a;
}

describe('skillRegression', () => {
  it('dayKeyOf devolve o dia de Lisboa (ou null para inválido)', () => {
    expect(dayKeyOf('2026-08-15T10:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKeyOf('nope')).toBeNull();
  });

  it('mergeSnapshot arquiva um snapshot por boia+dia e deduplica no mesmo dia', () => {
    const a = emptyArchive();
    const byBuoy = {
      19: { buoyName: 'CSA92/D', n: 47, me: 0.2, rmse: 0.5 },
    };
    expect(mergeSnapshot(a, byBuoy, '2026-08-15T10:00:00Z')).toBe(1);
    // Re-run do mesmo dia (stats recomputadas) → substitui, não duplica.
    expect(mergeSnapshot(a, { ...byBuoy, 19: { ...byBuoy[19], rmse: 0.55 } }, '2026-08-15T12:00:00Z')).toBe(0);
    expect(a.snapshots).toHaveLength(1);
    expect(a.snapshots[0].rmse).toBe(0.55);
    expect(a.fetchedAt).toBe('2026-08-15T12:00:00Z');
  });

  it('mergeSnapshot ignora boias com n < 10 ou stats não finitas', () => {
    const a = emptyArchive();
    const byBuoy = {
      19: { buoyName: 'CSA92/D', n: 3, me: 0.2 }, // n baixo → ignorada
      2: { buoyName: 'CSA88/2', n: 47, me: 'nope' }, // me inválido → ignorada
      4: { buoyName: 'CSA83/1D', n: 47, me: 0.1, rmse: 0.4 }, // ok
    };
    expect(mergeSnapshot(a, byBuoy, '2026-08-15T10:00:00Z')).toBe(1);
    expect(a.snapshots).toHaveLength(1);
    expect(a.snapshots[0].buoyId).toBe('4');
  });

  it('pruneArchive remove snapshots fora da janela', () => {
    const a = emptyArchive();
    a.snapshots = [snap(5), snap(ARCHIVE_WINDOW_DAYS + 10)];
    pruneArchive(a);
    expect(a.snapshots).toHaveLength(1);
    expect(a.snapshots[0].day).toBe(snap(5).day);
  });

  it('detecta regressão: RMSE recente ≥ baseline + limiar', () => {
    const a = seededArchive();
    const rep = buildRegressionReport(a);
    expect(rep.regressions).toHaveLength(1);
    const r = rep.regressions[0];
    expect(r.buoyId).toBe('19');
    expect(r.verdict).toBe('regressed');
    expect(r.rmseDelta).toBeGreaterThanOrEqual(0.3);
    expect(r.reasons[0]).toMatch(/RMSE \+/);
    expect(rep.byBuoy['19'].verdict).toBe('regressed');
  });

  it('detecta regressão pelo |ME| (viés a aumentar) quando o RMSE não dispara', () => {
    const a = seededArchive({ rmse: 0.45, me: 0.9 }); // RMSE estável, ME sobe
    const rep = buildRegressionReport(a);
    expect(rep.regressions).toHaveLength(1);
    expect(rep.regressions[0].reasons[0]).toMatch(/\|ME\| \+/);
  });

  it('não regista melhoria nem ruído dentro do limiar', () => {
    // RMSE recente MELHORA (0.3 < 0.4) → sem regressão.
    const better = seededArchive({ rmse: 0.3 });
    expect(buildRegressionReport(better).regressions).toHaveLength(0);
    // RMSE sobe 0.2 (< limiar 0.3) → sem regressão.
    const small = seededArchive({ rmse: 0.6 });
    expect(buildRegressionReport(small).regressions).toHaveLength(0);
  });

  it('verdict insufficient sem baseline ou recente suficientes', () => {
    const a = seededArchive({ baselineDays: 1, recentDays: 1 }); // baseline < 3, recente < 2
    const rep = buildRegressionReport(a);
    expect(rep.regressions).toHaveLength(0);
    expect(rep.byBuoy['19'].verdict).toBe('insufficient');
  });

  it('read/write round-trip do arquivo e do report (escrita atómica)', () => {
    const archivePath = tmpFile('skill-regression-archive.json');
    const a = seededArchive();
    writeArchive(a, archivePath);
    expect(readArchive(archivePath).snapshots.length).toBeGreaterThan(0);
    // Corrompido → vazio.
    fs.writeFileSync(archivePath, '{nope', 'utf-8');
    expect(readArchive(archivePath).snapshots).toHaveLength(0);

    const reportPath = tmpFile('skill-regression.json');
    const rep = buildRegressionReport(a);
    writeReport(rep, reportPath);
    expect(readReport(reportPath).regressions).toHaveLength(1);
  });

  it('notifyRegressions notifica só na transição para regressed', async () => {
    const a = seededArchive();
    const rep = buildRegressionReport(a);
    const reportPath = tmpFile('skill-regression.json');
    // Sem report anterior (primeiro run) → transição dispara.
    const send = vi.fn(async () => true);

    // Sem chatId → dry-run (transição dispara mas não envia).
    const dry = await notifyRegressions(rep, { send, reportPath });
    expect(dry.notified).toBe(false);
    expect(dry.reason).toBe('no-chat-id');

    // Com chatId e sem report anterior → transição notifica.
    const first = await notifyRegressions(rep, { send, chatId: '123', reportPath });
    expect(first.notified).toBe(true);
    expect(first.newlyRegressed).toEqual(['CSA92/D']);
    writeReport(rep, reportPath);

    // Segunda execução — já reportado (report em disco) → sem notificação.
    const second = await notifyRegressions(rep, { send, chatId: '123', reportPath });
    expect(second.notified).toBe(false);
    expect(second.reason).toBe('already-reported');
  });
});
