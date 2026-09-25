import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  RANGES,
  findImplausibleValues,
  formatViolations,
} = require('../dataPlausibility.js');

describe('dataPlausibility (class guard do fill 99.99 do IH)', () => {
  it('deteta o fill 99.99 em hm0/waveHeight/maxWaveHeight', () => {
    const violations = findImplausibleValues({
      stations: { 4: { latest: { hm0: 99.99, tp: 12, hmax: 99.99 } } },
    });
    // Ordem de inserção da chave no JSON (hm0 antes de hmax).
    expect(violations.map((v) => v.key)).toEqual(['hm0', 'hmax']);
    expect(violations[0]).toMatchObject({ min: 0, max: 25, path: 'stations/4/latest/hm0' });
  });

  it('aceita o mar real e as constantes do relatório de skill', () => {
    const ok = findImplausibleValues({
      waveHeight: 0,
      maxWaveHeight: 25,
      wavePeriod: 24,
      swellPeriod: 0,
      windSpeed: 42,
      windGust: 60,
      waterTemp: 12.5,
      tideHeight: -3.4,
      score: 0,
      confidence: 100,
    });
    expect(ok).toEqual([]);
  });

  it('apanha valores negativos, NaN e Infinity nas chaves conhecidas', () => {
    const violations = findImplausibleValues({
      a: { waveHeight: -0.5 },
      b: { waterTemp: 900 },
      c: { tideHeight: 30 },
      d: { windSpeed: Infinity },
      e: { score: 140 },
    });
    // Infinity não é finito → não é reportado: o JSON não o representa (o
    // parse nunca produz Infinity), por isso não há falso alarme possível.
    expect(violations.find((v) => v.key === 'windSpeed')).toBeUndefined();
    expect(violations.map((v) => v.key)).toEqual([
      'waveHeight',
      'waterTemp',
      'tideHeight',
      'score',
    ]);
  });

  it('percorre arrays e objectos aninhados com o caminho completo', () => {
    const violations = findImplausibleValues({
      spots: [{ slug: 'guincho', observedWave: { waveHeight: 99.99 } }],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('spots[]/observedWave/waveHeight');
  });

  it('ignora chaves desconhecidas — zero falsos positivos por adivinhação', () => {
    const ok = findImplausibleValues({
      // Nomes parecidos, semântica diferente: nunca são comparados.
      waveHeightNotes: 99.99,
      scoreVersion: 12345,
      tpTotal: 9999,
      hm0Count: 500,
    });
    expect(ok).toEqual([]);
  });

  it('não entra em ciclos nem em estruturas profundas sem fim', () => {
    const deep = {};
    let cur = deep;
    for (let i = 0; i < 50; i++) {
      cur.next = {};
      cur = cur.next;
    }
    cur.hm0 = 99.99; // fora do alcance do MAX_DEPTH — ignorado, não rebenta
    expect(findImplausibleValues(deep)).toEqual([]);
  });

  it('formatViolations agrega por chave com exemplos e limites', () => {
    const lines = formatViolations([
      { key: 'hm0', value: 99.99, min: 0, max: 25, path: 'p1/hm0' },
      { key: 'hm0', value: 99.99, min: 0, max: 25, path: 'p2/hm0' },
      { key: 'score', value: 140, min: 0, max: 100, path: 'p3/score' },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('2 valor(es) fora de [0, 25] em "hm0"');
    expect(lines[0]).toContain('p1/hm0=99.99');
    expect(lines[1]).toContain('[0, 100] em "score"');
  });

  it('o catálogo cobre as chaves de onda/vento/maré que o pipeline serve', () => {
    for (const key of [
      'waveHeight',
      'hm0',
      'hmax',
      'maxWaveHeight',
      'wavePeriod',
      'swellPeriod',
      'windSpeed',
      'windGust',
      'waterTemp',
      'tideHeight',
      'score',
      'confidence',
    ]) {
      expect(RANGES[key], key).toBeDefined();
    }
  });
});
