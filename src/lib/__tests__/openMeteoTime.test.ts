import { describe, expect, it } from 'vitest';
import {
  findCurrentHourIndex,
  findCoveredHourIndex,
  hourKeyFromOpenMeteo,
  lisbonHourKeyFromDate,
} from '@/lib/openMeteoTime';

describe('openMeteoTime', () => {
  it('never calls the nearest expired/future hour current', () => {
    const now = new Date('2026-09-30T12:00:00Z'); // Lisbon 13:00
    expect(findCoveredHourIndex(['2026-09-29T23:00'], now)).toBe(-1);
    expect(findCoveredHourIndex(['2026-10-01T00:00'], now)).toBe(-1);
    expect(findCoveredHourIndex([], now)).toBe(-1);
    expect(findCoveredHourIndex(['2026-09-30T12:00', '2026-09-30T13:00'], now)).toBe(1);
  });

  it('parses Open-Meteo hourly keys without timezone offset', () => {
    expect(hourKeyFromOpenMeteo('2026-05-31T14:00')).toBe('2026-05-31T14');
  });

  it.each([
    ['2026-02-28T23:00', '2026-03-01T02:00', '2026-03-01T00:00:00Z'],
    ['2026-12-31T23:00', '2027-01-01T02:00', '2027-01-01T00:00:00Z'],
    ['2028-02-29T23:00', '2028-03-01T02:00', '2028-03-01T00:00:00Z'],
  ])('compares calendar distance across month/year boundaries (%s)', (before, after, now) => {
    expect(findCurrentHourIndex([before, after], new Date(now))).toBe(0);
  });

  it('picks the hourly slot matching Lisbon wall time', () => {
    const nowKey = lisbonHourKeyFromDate(new Date());
    const base = nowKey.slice(0, 10);
    const times = Array.from({ length: 24 }, (_, h) => `${base}T${String(h).padStart(2, '0')}:00`);
    const idx = findCurrentHourIndex(times);
    expect(hourKeyFromOpenMeteo(times[idx])).toBe(nowKey);
  });

  it('does not default to index 0 when the current Lisbon hour is not midnight', () => {
    const nowKey = lisbonHourKeyFromDate(new Date());
    if (nowKey.endsWith('T00')) return;

    const base = nowKey.slice(0, 10);
    const times = Array.from({ length: 24 }, (_, h) => `${base}T${String(h).padStart(2, '0')}:00`);
    const idx = findCurrentHourIndex(times);
    expect(idx).not.toBe(0);
    expect(hourKeyFromOpenMeteo(times[idx])).toBe(nowKey);
  });
});
