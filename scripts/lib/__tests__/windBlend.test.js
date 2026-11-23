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
  it('blends 65/35 without positive bias when ICON-EU is weaker than best_match (dir diff <= 60°)', () => {
    const out = blendWindAtIndex(
      5,
      270,
      7,
      { icon_eu: 3, ecmwf_ifs025: 4, gfs_seamless: 3.5 },
      { icon_eu: 280 },
      { icon_eu: 5 },
    );
    // 0.65 * 3 + 0.35 * 5 = 3.7 (nunca prende no piso 5)
    expect(out.windSpeed).toBe(3.7);
    expect(out.windGust).toBe(5.7);
    expect(out.method).toBe('icon_eu_vector');
    expect(out.blended).toBe(true);
  });

  it('blends speed, gust and direction coherently when ICON-EU is stronger (dir diff <= 60°)', () => {
    const out = blendWindAtIndex(
      4,
      270,
      6,
      { icon_eu: 8, ecmwf_ifs025: 5, gfs_seamless: 6 },
      { icon_eu: 315 },
      { icon_eu: 10 },
    );
    expect(out.windSpeed).toBe(6.6);
    expect(out.windDirection).toBeGreaterThan(292.5);
    expect(out.windDirection).toBeLessThan(315);
    expect(out.windGust).toBe(8.6);
    expect(out.method).toBe('icon_eu_vector');
    expect(out.blended).toBe(true);
  });

  it('keeps full ICON-EU vector when directions diverge > 60° (preserves strong gusts and relative excess)', () => {
    // 12 m/s médio e 18 m/s rajada (tempestade) em direções a 90°: não cancela vento
    // nem subestima a rajada absoluta de segurança nem inflaciona o excesso relativo.
    const out = blendWindAtIndex(12, 270, 18, { icon_eu: 12 }, { icon_eu: 360 }, { icon_eu: 18 });
    expect(out.windSpeed).toBe(12);
    expect(out.windDirection).toBe(0);
    expect(out.windGust).toBe(18);
    expect(out.windGust - out.windSpeed).toBe(6);
  });

  it('keeps full ICON-EU vector when models oppose by 180° (no artificial cancellation)', () => {
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
    expect(out.windSpeed).toBe(7);
    expect(out.windDirection).toBe(90);
    expect(out.windGust).toBe(10);
  });

  it('does not discard base wind when ICON-EU is calm (0 m/s) with an arbitrary opposite direction', () => {
    const out = blendWindAtIndex(10, 270, 14, { icon_eu: 0 }, { icon_eu: 90 }, { icon_eu: 0 });
    expect(out.windSpeed).toBe(3.5);
    expect(out.windDirection).toBe(270);
    expect(out.windGust).toBe(4.9);
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
    expect(hours[0].windSpeed).toBe(3.95);
    expect(hours[1].windSpeed).toBe(4.6);
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
    // 13:00 casa com icon_eu=6 @ 300° (0.65*6 + 0.35*4 = 5.3), não com 12:00 (icon_eu=20 @ 180°)
    expect(hours[0].windSpeed).toBe(5.3);
    // 14:00 casa com icon_eu=8 @ 310° (0.65*8 + 0.35*4 = 6.6)
    expect(hours[1].windSpeed).toBe(6.6);
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
    expect(hours[1].windSpeed).toBe(5.3);
  });
});
