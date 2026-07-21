import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  aggregateFeedback,
  summarizeBySport,
  flagCandidates,
  MIN_N_PER_SPORT,
} = require('../../analyze-score-feedback.js');

describe('aggregateFeedback', () => {
  it('groups by spot:sport and computes bias', () => {
    const rows = aggregateFeedback([
      { spot_slug: 'guincho', sport: 'kitesurf', verdict: 'better', predicted_score: 40 },
      { spot_slug: 'guincho', sport: 'kitesurf', verdict: 'better', predicted_score: 42 },
      { spot_slug: 'guincho', sport: 'kitesurf', verdict: 'worse', predicted_score: 45 },
      { spot_slug: 'nazare', sport: 'surf', verdict: 'same', predicted_score: 70 },
    ]);
    const g = rows.find((r) => r.key === 'guincho:kitesurf');
    expect(g?.n).toBe(3);
    expect(g?.better).toBe(2);
    expect(g?.worse).toBe(1);
    expect(g?.biasPct).toBeCloseTo(((2 - 1) / 3) * 100, 5);
  });
});

describe('summarizeBySport', () => {
  it('marks sport ready at N threshold', () => {
    const rows = aggregateFeedback(
      Array.from({ length: MIN_N_PER_SPORT }, () => ({
        spot_slug: 'a',
        sport: 'kitesurf',
        verdict: 'same',
        predicted_score: 50,
      })),
    );
    const by = summarizeBySport(rows);
    expect(by[0].readyForWeightTune).toBe(true);
    expect(by[0].n).toBe(MIN_N_PER_SPORT);
  });
});

describe('flagCandidates', () => {
  it('flags strong bias with enough n', () => {
    const rows = aggregateFeedback([
      ...Array.from({ length: 4 }, () => ({
        spot_slug: 'guincho',
        sport: 'kitesurf',
        verdict: 'better',
        predicted_score: 30,
      })),
      {
        spot_slug: 'guincho',
        sport: 'kitesurf',
        verdict: 'worse',
        predicted_score: 30,
      },
    ]);
    const flags = flagCandidates(rows);
    expect(flags.some((f) => f.key === 'guincho:kitesurf')).toBe(true);
  });
});
