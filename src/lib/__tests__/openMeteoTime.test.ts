import { describe, expect, it } from 'vitest';
import {
  findCurrentHourIndex,
  hourKeyFromOpenMeteo,
  lisbonHourKeyFromDate,
} from '@/lib/openMeteoTime';

describe('openMeteoTime', () => {
  it('parses Open-Meteo hourly keys without timezone offset', () => {
    expect(hourKeyFromOpenMeteo('2026-05-31T14:00')).toBe('2026-05-31T14');
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
