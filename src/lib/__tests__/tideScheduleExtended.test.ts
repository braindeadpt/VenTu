import { describe, it, expect } from 'vitest';
import {
  findTideExtrema,
  buildTideSchedule,
  formatTideTime,
  formatTideScheduleLine,
  phaseFromConditionsStatus,
  getTidePhasesForHours,
  type TideHourPoint,
} from '@/lib/tideSchedule';

function makeHourlyPoints(heights: number[], startHour = 0): TideHourPoint[] {
  return heights.map((h, i) => ({
    time: `2026-06-28T${String(startHour + i).padStart(2, '0')}:00:00Z`,
    tideHeight: h,
  }));
}

describe('findTideExtrema', () => {
  it('returns empty for fewer than 3 points', () => {
    expect(findTideExtrema(makeHourlyPoints([1, 2]))).toEqual([]);
  });

  it('detects a high tide peak', () => {
    const points = makeHourlyPoints([0, 0.5, 1.0, 0.5, 0]);
    const extrema = findTideExtrema(points);
    expect(extrema.some(e => e.type === 'high')).toBe(true);
  });

  it('detects a low tide trough', () => {
    const points = makeHourlyPoints([0.5, 0, -0.5, 0, 0.5]);
    const extrema = findTideExtrema(points);
    expect(extrema.some(e => e.type === 'low')).toBe(true);
  });

  it('detects alternating high and low tides', () => {
    const points = makeHourlyPoints([0, 0.5, 1.0, 0.5, 0, -0.5, -1.0, -0.5, 0]);
    const extrema = findTideExtrema(points);
    const types = extrema.map(e => e.type);
    expect(types).toContain('high');
    expect(types).toContain('low');
  });

  it('skips points without tideHeight', () => {
    const points: TideHourPoint[] = [
      { time: '2026-06-28T00:00:00Z' },
      { time: '2026-06-28T01:00:00Z', tideHeight: 1 },
      { time: '2026-06-28T02:00:00Z', tideHeight: 0.5 },
    ];
    expect(findTideExtrema(points)).toEqual([]);
  });
});

describe('buildTideSchedule', () => {
  it('returns null for fewer than 2 valid points', () => {
    const points = makeHourlyPoints([1]);
    expect(buildTideSchedule(points)).toBeNull();
  });

  it('returns schedule with phase and labels', () => {
    const points = makeHourlyPoints([0, 0.3, 0.8, 1.2, 0.8, 0.3, 0, -0.3, -0.6, -0.3, 0, 0.3], 0);
    const schedule = buildTideSchedule(points, {
      now: new Date('2026-06-28T01:00:00Z'),
      locale: 'pt',
    });
    expect(schedule).not.toBeNull();
    expect(schedule!.phaseLabel).toBeTruthy();
  });

  it('uses phase override when provided', () => {
    const points = makeHourlyPoints([0, 0.3, 0.8, 0.3, 0], 0);
    const schedule = buildTideSchedule(points, {
      now: new Date('2026-06-28T01:00:00Z'),
      phaseOverride: 'falling',
      locale: 'pt',
    });
    expect(schedule!.phase).toBe('falling');
  });

  it('uses EN labels when locale is en', () => {
    const points = makeHourlyPoints([0, 0.3, 0.8, 0.3, 0], 0);
    const schedule = buildTideSchedule(points, {
      now: new Date('2026-06-28T01:00:00Z'),
      phaseOverride: 'rising',
      locale: 'en',
    });
    expect(schedule!.phaseLabel).toBe('Rising tide');
  });
});

describe('formatTideTime', () => {
  it('formats a date as HH:mm in PT', () => {
    const d = new Date('2026-06-28T14:30:00Z');
    const result = formatTideTime(d, 'pt');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formats a date as HH:mm in EN', () => {
    const d = new Date('2026-06-28T14:30:00Z');
    const result = formatTideTime(d, 'en');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatTideScheduleLine', () => {
  it('includes phase label', () => {
    const line = formatTideScheduleLine(
      { phase: 'rising', phaseLabel: 'Maré a subir', nextHigh: null, nextLow: null },
      'pt',
    );
    expect(line).toContain('Maré a subir');
  });

  it('includes next low time in PT', () => {
    const nextLow = new Date('2026-06-28T10:00:00Z');
    const line = formatTideScheduleLine(
      { phase: 'falling', phaseLabel: 'Maré a descer', nextHigh: null, nextLow },
      'pt',
    );
    expect(line).toContain('Baixa às');
  });

  it('includes next high time in EN', () => {
    const nextHigh = new Date('2026-06-28T16:00:00Z');
    const line = formatTideScheduleLine(
      { phase: 'rising', phaseLabel: 'Rising tide', nextHigh, nextLow: null },
      'en',
    );
    expect(line).toContain('High at');
  });
});

describe('phaseFromConditionsStatus', () => {
  it('passes through valid statuses', () => {
    expect(phaseFromConditionsStatus('high')).toBe('high');
    expect(phaseFromConditionsStatus('low')).toBe('low');
    expect(phaseFromConditionsStatus('rising')).toBe('rising');
    expect(phaseFromConditionsStatus('falling')).toBe('falling');
  });

  it('returns undefined when no status', () => {
    expect(phaseFromConditionsStatus(undefined)).toBeUndefined();
  });
});

describe('getTidePhasesForHours', () => {
  it('returns phases for each hour', () => {
    const points = makeHourlyPoints([0, 0.3, 0.8, 1.2, 0.8, 0.3, 0, -0.3, -0.6, -0.3, 0, 0.3], 0);
    const phases = getTidePhasesForHours(points);
    expect(phases).toHaveLength(points.length);
    expect(phases.some(p => p === 'rising' || p === 'falling')).toBe(true);
  });

  it('returns null for points without tideHeight', () => {
    const points: TideHourPoint[] = [
      { time: '2026-06-28T00:00:00Z' },
      { time: '2026-06-28T01:00:00Z', tideHeight: 1 },
    ];
    const phases = getTidePhasesForHours(points);
    expect(phases[0]).toBeNull();
  });
});
