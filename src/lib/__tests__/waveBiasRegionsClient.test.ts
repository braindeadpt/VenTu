import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  loadWaveBiasRegions,
  clearWaveBiasRegionsCache,
} from '../waveBias';

/**
 * loadWaveBiasRegions é o loader client-side (fetch + session cache) usado
 * pelo fallback do viés regional no spot page e no refresh do mapa/grid.
 * Aceita `fetchImpl` (test seam) — mockamos o fetch e verificamos o cache
 * module-level com clearWaveBiasRegionsCache() entre testes.
 */

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function okFetch(body: unknown): FetchLike & { mock: ReturnType<typeof vi.fn>['mock'] } {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  }) as unknown as FetchLike & { mock: ReturnType<typeof vi.fn>['mock'] };
}

function statusFetch(status: number): FetchLike & { mock: ReturnType<typeof vi.fn>['mock'] } {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
  }) as unknown as FetchLike & { mock: ReturnType<typeof vi.fn>['mock'] };
}

function throwFetch(): FetchLike & { mock: ReturnType<typeof vi.fn>['mock'] } {
  return vi.fn().mockRejectedValue(new Error('network down')) as unknown as FetchLike & {
    mock: ReturnType<typeof vi.fn>['mock'];
  };
}

function fetchCalls(f: FetchLike & { mock: ReturnType<typeof vi.fn>['mock'] }): number {
  return f.mock.calls.length;
}

describe('loadWaveBiasRegions (client — fetch mockado)', () => {
  beforeEach(() => {
    clearWaveBiasRegionsCache();
  });

  it('200 com regiões → devolve as regions (shape do fallback)', async () => {
    const fetchImpl = okFetch({
      fetchedAt: '2026-08-15T06:00:00.000Z',
      regions: {
        Cascais: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 },
        Porto: { n: 86, me: 0.4, mae: 0.5, rmse: 0.6 },
      },
    });

    const file = await loadWaveBiasRegions(fetchImpl);
    expect(file?.regions?.Cascais).toMatchObject({ n: 120, me: 0.3 });
    expect(file?.regions?.Porto).toMatchObject({ n: 86, me: 0.4 });
    expect(fetchCalls(fetchImpl)).toBe(1);
  });

  it('200 sem regions (objecto vazio) → objecto cru; o gate do fallback desliga', async () => {
    // O loader devolve o objecto cru — o gate de `regions` ausentes vive no
    // applyRegionalBiasFallback (resolveRegionBias devolve null sem `regions`).
    const file = await loadWaveBiasRegions(okFetch({ fetchedAt: null }));
    expect(file).toEqual({ fetchedAt: null });
    expect(file?.regions).toBeUndefined();
  });

  it('404 → null (ficheiro opcional nunca rebenta o client)', async () => {
    const fetchImpl = statusFetch(404);
    expect(await loadWaveBiasRegions(fetchImpl)).toBeNull();
    expect(fetchCalls(fetchImpl)).toBe(1);
  });

  it('JSON corrompido → null (catch interno, nunca lança)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token }');
      },
    });
    expect(await loadWaveBiasRegions(fetchImpl)).toBeNull();
  });

  it('rede em baixo (fetch rejeitado) → null, nunca lança', async () => {
    expect(await loadWaveBiasRegions(throwFetch())).toBeNull();
  });

  it('cache de sessão: segunda chamada não refaz o fetch', async () => {
    const fetchImpl = okFetch({ regions: { Cascais: { n: 120, me: 0.3 } } });

    const first = await loadWaveBiasRegions(fetchImpl);
    const second = await loadWaveBiasRegions(fetchImpl);
    expect(first).toBe(second); // mesma referência do cache
    expect(fetchCalls(fetchImpl)).toBe(1);
  });

  it('clearWaveBiasRegionsCache entre testes → fetch volta a correr', async () => {
    const fetchImpl = okFetch({ regions: { Cascais: { n: 120, me: 0.3 } } });

    await loadWaveBiasRegions(fetchImpl);
    expect(fetchCalls(fetchImpl)).toBe(1);

    // Sem o clear, a cache de sessão devolveria o resultado antigo.
    clearWaveBiasRegionsCache();
    await loadWaveBiasRegions(fetchImpl);
    expect(fetchCalls(fetchImpl)).toBe(2);
  });
});
