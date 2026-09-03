import { describe, expect, it } from 'vitest';
import type { Spot } from '@/types';
import {
  buildMapHoursFile,
  indexForHourOfDay,
  mapHoursClock,
  parseHourOfDayParam,
  pickMapHourTimes,
  scoreAtHour,
} from '@/lib/mapHours';

function spot(id: string): Spot {
  return {
    id,
    slug: id,
    name: id,
    nameEn: id,
    region: 'Test',
    regionEn: 'Test',
    lat: 41,
    lon: -8.9,
    coastOrientation: 270,
    type: 'surf',
    difficulty: 'intermediate',
    bestWind: 'N',
    bestSwell: 'W',
    description: '',
    descriptionEn: '',
    facilities: [],
    hazards: [],
    compatibleSports: ['surf'],
  };
}

function hour(time: string, waveHeight: number): Record<string, unknown> {
  return {
    time,
    waveHeight,
    wavePeriod: 12,
    waveDirection: 270,
    windSpeed: 2,
    windDirection: 90,
    windGust: 3,
    waterTemp: 18,
  };
}

describe('mapHours', () => {
  const times = Array.from({ length: 72 }, (_, i) => {
    const day = String(3 + Math.floor(i / 24)).padStart(2, '0');
    const hh = String(i % 24).padStart(2, '0');
    return `2026-09-${day}T${hh}:00`;
  });

  // 08:00 Lisbon = 07:00 UTC during WEST (Sep).
  const now = new Date('2026-09-03T07:00:00.000Z');

  it('picks 16 steps of 3h from now', () => {
    const picked = pickMapHourTimes(times, now);
    expect(picked).toHaveLength(16);
    expect(picked[0]).toBe('2026-09-03T08:00');
    expect(picked[1]).toBe('2026-09-03T11:00');
    expect(picked[3]).toBe('2026-09-03T17:00');
  });

  it('clock is the Lisbon hour', () => {
    expect(mapHoursClock('2026-09-03T18:00')).toBe('18h');
  });

  it('indexForHourOfDay finds the 17h step', () => {
    const picked = pickMapHourTimes(times, now);
    expect(mapHoursClock(picked[indexForHourOfDay(picked, 17)])).toBe('17h');
  });

  it('parseHourOfDayParam accepts 0–23', () => {
    expect(parseHourOfDayParam('18')).toBe(18);
    expect(parseHourOfDayParam('0')).toBe(0);
    expect(parseHourOfDayParam('24')).toBeNull();
    expect(parseHourOfDayParam('')).toBeNull();
    expect(parseHourOfDayParam(null)).toBeNull();
  });

  it('builds scores that change from morning to afternoon', () => {
    const nazare = spot('nazare');
    const file = buildMapHoursFile({
      now,
      generatedAt: '2026-09-03T07:00:00.000Z',
      spots: [nazare],
      conditions: {},
      forecasts: {
        nazare: times.map((t) => hour(t, t.endsWith('T08:00') ? 0.4 : 2.4)),
      },
    });
    expect(file.times).toHaveLength(16);
    const morning = scoreAtHour(file, 'nazare', 'surf', 0);
    const afternoon = scoreAtHour(file, 'nazare', 'surf', indexForHourOfDay(file.times, 17));
    expect(morning).toBeDefined();
    expect(afternoon).toBeDefined();
    expect(afternoon).toBeGreaterThan(morning!);
    expect(scoreAtHour(file, 'nazare', 'all', 3)!).toBeGreaterThanOrEqual(
      scoreAtHour(file, 'nazare', 'surf', 3)!,
    );
  });
});
