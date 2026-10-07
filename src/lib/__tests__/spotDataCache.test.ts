import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONDITIONS_FRESH_TTL_MS,
  clearSpotDataCacheForTests,
  loadConditionsJson,
  loadForecastsJson,
} from '@/lib/spotDataCache';

describe('spotDataCache', () => {
  afterEach(() => {
    clearSpotDataCacheForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('force: consumidores simultâneos da home partilham UM download (era 3–4×)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ a: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    // Hero + A bombar + ranking + favoritos a montar ao mesmo tempo.
    const results = await Promise.all([
      loadConditionsJson({ force: true }),
      loadConditionsJson({ force: true }),
      loadConditionsJson({ force: true }),
      loadConditionsJson(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
    // Revalidação por ETag, nunca no-store.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' });
  });

  it('force dentro do TTL reutiliza a cache; depois do TTL revalida', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T08:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ a: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    await loadConditionsJson({ force: true });
    // Hero com refresh deferido (4 s) chega depois dos outros: sem rede.
    vi.setSystemTime(Date.now() + 4_000);
    await loadConditionsJson({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + CONDITIONS_FRESH_TTL_MS);
    await loadConditionsJson({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('um erro não fica preso no inflight — o pedido seguinte volta a tentar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadConditionsJson({ force: true })).rejects.toThrow();
    await expect(loadConditionsJson({ force: true })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
