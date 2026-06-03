import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSpotDataCacheForTests,
  loadConditionsJson,
  loadForecastsJson,
} from '@/lib/spotDataCache';

describe('spotDataCache', () => {
  afterEach(() => {
    clearSpotDataCacheForTests();
    vi.unstubAllGlobals();
  });

  it('reuses the same in-flight promise for parallel loads', async () => {
    const payload = { spot1: { waveHeight: 1 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([loadConditionsJson(), loadConditionsJson()]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads forecasts and conditions independently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const body = String(url).includes('forecasts') ? { fc: true } : { cond: true };
      return Promise.resolve({ ok: true, json: async () => body });
    }));

    const cond = await loadConditionsJson();
    const fc = await loadForecastsJson();
    expect(cond).toEqual({ cond: true });
    expect(fc).toEqual({ fc: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
