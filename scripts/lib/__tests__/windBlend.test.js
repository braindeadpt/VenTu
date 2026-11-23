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
  it('blends vectorially without positive bias when ICON-EU is weaker than best_match', () => {
    const out = blendWindAtIndex(
      5,
      270,
      7,
      { icon_eu: 3, ecmwf_ifs025: 4, gfs_seamless: 3.5 },
      { icon_eu: 280 },
      { icon_eu: 5 },
    );
    // |0.65*(3 @ 280°) + 0.35*(5 @ 270°)| ≈ 3.686 m/s (vetorial, não escalar 3.7)
    expect(out.windSpeed).toBeCloseTo(3.686, 3);
    expect(out.method).toBe('icon_eu_vector');
    expect(out.blended).toBe(true);
  });

  it('blends speed and direction vectorially when ICON-EU is stronger than best_match', () => {
    const out = blendWindAtIndex(
      4,
      270,
      6,
      { icon_eu: 8, ecmwf_ifs025: 5, gfs_seamless: 6 },
      { icon_eu: 315 },
      { icon_eu: 10 },
    );
    // |0.65*(8 @ 315°) + 0.35*(4 @ 270°)| = hypot(5.2*sin45 + 1.4, 5.2*cos45) ≈ 6.269 m/s
    expect(out.windSpeed).toBeCloseTo(6.269, 3);
    expect(out.windDirection).toBeGreaterThan(292.5);
    expect(out.windDirection).toBeLessThan(315);
    expect(out.windGust).toBe(8.6);
    expect(out.method).toBe('icon_eu_vector');
    expect(out.blended).toBe(true);
  });

  it('cancels opposing wind vectors instead of returning scalar mean speed', () => {
    // 14 m/s W (270°) vs 7 m/s E (90°): 0.35*14 - 0.65*7 = 4.9 - 4.55 = 0.35 m/s (nunca 9.45 m/s)
    const out = blendWindAtIndex(
      14,
      270,
      18,
      { icon_eu: 7 },
      { icon_eu: 90 },
      { icon_eu: 10 },
    );
    expect(out.method).toBe('icon_eu_vector');
    expect(out.blended).toBe(true);
    expect(out.windSpeed).toBeCloseTo(0.35, 3);
    expect(out.windSpeed).toBeLessThan(1);
    expect(out.windDirection).toBe(270);
  });

  it('falls back to median_vector without ICON-EU (e.g. Açores) using median speed and median gust', () => {
    const out = blendWindAtIndex(
      3,
      180,
      4,
      { ecmwf_ifs025: 5, gfs_seamless: 7, meteofrance_arpege_europe: 6 },
      { ecmwf_ifs025: 190, gfs_seamless: 200, meteofrance_arpege_europe: 195 },
      { ecmwf_ifs025: 7, gfs_seamless: 18, meteofrance_arpege_europe: 8 },
    );
    expect(out.method).toBe('median_vector');
    // Mediana de [3, 5, 6, 7] = 5.5
    expect(out.windSpeed).toBe(5.5);
    // Rajada pela mediana de [4, 7, 8, 18] = 7.5 (nunca Math.max = 18)
    expect(out.windGust).toBe(7.5);
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
    expect(method).toBe('icon_eu_vector');
    expect(blendedHours).toBe(2);
    // |0.65*(5 @ 300°) + 0.35*(2 @ 270°)| ≈ 3.872; |0.65*(6 @ 310°) + 0.35*(2 @ 270°)| ≈ 4.459
    expect(hours[0].windSpeed).toBeCloseTo(3.872, 3);
    expect(hours[1].windSpeed).toBeCloseTo(4.459, 3);
  });

  it('aligns by timestamp when windModelsHourly.time is shifted by 1 hour relative to hours', () => {
    const hours = [
      { time: '2026-07-21T13:00', windSpeed: 4, windDirection: 270, windGust: 6 },
      { time: '2026-07-21T14:00', windSpeed: 4, windDirection: 270, windGust: 6 },
    ];
    const hourly = {
      time: ['2026-07-21T12:00', '2026-07-21T13:00', '2026-07-21T14:00'],
      wind_speed_10m_icon_eu: [20, 6, 8],
      wind_direction_10m_icon_eu: [180, 300, 310],
      wind_gusts_10m_icon_eu: [25, 8, 10],
    };
    const { blendedHours, method } = applyWindBlendToHours(hours, hourly, ['icon_eu']);
    expect(method).toBe('icon_eu_vector');
    expect(blendedHours).toBe(2);
    // 13:00 casa com icon_eu=6 @ 300° (vetorial ≈ 5.16), não com 12:00 (icon_eu=20 @ 180°)
    expect(hours[0].windSpeed).toBeCloseTo(5.16, 3);
    // 14:00 casa com icon_eu=8 @ 310° (vetorial ≈ 6.337)
    expect(hours[1].windSpeed).toBeCloseTo(6.337, 3);
  });

  it('preserves null windSpeed without turning it into 0', () => {
    const hours = [
      { time: '2026-07-21T12:00', windSpeed: null, windDirection: null, windGust: null },
      { time: '2026-07-21T13:00', windSpeed: 4, windDirection: 270, windGust: 6 },
    ];
    const hourly = {
      time: ['2026-07-21T12:00', '2026-07-21T13:00'],
      wind_speed_10m_icon_eu: [8, 6],
      wind_direction_10m_icon_eu: [315, 300],
      wind_gusts_10m_icon_eu: [10, 8],
    };
    const { blendedHours, method } = applyWindBlendToHours(hours, hourly, ['icon_eu']);
    expect(method).toBe('icon_eu_vector');
    expect(blendedHours).toBe(1);
    expect(hours[0].windSpeed).toBeNull();
    expect(hours[0].windDirection).toBeNull();
    expect(hours[0].windGust).toBeNull();
    expect(hours[1].windSpeed).toBeCloseTo(5.16, 3);
  });
});
