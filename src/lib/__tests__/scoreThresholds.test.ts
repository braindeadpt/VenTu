import { describe, expect, it } from 'vitest';
import { getScoreRgb, getScoreTier } from '@/lib/scoreThresholds';
import { getScoreTokens } from '@/lib/sportScore';

describe('scoreThresholds', () => {
  it('aligns map rgb tier with ScoreBadge tokens at boundary scores', () => {
    const cases = [0, 19, 20, 39, 40, 59, 60, 79, 80, 100];
    for (const score of cases) {
      expect(getScoreTier(score)).toBe(getScoreTokens(score).tier);
    }
  });

  it('uses design-system css vars in rgb output', () => {
    expect(getScoreRgb(85)).toBe('rgb(var(--score-epic))');
    expect(getScoreRgb(65)).toBe('rgb(var(--score-good))');
    expect(getScoreRgb(45)).toBe('rgb(var(--score-fair))');
    expect(getScoreRgb(25)).toBe('rgb(var(--score-poor))');
    expect(getScoreRgb(5)).toBe('rgb(var(--score-closed))');
  });
});
