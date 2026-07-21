import { describe, expect, it } from 'vitest';
import { pickBestObservation } from '@/lib/observationPick';
import type { ObservedConditions } from '@/lib/observations';

function obs(
  partial: Partial<ObservedConditions> & Pick<ObservedConditions, 'source' | 'distanceKm'>,
): ObservedConditions {
  const now = new Date();
  return {
    windSpeedKt: 10,
    windDirDeg: 90,
    windCardinal: 'E',
    stationName: partial.source === 'ecowitt' ? 'Ecowitt PWS' : 'IPMA',
    observedAt: now.toISOString(),
    ...partial,
  };
}

describe('pickBestObservation', () => {
  it('prefers closer station', () => {
    const ipma = obs({ source: 'ipma', distanceKm: 25 });
    const eco = obs({ source: 'ecowitt', distanceKm: 5 });
    expect(pickBestObservation(ipma, eco)?.source).toBe('ecowitt');
  });

  it('at equal distance prefers fresher reading', () => {
    const older = obs({
      source: 'ipma',
      distanceKm: 8,
      observedAt: new Date(Date.now() - 2.5 * 3_600_000).toISOString(),
    });
    const newer = obs({
      source: 'ecowitt',
      distanceKm: 8,
      observedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    });
    expect(pickBestObservation(older, newer)?.source).toBe('ecowitt');
  });

  it('within 8 km prefers IPMA over slightly closer METAR', () => {
    const ipma = obs({ source: 'ipma', distanceKm: 12 });
    const metar = obs({
      source: 'metar',
      distanceKm: 10,
      stationName: 'Lisboa (METAR)',
    });
    expect(pickBestObservation(ipma, metar)?.source).toBe('ipma');
  });

  it('uses METAR when clearly closer than IPMA', () => {
    const ipma = obs({ source: 'ipma', distanceKm: 28 });
    const metar = obs({
      source: 'metar',
      distanceKm: 8,
      stationName: 'Faro (METAR)',
    });
    expect(pickBestObservation(ipma, metar)?.source).toBe('metar');
  });

  it('rejects observations beyond 30 km or stale', () => {
    const far = obs({ source: 'ecowitt', distanceKm: 35 });
    const stale = obs({
      source: 'ipma',
      distanceKm: 5,
      observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    });
    expect(pickBestObservation(far, stale)).toBeNull();
  });
});
