import { describe, it, expect } from 'vitest';
import {
  buildTideSchedule,
  findTideExtrema,
  formatTideScheduleLine,
} from '../tideSchedule';

describe('findTideExtrema', () => {
  it('finds high and low from synthetic curve', () => {
    const hours: { time: string; tideHeight: number }[] = [];
    for (let h = 0; h < 24; h += 1) {
      const tideHeight = Math.sin((h / 12) * Math.PI);
      hours.push({
        time: `2026-05-29T${String(h).padStart(2, '0')}:00`,
        tideHeight,
      });
    }
    const extrema = findTideExtrema(hours);
    expect(extrema.some((e) => e.type === 'high')).toBe(true);
    expect(extrema.some((e) => e.type === 'low')).toBe(true);
  });
});

describe('buildTideSchedule', () => {
  it('returns phase and next events from guincho-like data', () => {
    const hourly = [
      { time: '2026-05-29T04:00', tideHeight: -0.5 },
      { time: '2026-05-29T05:00', tideHeight: -0.9 },
      { time: '2026-05-29T06:00', tideHeight: -1.1 },
      { time: '2026-05-29T07:00', tideHeight: -0.8 },
      { time: '2026-05-29T08:00', tideHeight: -0.2 },
      { time: '2026-05-29T09:00', tideHeight: 0.4 },
      { time: '2026-05-29T10:00', tideHeight: 0.7 },
      { time: '2026-05-29T11:00', tideHeight: 0.5 },
      { time: '2026-05-29T12:00', tideHeight: 0.1 },
      { time: '2026-05-29T13:00', tideHeight: -0.4 },
      { time: '2026-05-29T14:00', tideHeight: -0.85 },
      { time: '2026-05-29T15:00', tideHeight: -1.05 },
      { time: '2026-05-29T16:00', tideHeight: -0.75 },
    ];

    const schedule = buildTideSchedule(hourly, {
      now: new Date('2026-05-29T08:30:00+01:00'),
      locale: 'pt',
      phaseOverride: 'rising',
    });

    expect(schedule).not.toBeNull();
    expect(schedule!.phaseLabel).toMatch(/subir/i);
    expect(schedule!.nextHigh).not.toBeNull();
    expect(schedule!.nextLow).not.toBeNull();
    expect(formatTideScheduleLine(schedule!, 'pt')).toMatch(/Baixa às/);
    expect(formatTideScheduleLine(schedule!, 'pt')).toMatch(/Alta às/);
    expect(formatTideScheduleLine(schedule!, 'pt')).not.toMatch(/3\.\d+m/);
  });
});
