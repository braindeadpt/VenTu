import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  deriveBuoyLayerStatus,
  deriveWmoLayerStatus,
  combineBuoyLayerHealth,
  loadBuoyLayerHealth,
  clearBuoyLayerHealthCache,
  BUOY_READING_MAX_AGE_HOURS,
  WMO_READING_MAX_AGE_HOURS,
  type IhBuoysFile,
  type WmoBuoysFile,
} from '@/lib/buoyLayerHealth';

const NOW = Date.parse('2026-08-14T14:00:00Z');

afterEach(() => {
  clearBuoyLayerHealthCache();
  vi.unstubAllGlobals();
});

function file(overrides: Partial<IhBuoysFile> = {}): IhBuoysFile {
  return {
    stations: {},
    fetchedAt: new Date(NOW).toISOString(),
    apiKeyConfigured: true,
    hasWaveData: true,
    ...overrides,
  };
}

function wmoFile(overrides: Partial<WmoBuoysFile> = {}): WmoBuoysFile {
  return {
    buoys: {},
    fetchedAt: new Date(NOW).toISOString(),
    hasWaveData: true,
    ...overrides,
  };
}

const freshStation = {
  status: 'active',
  lastSea: new Date(NOW - 30 * 60 * 1000).toISOString(), // 30 min
  latest: { date: new Date(NOW - 30 * 60 * 1000).toISOString() },
};

const oldStation = {
  status: 'active',
  lastSea: new Date(NOW - 5 * 3_600_000).toISOString(), // 5 h
  latest: { date: new Date(NOW - 5 * 3_600_000).toISOString() },
};

const inactiveOld = {
  status: 'inactive',
  lastSea: new Date(NOW - 30 * 24 * 3_600_000).toISOString(), // 30 days
};

const freshWmo = { latest: { date: new Date(NOW - 2 * 3_600_000).toISOString() } }; // 2 h
const staleWmo = { latest: { date: new Date(NOW - 12 * 3_600_000).toISOString() } }; // 12 h

describe('deriveBuoyLayerStatus', () => {
  it('sem ficheiro ou sem estações → no-key (conservador)', () => {
    expect(deriveBuoyLayerStatus(null, NOW)).toBe('no-key');
    expect(deriveBuoyLayerStatus(undefined, NOW)).toBe('no-key');
    expect(deriveBuoyLayerStatus({}, NOW)).toBe('no-key');
  });

  it('apiKeyConfigured=false → no-key, mesmo com dados', () => {
    expect(
      deriveBuoyLayerStatus(file({ apiKeyConfigured: false, hasWaveData: false }), NOW),
    ).toBe('no-key');
  });

  it('key configurada mas sem snapshots → down (IH em baixo)', () => {
    expect(deriveBuoyLayerStatus(file({ hasWaveData: false }), NOW)).toBe('down');
  });

  it('hasWaveData=true mas nenhuma leitura fresca → stale', () => {
    const f = file({ stations: { a: oldStation, b: inactiveOld } });
    expect(deriveBuoyLayerStatus(f, NOW)).toBe('stale');
  });

  it('leitura fresca → ok', () => {
    const f = file({ stations: { a: freshStation, b: inactiveOld } });
    expect(deriveBuoyLayerStatus(f, NOW)).toBe('ok');
  });

  it('ignora estações inactivas na frescura (não acusam stale)', () => {
    const f = file({ stations: { onlyOld: inactiveOld } });
    expect(deriveBuoyLayerStatus(f, NOW)).toBe('down');
  });
});

describe('deriveWmoLayerStatus (fallback Copernicus)', () => {
  it('sem ficheiro, sem buoys ou sem wave data → down', () => {
    expect(deriveWmoLayerStatus(null, NOW)).toBe('down');
    expect(deriveWmoLayerStatus({}, NOW)).toBe('down');
    expect(deriveWmoLayerStatus(wmoFile({ hasWaveData: false }), NOW)).toBe('down');
  });

  it('leitura fresca (≤6h) → ok', () => {
    expect(deriveWmoLayerStatus(wmoFile({ buoys: { a: freshWmo } }), NOW)).toBe('ok');
  });

  it('leituras todas antigas (>6h) → stale', () => {
    expect(deriveWmoLayerStatus(wmoFile({ buoys: { a: staleWmo } }), NOW)).toBe('stale');
  });

  it('sem leituras nenhumas → down', () => {
    expect(deriveWmoLayerStatus(wmoFile({ buoys: { a: { latest: undefined } } }), NOW)).toBe('down');
  });

  it('WMO_READING_MAX_AGE_HOURS = 6 (gate mais largo que o IH)', () => {
    expect(WMO_READING_MAX_AGE_HOURS).toBe(6);
  });
});

describe('combineBuoyLayerHealth', () => {
  it('IH ok → camada saudável, sem aviso (status null)', () => {
    expect(combineBuoyLayerHealth('ok', 'down')).toEqual({ status: null, wmo: 'down' });
  });

  it('IH não-ok mas WMO ok → o fallback cobre → sem aviso', () => {
    expect(combineBuoyLayerHealth('no-key', 'ok')).toEqual({ status: null, wmo: 'ok' });
    expect(combineBuoyLayerHealth('down', 'ok')).toEqual({ status: null, wmo: 'ok' });
    expect(combineBuoyLayerHealth('stale', 'ok')).toEqual({ status: null, wmo: 'ok' });
  });

  it('IH e WMO ambos sem dados → aviso com o estado IH + WMO para a nota', () => {
    expect(combineBuoyLayerHealth('no-key', 'down')).toEqual({ status: 'no-key', wmo: 'down' });
    expect(combineBuoyLayerHealth('down', 'down')).toEqual({ status: 'down', wmo: 'down' });
    expect(combineBuoyLayerHealth('stale', 'stale')).toEqual({ status: 'stale', wmo: 'stale' });
  });
});

describe('loadBuoyLayerHealth', () => {
  it('fetcha ih-buoys.json + wmo-buoys.json e combina (nenhuma fonte fresca → aviso)', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('ih-buoys.json')) {
        return new Response(
          JSON.stringify(file({ apiKeyConfigured: false, hasWaveData: false })),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      // wmo-buoys.json — também sem dados
      return new Response(
        JSON.stringify(wmoFile({ hasWaveData: false })),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const health = await loadBuoyLayerHealth(fetchMock as typeof fetch, NOW);
    expect(health.status).toBe('no-key');
    expect(health.wmo).toBe('down');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('IH sem key mas WMO fresco → camada saudável (status null)', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('ih-buoys.json')) {
        return new Response(
          JSON.stringify(file({ apiKeyConfigured: false, hasWaveData: false })),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify(wmoFile({ buoys: { a: freshWmo } })),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const health = await loadBuoyLayerHealth(fetchMock as typeof fetch, NOW);
    expect(health.status).toBeNull();
    expect(health.wmo).toBe('ok');
  });

  it('falha de rede → no-key + wmo down (nunca rebenta)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    const health = await loadBuoyLayerHealth(fetchMock as typeof fetch, NOW);
    expect(health.status).toBe('no-key');
    expect(health.wmo).toBe('down');
  });

  it('cacheia: segunda chamada não refaz o fetch', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('ih-buoys.json')) {
        return new Response(JSON.stringify(file({ hasWaveData: false })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(wmoFile({ hasWaveData: false })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const a = await loadBuoyLayerHealth(fetchMock as typeof fetch, NOW);
    const b = await loadBuoyLayerHealth(fetchMock as typeof fetch, NOW);
    expect(a.status).toBe('down');
    expect(b.status).toBe('down');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('BUOY_READING_MAX_AGE_HOURS = 3 (espelha a camada de dados)', () => {
    expect(BUOY_READING_MAX_AGE_HOURS).toBe(3);
  });
});
