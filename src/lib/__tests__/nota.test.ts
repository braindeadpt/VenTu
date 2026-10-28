import { describe, expect, it } from 'vitest';
import {
  NOTA_BAND_MIN,
  notaMinScore,
  notaTier,
  SCORE_TIER_THRESHOLDS,
  scoreTierFromScore,
  scoreToNota,
} from '@/lib/nota';
import { getScoreTier } from '@/lib/scoreThresholds';
import { getScoreTierLabel, getScoreTokens } from '@/lib/sportScore';
import { v6 as getSportScore } from './motorV6Teste';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { spots } from '@/lib/spots';

describe('scoreToNota — score 0–100 → nota inteira 0–10', () => {
  it.each([
    [0, 0],
    [4, 0],
    [5, 1],
    [44, 4],
    [45, 5],
    [64, 6],
    [65, 7],
    [84, 8],
    [85, 9],
    [94, 9],
    [95, 10],
    [100, 10],
  ])('score %d → nota %d', (score, nota) => {
    expect(scoreToNota(score)).toBe(nota);
  });

  it('é sempre inteira entre 0 e 10, mesmo fora do intervalo', () => {
    for (let s = -20; s <= 130; s += 0.5) {
      const n = scoreToNota(s);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('nunca devolve NaN (NaN/±∞ → 0)', () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(scoreToNota(v)).toBe(0);
      expect(Number.isNaN(scoreToNota(v))).toBe(false);
    }
  });
});

describe('notaTier — bandas Não dá < 3 ≤ Fraco < 5 ≤ Dá < 7 ≤ Bom < 9 ≤ Muito bom', () => {
  it.each([
    [0, 'closed'],
    [2.9, 'closed'],
    [3, 'poor'],
    [4.9, 'poor'],
    [5, 'fair'],
    [6.9, 'fair'],
    [7, 'good'],
    [8.9, 'good'],
    [9, 'epic'],
    [10, 'epic'],
  ] as const)('nota %d → %s', (nota, tier) => {
    expect(notaTier(nota)).toBe(tier);
  });

  it('NaN cai na banda mais baixa', () => {
    expect(notaTier(NaN)).toBe('closed');
  });

  it('rótulos PT/EN das bandas', () => {
    expect(['closed', 'poor', 'fair', 'good', 'epic'].map((t) => getScoreTierLabel(t as never, 'pt'))).toEqual([
      'Não dá',
      'Fraco',
      'Dá',
      'Bom',
      'Muito bom',
    ]);
    expect(['closed', 'poor', 'fair', 'good', 'epic'].map((t) => getScoreTierLabel(t as never, 'en'))).toEqual([
      'No go',
      'Poor',
      'OK',
      'Good',
      'Very good',
    ]);
  });
});

describe('limiares 0–100 ↔ nota', () => {
  it('notaMinScore é o menor score que arredonda para a nota', () => {
    for (let n = 1; n <= 10; n++) {
      const min = notaMinScore(n);
      expect(scoreToNota(min)).toBe(n);
      expect(scoreToNota(min - 0.01)).toBe(n - 1);
    }
    expect(notaMinScore(0)).toBe(0);
    expect(notaMinScore(NaN)).toBe(0);
  });

  it('SCORE_TIER_THRESHOLDS derivam das bandas da nota', () => {
    expect(SCORE_TIER_THRESHOLDS).toEqual({ epic: 85, good: 65, fair: 45, poor: 25 });
    for (const [tier, min] of Object.entries(NOTA_BAND_MIN)) {
      expect(scoreTierFromScore(notaMinScore(min))).toBe(tier);
    }
  });

  it('«nota ≥ n» filtra exactamente os scores cuja nota mostrada é ≥ n', () => {
    for (let n = 0; n <= 10; n++) {
      for (let s = 0; s <= 100; s++) {
        expect(s >= notaMinScore(n)).toBe(scoreToNota(s) >= n);
      }
    }
  });
});

describe('mesma hora → mesma nota e banda em todas as superfícies', () => {
  it('tokens, mapa, veredicto e nota concordam em todo o intervalo', () => {
    for (let s = 0; s <= 100; s += 0.25) {
      const tier = notaTier(scoreToNota(s));
      expect(getScoreTokens(s).tier).toBe(tier);
      expect(getScoreTier(s)).toBe(tier);
      expect(scoreBand(s).key).toBe(tier);
    }
  });

  it('o rating do motor é o rótulo da banda da nota', () => {
    const spot = spots.find((s) => s.slug === 'nazare') ?? spots[0];
    const result = getSportScore(spot, 'surf', {
      waveHeight: 1.5,
      wavePeriod: 11,
      windSpeed: 2,
      waveDirection: 290,
      windDirection: 90,
      windGust: 3,
      waterTemp: 17,
    });
    // v6 (#218 PR 6): nota 0 → «N/A»; acima, o rótulo da banda
    expect(result.score).toBeGreaterThan(0);
    const tier = scoreTierFromScore(result.score);
    expect(result.rating).toBe(getScoreTierLabel(tier, 'pt'));
    expect(result.ratingEn).toBe(getScoreTierLabel(tier, 'en'));
  });
});
