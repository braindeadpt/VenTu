import { describe, it, expect } from 'vitest';
import {
  buildTideSchedule,
  findTideExtrema,
  formatTideScheduleLine,
  getTidePhasesForHours,
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

describe('getTidePhasesForHours', () => {
  it('marks extrema and rising/falling between them', () => {
    const hourly = [
      { time: '2026-05-29T05:00', tideHeight: -0.9 },
      { time: '2026-05-29T06:00', tideHeight: -1.1 },
      { time: '2026-05-29T07:00', tideHeight: -0.8 },
      { time: '2026-05-29T08:00', tideHeight: -0.2 },
      { time: '2026-05-29T09:00', tideHeight: 0.4 },
      { time: '2026-05-29T10:00', tideHeight: 0.7 },
    ];
    const phases = getTidePhasesForHours(hourly);
    expect(phases[1]).toBe('low');
    expect(phases[5]).toBe('high');
    expect(phases[3]).toBe('rising');
    expect(phases[4]).toBe('rising');
  });

  it('não depende do fuso do browser — mudança de hora em Auckland (27 set 2026)', () => {
    // Preia-mar às 03:00 de 27 set; em Pacific/Auckland as 02:00 desse dia
    // não existem (entrada na hora de Verão) e um parse local das 02:00 dá o
    // mesmo instante das 03:00. O HTML do build (UTC) e o browser em Auckland
    // tinham de dar a mesma tabela — antes, a «maré alta» mudava de coluna
    // e a página rebentava com React #418.
    const hourly = Array.from({ length: 13 }, (_, k) => {
      const h = 20 + k;
      const day = h < 24 ? '26' : '27';
      return {
        time: `2026-09-${day}T${String(h % 24).padStart(2, '0')}:00`,
        tideHeight: Number((1.5 * Math.cos(((k - 7) / 12.4) * 2 * Math.PI)).toFixed(3)),
      };
    });
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Lisbon';
      const lisbon = getTidePhasesForHours(hourly);
      process.env.TZ = 'Pacific/Auckland';
      const auckland = getTidePhasesForHours(hourly);
      expect(lisbon[7]).toBe('high'); // 27T03:00
      expect(lisbon[6]).toBe('rising'); // 27T02:00
      expect(auckland).toEqual(lisbon);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});
