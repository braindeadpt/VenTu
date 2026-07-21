import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  median,
  blendWindAtIndex,
  applyWindBlendToHours,
} = require('../windBlend.js');

describe('median', () => {
  it('returns middle value', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('blendWindAtIndex', () => {
  it('floors at best_match when ICON-EU is weaker', () => {
    const out = blendWindAtIndex(
      5,
      270,
      7,
      { icon_eu: 3, ecmwf_ifs025: 4, gfs_seamless: 3.5 },
      { icon_eu: 280 },
      { icon_eu: 5 },
    );
    expect(out.windSpeed).toBe(5);
    expect(out.method).toBe('icon_eu_floor');
    expect(out.blended).toBe(false);
  });

  it('lifts to ICON-EU when stronger than best_match', () => {
    const out = blendWindAtIndex(
      4,
      270,
      6,
      { icon_eu: 8, ecmwf_ifs025: 5, gfs_seamless: 6 },
      { icon_eu: 315 },
      { icon_eu: 10 },
    );
    expect(out.windSpeed).toBe(8);
    expect(out.windDirection).toBe(315);
    expect(out.windGust).toBeGreaterThanOrEqual(10);
    expect(out.method).toBe('icon_eu_floor');
    expect(out.blended).toBe(true);
  });

  it('falls back to median floor without ICON-EU', () => {
    const out = blendWindAtIndex(
      3,
      180,
      4,
      { ecmwf_ifs025: 5, gfs_seamless: 7, meteofrance_arpege_europe: 6 },
      {},
      {},
    );
    expect(out.method).toBe('median_floor');
    expect(out.windSpeed).toBe(6);
    expect(out.blended).toBe(true);
  });
});

describe('applyWindBlendToHours', () => {
  it('blends hourly series in place', () => {
    const hours = [
      { windSpeed: 2, windDirection: 270, windGust: 3 },
      { windSpeed: 2, windDirection: 270, windGust: 3 },
    ];
    const hourly = {
      time: ['2026-07-21T12:00', '2026-07-21T13:00'],
      wind_speed_10m_icon_eu: [5, 6],
      wind_direction_10m_icon_eu: [300, 310],
      wind_gusts_10m_icon_eu: [7, 8],
    };
    const { blendedHours, method } = applyWindBlendToHours(hours, hourly, [
      'icon_eu',
    ]);
    expect(method).toBe('icon_eu_floor');
    expect(blendedHours).toBe(2);
    expect(hours[0].windSpeed).toBe(5);
    expect(hours[1].windSpeed).toBe(6);
  });
});
