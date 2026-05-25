import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  detectForecastEvents,
  detectSnapshotEvents,
  waveHeightAt,
} = require('../../../scripts/news/detect-events.js');
const { inferCategoryFromText } = require('../../../scripts/news/category-keywords.js');

describe('detectForecastEvents', () => {
  it('detects 72h swell window from hourly forecast', () => {
    const future = new Date(Date.now() + 6 * 3600000).toISOString();
    const forecasts = {
      nazare: {
        hourly: [
          { time: future, waveHeight: 3.5, swellHeight: 4, windSpeed: 5 },
        ],
      },
      peniche: {
        hourly: [
          { time: future, waveHeight: 3.2, swellHeight: 3, windSpeed: 4 },
        ],
      },
    };
    const events = detectForecastEvents(forecasts);
    expect(events.some((e: { tags: string[] }) => e.tags.includes('forecast-72h'))).toBe(true);
  });

  it('returns empty for missing forecasts', () => {
    expect(detectForecastEvents({})).toEqual([]);
  });
});

describe('detectSnapshotEvents', () => {
  it('detects current big swell', () => {
    const events = detectSnapshotEvents({
      nazare: { waveHeight: 4, windSpeed: 5, waterTemp: 18 },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].tags).toContain('agora');
  });
});

describe('waveHeightAt', () => {
  it('uses max of wave and swell', () => {
    expect(waveHeightAt({ waveHeight: 1, swellHeight: 3 })).toBe(3);
  });
});

describe('category keywords', () => {
  it('infers wakeboard from title', () => {
    expect(inferCategoryFromText('Cable park session in Alqueva', 'general')).toBe('wakeboard');
  });

  it('infers bodyboard from title', () => {
    expect(inferCategoryFromText('APB bodyboard tour in Praia do Norte', 'general')).toBe('bodyboard');
  });

  it('infers sup from paddle keywords', () => {
    expect(inferCategoryFromText('Stand up paddle race on Alqueva lake', 'general')).toBe('sup');
  });

  it('infers foil from kitefoiling', () => {
    expect(inferCategoryFromText('Warning: Kitefoiling is addictive', 'kitesurf')).toBe('foil');
  });

  it('keeps default when no match', () => {
    expect(inferCategoryFromText('Random headline', 'surf')).toBe('surf');
  });
});
