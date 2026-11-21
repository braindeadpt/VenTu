import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ecowittObserved } from './index';

const ENV = {
  ECOWITT_APPLICATION_KEY: 'app',
  ECOWITT_API_KEY: 'key',
  ECOWITT_MAC: 'aa:bb',
  ECOWITT_LAT: '39.0',
  ECOWITT_LON: '-9.0',
  ECOWITT_NAME: 'test-station',
  ALLOWED_ORIGINS: '*',
} as unknown as Env;

const CTX = { waitUntil: () => {} } as unknown as ExecutionContext;

function ecowittPayload(windSpeed: unknown) {
  return {
    code: 0,
    time: Math.floor(Date.now() / 1000),
    data: {
      wind: {
        wind_speed: { value: windSpeed },
        wind_direction: { value: '180' },
      },
      outdoor: { temperature: { value: '18.5' } },
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('caches', {
    default: { match: async () => undefined, put: async () => undefined },
  });
});

function stubFetch(payload: unknown) {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    text: async () => JSON.stringify(payload),
  }));
}

describe('ecowittObserved', () => {
  it('returns an observation for a valid wind speed', async () => {
    stubFetch(ecowittPayload('5.0'));
    const obs = await ecowittObserved(39.0, -9.0, ENV, CTX);
    expect(obs).not.toBeNull();
    // 5 m/s ≈ 9.7 kt
    expect(obs!.windSpeedKt).toBe(10);
    expect(obs!.windDirDeg).toBe(180);
    expect(obs!.source).toBe('ecowitt');
  });

  it.each(['abc', '', undefined, null])('rejects a non-numeric wind speed (%s)', async (ws) => {
    stubFetch(ecowittPayload(ws));
    expect(await ecowittObserved(39.0, -9.0, ENV, CTX)).toBeNull();
  });

  it('keeps windDirDeg null when direction is not parseable', async () => {
    stubFetch({
      code: 0,
      time: Math.floor(Date.now() / 1000),
      data: {
        wind: { wind_speed: { value: '5.0' }, wind_direction: { value: 'x' } },
      },
    });
    const obs = await ecowittObserved(39.0, -9.0, ENV, CTX);
    expect(obs).not.toBeNull();
    expect(obs!.windDirDeg).toBeNull();
    expect(obs!.windCardinal).toBeNull();
  });
});
