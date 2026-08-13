import { describe, expect, it } from 'vitest';
import { HERO_FORECAST_LAYERS, getHeroFreshnessTitle } from '../heroDataProvenance';

describe('hero tide provenance', () => {
  it('attributes forecast tides to Open-Meteo, not IH gauges', () => {
    const tides = HERO_FORECAST_LAYERS.find((l) => l.key === 'tides');
    expect(tides?.sourcePt).toBe('Open-Meteo');
    expect(tides?.sourceEn).toBe('Open-Meteo');
  });

  it('does not claim live IH tides in the freshness title', () => {
    const title = getHeroFreshnessTitle('pt', Date.parse('2026-08-13T22:00:00Z'));
    expect(title).not.toMatch(/Marés via IH/);
    expect(title).toMatch(/Open-Meteo/);
  });
});
