import { describe, expect, it } from 'vitest';
import {
  normalizeWorkerObserved,
  parseWorkerObservedResponse,
} from '@/lib/observationsWorker';

describe('parseWorkerObservedResponse', () => {
  it('parses valid worker payload', () => {
    const raw = parseWorkerObservedResponse({
      observed: {
        windSpeedKt: 12,
        windDirDeg: 270,
        windCardinal: 'W',
        tempC: 18.2,
        stationName: 'Foz do Porto',
        distanceKm: 3.3,
        observedAt: '2026-05-27T14:00:00.000Z',
        source: 'ecowitt',
      },
    });
    expect(raw?.source).toBe('ecowitt');
    const norm = normalizeWorkerObserved(raw!);
    expect(norm.windSpeedKt).toBe(12);
    expect(norm.windCardinal).toBe('W');
  });

  it('returns null when observed missing', () => {
    expect(parseWorkerObservedResponse({ observed: null })).toBeNull();
    expect(parseWorkerObservedResponse({})).toBeNull();
  });

  it('parses METAR worker payload', () => {
    const raw = parseWorkerObservedResponse({
      observed: {
        windSpeedKt: 11,
        windDirDeg: 280,
        windCardinal: 'W',
        tempC: 20,
        stationName: 'Lisboa (METAR)',
        distanceKm: 17.2,
        observedAt: new Date().toISOString(),
        source: 'metar',
      },
    });
    expect(raw?.source).toBe('metar');
    expect(normalizeWorkerObserved(raw!).source).toBe('metar');
  });
});
