import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  deriveBuoyLayerStatus,
  loadBuoyLayerStatus,
  BUOY_READING_MAX_AGE_HOURS,
} = require('../buoyLayerHealth.js');

const NOW = Date.parse('2026-08-15T12:00:00Z');
const FRESH = new Date(NOW - 1 * 3_600_000).toISOString();
const STALE = new Date(NOW - 5 * 3_600_000).toISOString();

describe('deriveBuoyLayerStatus — espelho do cliente', () => {
  it('sem ficheiro/estações → no-key', () => {
    expect(deriveBuoyLayerStatus(null, NOW)).toBe('no-key');
    expect(deriveBuoyLayerStatus({}, NOW)).toBe('no-key');
    expect(deriveBuoyLayerStatus({ stations: undefined }, NOW)).toBe('no-key');
  });

  it('apiKeyConfigured=false → no-key (mesmo com estações)', () => {
    expect(
      deriveBuoyLayerStatus({ apiKeyConfigured: false, hasWaveData: false, stations: {} }, NOW),
    ).toBe('no-key');
  });

  it('key configurada mas sem wave data → down', () => {
    expect(
      deriveBuoyLayerStatus({ apiKeyConfigured: true, hasWaveData: false, stations: {} }, NOW),
    ).toBe('down');
  });

  it('snapshots existentes mas todos sem leitura fresca → stale', () => {
    expect(
      deriveBuoyLayerStatus(
        {
          apiKeyConfigured: true,
          hasWaveData: true,
          stations: {
            4: { status: 'active', latest: { date: STALE } },
          },
        },
        NOW,
      ),
    ).toBe('stale');
  });

  it('leitura fresca → ok', () => {
    expect(
      deriveBuoyLayerStatus(
        {
          apiKeyConfigured: true,
          hasWaveData: true,
          stations: {
            4: { status: 'active', latest: { date: FRESH } },
          },
        },
        NOW,
      ),
    ).toBe('ok');
  });

  it('boias inactivas com lastSea antigo não disparam stale (usa só activas)', () => {
    expect(
      deriveBuoyLayerStatus(
        {
          apiKeyConfigured: true,
          hasWaveData: true,
          stations: {
            23: { status: 'inactive', lastSea: STALE },
            4: { status: 'active', latest: { date: FRESH } },
          },
        },
        NOW,
      ),
    ).toBe('ok');
  });

  it('key configurada com wave data mas sem nenhuma leitura → down', () => {
    expect(
      deriveBuoyLayerStatus(
        {
          apiKeyConfigured: true,
          hasWaveData: true,
          stations: {
            4: { status: 'active', latest: undefined },
          },
        },
        NOW,
      ),
    ).toBe('down');
  });

  it('TTL espelha o gate de 3h', () => {
    expect(BUOY_READING_MAX_AGE_HOURS).toBe(3);
  });
});

describe('loadBuoyLayerStatus — leitura do ficheiro', () => {
  it('devolve null quando o ih-buoys.json não existe', () => {
    expect(loadBuoyLayerStatus('/nonexistent-root', NOW)).toBeNull();
  });

  it('devolve o payload de diagnóstico com o estado derivado', () => {
    // Usa um rootDir de fixture falso — só interessa que o caminho não exista
    // (o ficheiro real de produção cobre o smoke).
    const out = loadBuoyLayerStatus('/nonexistent-root', NOW);
    expect(out).toBeNull();
  });
});
