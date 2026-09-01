import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  deriveBuoyLayerStatus,
  deriveFugroState,
  loadBuoyLayerStatus,
  applyBuoyLayerStreak,
  BUOY_READING_MAX_AGE_HOURS,
  FUGRO_NAZARE_KEY,
  FUGRO_FAMILY,
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

describe('applyBuoyLayerStreak — runs consecutivas down/stale', () => {
  const down = { status: 'down', apiKeyConfigured: true, hasWaveData: false };
  const stale = { status: 'stale', apiKeyConfigured: true, hasWaveData: true };
  const ok = { status: 'ok', apiKeyConfigured: true, hasWaveData: true };
  const noKey = { status: 'no-key', apiKeyConfigured: false, hasWaveData: false };

  it('down soma ao streak anterior (2ª run seguida → 2)', () => {
    const out = applyBuoyLayerStreak(down, { buoyLayer: { streak: 1, lastOkAt: '2026-08-14T00:00:00Z' } });
    expect(out.streak).toBe(2);
    expect(out.lastStatus).toBe('down');
    // lastOkAt preservado enquanto degradado.
    expect(out.lastOkAt).toBe('2026-08-14T00:00:00Z');
  });

  it('stale também soma (qualquer degradação conta)', () => {
    const out = applyBuoyLayerStreak(stale, { buoyLayer: { streak: 3 } });
    expect(out.streak).toBe(4);
  });

  it('primeira run degradada (sem meta anterior) → streak 1', () => {
    expect(applyBuoyLayerStreak(down, null).streak).toBe(1);
    expect(applyBuoyLayerStreak(down, {}).streak).toBe(1);
  });

  it('ok → streak 0 e lastOkAt agora', () => {
    const out = applyBuoyLayerStreak(ok, { buoyLayer: { streak: 5 } });
    expect(out.streak).toBe(0);
    expect(out.lastOkAt).toBeTruthy();
  });

  it('no-key → streak 0 (setup keyless nunca acumula degradação)', () => {
    expect(applyBuoyLayerStreak(noKey, { buoyLayer: { streak: 4 } }).streak).toBe(0);
  });

  it('sem layer → null (não rebenta)', () => {
    expect(applyBuoyLayerStreak(null, {})).toBeNull();
    expect(applyBuoyLayerStreak(undefined, {})).toBeNull();
  });

  it('fugro rejected soma ao fugroRejectedStreak anterior', () => {
    const out = applyBuoyLayerStreak(
      { status: 'ok', fugro: { status: 'rejected', name: 'CSA88/2' } },
      { buoyLayer: { fugroRejectedStreak: 2 } },
    );
    expect(out.fugroRejectedStreak).toBe(3);
    // A entrevista global pode estar 'ok' (Datawell fresca) mas a Costa de
    // Prata continua sem observedWave IH.
    expect(out.streak).toBe(0);
  });

  it('fugro ok/no-key/missing → fugroRejectedStreak reset a 0', () => {
    const base = { status: 'ok' };
    expect(applyBuoyLayerStreak({ ...base, fugro: { status: 'ok' } }, { buoyLayer: { fugroRejectedStreak: 4 } }).fugroRejectedStreak).toBe(0);
    expect(applyBuoyLayerStreak({ ...base, fugro: { status: 'no-key' } }, { buoyLayer: { fugroRejectedStreak: 4 } }).fugroRejectedStreak).toBe(0);
    expect(applyBuoyLayerStreak({ ...base, fugro: { status: 'missing' } }, { buoyLayer: { fugroRejectedStreak: 4 } }).fugroRejectedStreak).toBe(0);
  });
});

describe('deriveFugroState — sub-camada Costa de Prata (Nazaré 6200199)', () => {
  const fugroStation = (over = {}) => ({
    name: 'CSA88/2',
    family: FUGRO_FAMILY,
    status: 'active',
    ...over,
  });

  const file = (stations, apiKeyConfigured = true) => ({
    apiKeyConfigured,
    hasWaveData: true,
    stations,
  });

  it('sem ficheiro/estações → null', () => {
    expect(deriveFugroState(null, NOW)).toBeNull();
    expect(deriveFugroState(file(undefined), NOW)).toBeNull();
  });

  it('sem key → no-key (nada a validar)', () => {
    expect(deriveFugroState(file({ [FUGRO_NAZARE_KEY]: fugroStation() }, false), NOW)).toEqual({
      status: 'no-key',
    });
  });

  it('key configurada mas estação Fugro ausente/inactiva → missing', () => {
    expect(deriveFugroState(file({}), NOW)).toEqual({ status: 'missing' });
    expect(deriveFugroState(file({ [FUGRO_NAZARE_KEY]: fugroStation({ status: 'inactive' }) }), NOW)).toEqual({
      status: 'missing',
      name: 'CSA88/2',
    });
  });

  it('key + Fugro activa mas SEM leitura → rejected (getDatawellData rejeita a família)', () => {
    const s = deriveFugroState(file({ [FUGRO_NAZARE_KEY]: fugroStation({ latest: undefined }) }), NOW);
    expect(s).toEqual({ status: 'rejected', name: 'CSA88/2' });
    // latest sem hm0 finito também conta como rejeitada.
    const s2 = deriveFugroState(
      file({ [FUGRO_NAZARE_KEY]: fugroStation({ latest: { date: FRESH } }) }),
      NOW,
    );
    expect(s2.status).toBe('rejected');
  });

  it('key + Fugro com leitura VELHA → rejected (fresca se ≤ 3h)', () => {
    const s = deriveFugroState(
      file({ [FUGRO_NAZARE_KEY]: fugroStation({ latest: { date: STALE, hm0: 1.8 } }) }),
      NOW,
    );
    expect(s.status).toBe('rejected');
  });

  it('key + Fugro fresca → ok com altura e timestamp', () => {
    const s = deriveFugroState(
      file({ [FUGRO_NAZARE_KEY]: fugroStation({ latest: { date: FRESH, hm0: 1.8 } }) }),
      NOW,
    );
    expect(s).toEqual({ status: 'ok', name: 'CSA88/2', latestReadingAt: FRESH, waveHeightM: 1.8 });
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
