import { describe, it, expect } from 'vitest';
import { spotTimelineScore } from '@/lib/spotTimelineScore';

describe('spotTimelineScore', () => {
  const scores = [40, 55, 90, 20];

  it('uses the corrected «now» score at nowIndex, not the modelled one', () => {
    expect(
      spotTimelineScore({ index: 2, nowIndex: 2, scores, nowScore: 87 }),
    ).toBe(87);
  });

  it('uses the forecast score away from nowIndex', () => {
    expect(
      spotTimelineScore({ index: 1, nowIndex: 2, scores, nowScore: 87 }),
    ).toBe(55);
  });

  it('ignores nowScore when nowIndex is -1 (before mount)', () => {
    expect(
      spotTimelineScore({ index: 0, nowIndex: -1, scores, nowScore: 87 }),
    ).toBe(40);
  });

  it('falls back to scores[nowIndex] when nowScore is missing', () => {
    expect(spotTimelineScore({ index: 2, nowIndex: 2, scores })).toBe(90);
  });

  it('returns undefined for an out-of-range index', () => {
    expect(
      spotTimelineScore({ index: 9, nowIndex: 2, scores, nowScore: 87 }),
    ).toBeUndefined();
    expect(spotTimelineScore({ index: 0, nowIndex: -1, scores: [] })).toBeUndefined();
  });
});
