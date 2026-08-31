import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  ARCHIVE_WINDOW_DAYS,
  emptyArchive,
  readArchive,
  writeArchive,
  mergeDayPairs,
  pruneArchive,
  pairStatsFromArchive,
} = require('../buoyCoherenceArchive.js');

const CODES = ['6200084', '6201077']; // Silleiro × Porto

function hourly(dateHour, esHs, ptHs, codes = CODES, pair = 'Cabo Silleiro × Porto', dateOverride) {
  return {
    pair,
    codes,
    hour: `${dateHour}`,
    esHs,
    ptHs,
    date: dateOverride ?? `${dateHour}:00:00Z`,
  };
}

describe('mergeDayPairs (dedup por par + hora UTC)', () => {
  it('acumula dias e deduplica a mesma hora mantendo a leitura mais recente', () => {
    const a = emptyArchive();
    // Dia 1: PT esparso (2 leituras).
    mergeDayPairs(a, [
      hourly('2026-08-14T08', 1.6, 1.5),
      hourly('2026-08-14T13', 1.7, 1.8),
    ]);
    // Dia 2: mais 2 horas + re-fetch da hora 08 (leitura mais recente substitui).
    const touched = mergeDayPairs(a, [
      hourly('2026-08-14T08', 1.6, 1.55, CODES, 'Cabo Silleiro × Porto', '2026-08-14T08:55:00Z'),
      hourly('2026-08-15T09', 1.9, 1.8),
      hourly('2026-08-15T14', 2.0, 2.1),
    ]);
    expect(a.pairs).toHaveLength(4);
    expect(touched).toBe(3); // 08 substituída + 2 novas
    const h08 = a.pairs.find((p) => p.hour === '2026-08-14T08');
    expect(h08.ptHs).toBe(1.55);
  });

  it('vazio / sem pares → 0 e nunca lança', () => {
    const a = emptyArchive();
    expect(mergeDayPairs(a, [])).toBe(0);
    expect(mergeDayPairs(a, null)).toBe(0);
    expect(a.pairs).toEqual([]);
  });
});

describe('pairStatsFromArchive (acumulação dá n suficiente)', () => {
  it('com boias PT esparsas, n cresce dia a dia e o veredicto deixa de ser insufficient', () => {
    const a = emptyArchive();
    // 1º dia: só 1 hora sobreposta → insufficient.
    mergeDayPairs(a, [hourly('2026-08-14T08', 1.6, 1.5)]);
    let stats = pairStatsFromArchive(a, CODES);
    expect(stats.n).toBe(1);
    expect(stats.verdict).toBe('insufficient');

    // Boias PT esparsas: acumulam-se horas dia a dia até atingir o gate da
    // janela (MIN_ACCUMULATED_PAIRS=10) — abaixo disso o veredicto é
    // 'insufficient' por design (3 horas esparsas são ruído, não veredicto).
    const rows = [
      hourly('2026-08-14T13', 1.7, 1.8),
      hourly('2026-08-15T09', 1.9, 1.8),
      hourly('2026-08-15T14', 2.0, 2.1),
      hourly('2026-08-16T10', 2.1, 2.0),
      hourly('2026-08-16T15', 2.2, 2.3),
      hourly('2026-08-16T20', 2.3, 2.4),
    ];
    // Antes de chegar ao floor da janela → ainda insufficient.
    mergeDayPairs(a, rows);
    stats = pairStatsFromArchive(a, CODES);
    expect(stats.n).toBe(7); // 1 inicial + 6
    expect(stats.verdict).toBe('insufficient');
    // Acumulando até n≥10 (janela) → coherent (mean|Δ| pequeno).
    mergeDayPairs(a, [
      hourly('2026-08-17T08', 2.1, 2.0),
      hourly('2026-08-17T09', 2.2, 2.1),
      hourly('2026-08-17T14', 2.3, 2.2),
      hourly('2026-08-18T08', 2.0, 2.1),
      hourly('2026-08-18T14', 2.2, 2.3),
    ]);
    stats = pairStatsFromArchive(a, CODES);
    expect(stats.n).toBe(12); // 1 inicial + 6 + 5
    expect(stats.verdict).toBe('coherent');
    expect(stats.meanAbsDeltaM).toBeLessThanOrEqual(0.2);
    expect(stats.firstHour).toBe('2026-08-14T08');
    expect(stats.lastHour).toBe('2026-08-18T14');
  });

  it('verdict incoherent só com amostra da janela suficiente (n≥10) a divergir (mean|Δ| ≥ 1.5 m)', () => {
    const a = emptyArchive();
    // n=3 a divergir NÃO basta para incoherent na janela — é insufficient.
    mergeDayPairs(a, [
      hourly('2026-08-14T08', 1.0, 3.0),
      hourly('2026-08-14T09', 1.1, 3.2),
      hourly('2026-08-15T08', 1.2, 3.1),
    ]);
    let stats = pairStatsFromArchive(a, CODES);
    expect(stats.n).toBe(3);
    expect(stats.verdict).toBe('insufficient');
    // n≥10 a divergir → incoherent.
    mergeDayPairs(a, [
      hourly('2026-08-15T09', 1.0, 3.0),
      hourly('2026-08-15T14', 1.1, 3.2),
      hourly('2026-08-16T08', 1.2, 3.1),
      hourly('2026-08-16T09', 1.0, 3.0),
      hourly('2026-08-16T14', 1.1, 3.2),
      hourly('2026-08-17T08', 1.2, 3.1),
      hourly('2026-08-17T09', 1.0, 3.0),
    ]);
    stats = pairStatsFromArchive(a, CODES);
    expect(stats.verdict).toBe('incoherent');
    expect(stats.n).toBeGreaterThanOrEqual(10);
  });

  it('devolve null para par sem horas arquivadas; pares diferentes não misturam', () => {
    const a = emptyArchive();
    mergeDayPairs(a, [
      hourly('2026-08-14T08', 1.6, 1.5),
      hourly('2026-08-14T08', 0.8, 0.9, ['6200085', '6201079'], 'Golfo de Cádiz × Faro'),
    ]);
    expect(pairStatsFromArchive(a, CODES).n).toBe(1);
    expect(pairStatsFromArchive(a, ['6200085', '6201079']).n).toBe(1);
    expect(pairStatsFromArchive(a, ['6200083', '6201077'])).toBeNull();
  });
});

describe('pruneArchive + persistência', () => {
  it('remove pares fora da janela (30 dias)', () => {
    const a = emptyArchive();
    mergeDayPairs(a, [
      hourly('2026-08-14T08', 1.6, 1.5),
      hourly('2026-05-01T08', 1.6, 1.5),
    ]);
    pruneArchive(a, Date.parse('2026-08-16T00:00:00Z'), ARCHIVE_WINDOW_DAYS);
    expect(a.pairs).toHaveLength(1);
    expect(a.pairs[0].hour).toBe('2026-08-14T08');
  });

  it('read/write round-trip e arquivo ausente/corrompido → vazio', () => {
    const p = path.join(os.tmpdir(), 'coherence-archive-test.json');
    const a = emptyArchive();
    mergeDayPairs(a, [hourly('2026-08-14T08', 1.6, 1.5)]);
    writeArchive(a, p);
    const back = readArchive(p);
    expect(back.pairs).toHaveLength(1);
    fs.rmSync(p, { force: true });
    expect(readArchive(p)).toEqual(emptyArchive());
    fs.writeFileSync(p, '{corrupt');
    expect(readArchive(p).pairs).toEqual([]);
    fs.rmSync(p, { force: true });
  });

  it('janela de arquivo é 30 dias', () => {
    expect(ARCHIVE_WINDOW_DAYS).toBe(30);
  });
});
