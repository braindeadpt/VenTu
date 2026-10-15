import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  loadSpotIsobaths,
  isobathDistancesForSpot,
  clearSpotIsobathsCache,
  ISOBATH_DEPTHS,
  type IsobathsFile,
} from '@/lib/spotIsobaths';

afterEach(() => {
  clearSpotIsobathsCache();
  vi.unstubAllGlobals();
});

const file = (overrides: Partial<IsobathsFile> = {}): IsobathsFile => ({
  spots: { nazare: { 8: 0.25, 16: 0.31, 30: 0.46 } },
  fetchedAt: '2026-08-15T08:00:00Z',
  sourceCollection: 'depcnt_8_16_30',
  depths: [8, 16, 30],
  ...overrides,
});

describe('loadSpotIsobaths', () => {
  it('fetcha spot-isobaths.json uma vez e cacheia por sessão', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(file()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const a = await loadSpotIsobaths(fetchMock as typeof fetch);
    const b = await loadSpotIsobaths(fetchMock as typeof fetch);
    expect(a?.spots?.nazare?.[8]).toBe(0.25);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404/erro → null (a UI esconde o strip, nunca quebra)', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await loadSpotIsobaths(fetchMock as typeof fetch);
    expect(out).toBeNull();
  });

  it('falha de rede → null', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadSpotIsobaths(fetchMock as typeof fetch)).toBeNull();
  });
});

describe('isobathDistancesForSpot / ISOBATH_DEPTHS', () => {
  it('devolve as distâncias por spot ou null', () => {
    expect(isobathDistancesForSpot(file(), 'nazare')).toEqual({ 8: 0.25, 16: 0.31, 30: 0.46 });
    expect(isobathDistancesForSpot(file(), 'guincho')).toBeNull();
    expect(isobathDistancesForSpot(null, 'nazare')).toBeNull();
  });

  it('ordem de exibição: 8 → 16 → 30', () => {
    expect(ISOBATH_DEPTHS).toEqual([8, 16, 30]);
  });
});
