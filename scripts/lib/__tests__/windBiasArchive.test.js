import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_OUTPUT_PATH,
  WIND_WINDOW_DAYS,
  MIN_PAIRS,
  stationKey,
  hourKeyOf,
  emptyArchive,
  readArchive,
  writeArchive,
  mergePairs,
  pruneArchive,
  buildStationStats,
  buildReport,
} from '../windBiasArchive.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wind-bias-archive-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const tmpFile = (name) => path.join(tmpDir, name);

const pair = (overrides = {}) => ({
  stationKey: 'ipma|Cascais',
  spotId: 'guincho',
  hourKey: '2026-08-15T10',
  observedAt: '2026-08-15T10:10:00.000Z',
  observedKt: 14,
  forecastKt: 12,
  source: 'ipma',
  stationName: 'Cascais',
  ...overrides,
});

describe('windBiasArchive', () => {
  it('stationKey distingue fontes e usa metarIcao quando existe', () => {
    expect(stationKey('ipma', 'Cascais')).toBe('ipma|Cascais');
    expect(stationKey('metar', 'Lisboa', 'LPPT')).toBe('metar|LPPT');
    expect(stationKey('ecowitt', 'TAP Teste 3')).toBe('ecowitt|TAP Teste 3');
  });

  it('hourKeyOf devolve a hora UTC do instante', () => {
    expect(hourKeyOf('2026-08-15T10:42:00.000Z')).toBe('2026-08-15T10');
    expect(hourKeyOf('nope')).toBeNull();
  });

  it('mergePairs deduplica por estação+spot+hora e mantém a leitura mais recente', () => {
    const archive = emptyArchive();
    // Duas leituras da mesma hora — a mais recente ganha.
    mergePairs(archive, [
      pair({ observedAt: '2026-08-15T10:10:00.000Z', observedKt: 14 }),
      pair({ observedAt: '2026-08-15T10:20:00.000Z', observedKt: 16 }),
    ]);
    expect(archive.pairs).toHaveLength(1);
    expect(archive.pairs[0].observedKt).toBe(16);

    // Outra hora → par novo; outro spot → par novo.
    mergePairs(archive, [
      pair({ hourKey: '2026-08-15T11', observedAt: '2026-08-15T11:00:00.000Z' }),
      pair({ spotId: 'carcavelos', observedAt: '2026-08-15T10:30:00.000Z' }),
    ]);
    expect(archive.pairs).toHaveLength(3);

    // Re-fetch da mesma hora substitui (leitura mais recente), não duplica.
    mergePairs(archive, [
      pair({ observedAt: '2026-08-15T10:30:00.000Z', observedKt: 15 }),
    ]);
    expect(archive.pairs).toHaveLength(3);
    expect(archive.pairs.find((p) => p.hourKey === '2026-08-15T10' && p.spotId === 'guincho').observedKt).toBe(15);
  });

  it('pares sem hourKey válida são ignorados', () => {
    const archive = emptyArchive();
    mergePairs(archive, [pair({ hourKey: null })]);
    expect(archive.pairs).toHaveLength(0);
  });

  it('pruneArchive remove pares fora da janela', () => {
    const archive = emptyArchive();
    const now = Date.parse('2026-08-15T12:00:00Z');
    mergePairs(archive, [
      pair({ hourKey: '2026-08-15T11', observedAt: '2026-08-15T11:00:00.000Z' }),
      pair({ hourKey: '2026-07-01T10', observedAt: '2026-07-01T10:00:00.000Z' }), // 45 dias → fora
    ]);
    pruneArchive(archive, now, 30);
    expect(archive.pairs).toHaveLength(1);
    expect(archive.pairs[0].hourKey).toBe('2026-08-15T11');
  });

  it('buildStationStats: ME/MAE/RMSE/n por estação, só com n ≥ MIN_PAIRS', () => {
    const archive = emptyArchive();
    // 11 pares da mesma estação (Cascais): observado 14, previsão 12 → erro +2.
    const pairs = [];
    for (let i = 0; i < 11; i++) {
      pairs.push(
        pair({
          hourKey: `2026-08-10T${String(10 + i).padStart(2, '0')}`,
          observedAt: `2026-08-10T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        }),
      );
    }
    // Uma estação com n < MIN_PAIRS não aparece.
    pairs.push(
      pair({
        stationKey: 'metar|LPPT',
        spotId: 'lisboa',
        source: 'metar',
        stationName: 'Lisboa',
        observedAt: '2026-08-10T10:00:00.000Z',
      }),
    );
    mergePairs(archive, pairs);

    const stats = buildStationStats(archive.pairs);
    expect(stats['ipma|Cascais']).toMatchObject({
      station: 'Cascais',
      source: 'ipma',
      n: 11,
      me: 2,
      mae: 2,
      rmse: 2,
    });
    expect(stats['metar|LPPT']).toBeUndefined();
  });

  it('buildReport escreve stations/pairCount/lastPairs e não muta pares', () => {
    const archive = emptyArchive();
    mergePairs(archive, [pair({ observedAt: '2026-08-15T10:10:00.000Z' })]);
    const report = buildReport(archive);
    expect(report.pairCount).toBe(1);
    expect(report.windowDays).toBe(WIND_WINDOW_DAYS);
    expect(report.minPairs).toBe(MIN_PAIRS);
    expect(Object.keys(report.stations)).toHaveLength(0); // n < MIN_PAIRS
    expect(report.lastPairs).toHaveLength(1);
    expect(report.lastPairs[0]).toMatchObject({
      stationKey: 'ipma|Cascais',
      station: 'Cascais',
      observedKt: 14,
      forecastKt: 12,
    });
    expect(archive.pairs).toHaveLength(1);
  });

  it('read/write round-trip preserva o arquivo (escrita atómica)', () => {
    const outPath = tmpFile('wind-bias.json');
    const archive = emptyArchive();
    mergePairs(archive, [pair({ observedAt: '2026-08-15T10:10:00.000Z' })]);
    writeArchive(archive, outPath);
    const back = readArchive(outPath);
    expect(back.pairs).toHaveLength(1);
    expect(back.pairs[0].stationKey).toBe('ipma|Cascais');

    // Arquivo corrompido → volta ao vazio graciosamente.
    fs.writeFileSync(outPath, '{not json', 'utf-8');
    expect(readArchive(outPath).pairs).toHaveLength(0);
    // Ausente → vazio.
    expect(readArchive(tmpFile('missing.json')).pairs).toHaveLength(0);
  });

  it('DEFAULT_OUTPUT_PATH aponta para public/data/wind-bias.json', () => {
    expect(DEFAULT_OUTPUT_PATH.endsWith(path.join('public', 'data', 'wind-bias.json'))).toBe(true);
  });
});
