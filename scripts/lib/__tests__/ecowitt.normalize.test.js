import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildEcowittObservedForSpot } = require('../ecowitt.js');

describe('buildEcowittObservedForSpot', () => {
  const snapshot = {
    stationName: 'TAP Teste 3',
    lat: 41.15703,
    lon: -8.681834,
    windSpeedMs: 5,
    windDirDeg: 270,
    windCardinal: 'W',
    windCardinalEn: 'W',
    tempC: 18.2,
    observedAt: new Date().toISOString(),
  };

  it('returns ecowitt payload within 30 km', () => {
    const spot = { id: 'matosinhos', lat: 41.18, lon: -8.69 };
    const out = buildEcowittObservedForSpot(spot, snapshot);
    expect(out?.source).toBe('ecowitt');
    expect(out?.windSpeedKt).toBe(Math.round(5 * 1.94384));
    expect(out?.distanceKm).toBeLessThanOrEqual(30);
  });

  it('returns null beyond 30 km', () => {
    const spot = { id: 'sagres', lat: 37.0, lon: -8.95 };
    expect(buildEcowittObservedForSpot(spot, snapshot)).toBeNull();
  });
});
