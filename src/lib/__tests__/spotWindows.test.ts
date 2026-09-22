import { describe, it, expect } from 'vitest';
import { spotWindows } from '@/lib/spotWindows';

describe('spotWindows', () => {
  it('returns [] for an empty array', () => {
    expect(spotWindows([])).toEqual([]);
  });

  it('returns [] when every hour is below the threshold', () => {
    expect(spotWindows([10, 59, 30, 0])).toEqual([]);
  });

  it('detects a single contiguous window with peak index', () => {
    expect(spotWindows([20, 61, 80, 70, 30])).toEqual([
      { startIdx: 1, endIdx: 3, peakIdx: 2, peakScore: 80 },
    ]);
  });

  it('does not merge two windows separated by a single hour below', () => {
    const windows = spotWindows([65, 70, 40, 90, 85]);
    expect(windows).toHaveLength(2);
    // Sorted by peak desc: the 90-peak window first.
    expect(windows[0]).toEqual({ startIdx: 3, endIdx: 4, peakIdx: 3, peakScore: 90 });
    expect(windows[1]).toEqual({ startIdx: 0, endIdx: 1, peakIdx: 1, peakScore: 70 });
  });

  it('closes a window ending on the last index', () => {
    expect(spotWindows([10, 20, 75])).toEqual([
      { startIdx: 2, endIdx: 2, peakIdx: 2, peakScore: 75 },
    ]);
  });

  it('counts the exact threshold (60 is inside)', () => {
    expect(spotWindows([60, 59])).toEqual([
      { startIdx: 0, endIdx: 0, peakIdx: 0, peakScore: 60 },
    ]);
    expect(spotWindows([59])).toEqual([]);
  });

  it('respects a custom threshold', () => {
    expect(spotWindows([50, 55, 10], 50)).toEqual([
      { startIdx: 0, endIdx: 1, peakIdx: 1, peakScore: 55 },
    ]);
  });

  it('keeps the first peak on a tie and orders tied peaks by earliest start', () => {
    const windows = spotWindows([80, 80, 10, 80]);
    expect(windows[0]).toEqual({ startIdx: 0, endIdx: 1, peakIdx: 0, peakScore: 80 });
    expect(windows[1]).toEqual({ startIdx: 3, endIdx: 3, peakIdx: 3, peakScore: 80 });
  });
});
