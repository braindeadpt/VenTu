import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const MODULE_PATH = '../forecastConfidence.js';

/** Recarrega o módulo (o env é lido no load) e restaura o estado do env. */
function loadModule(env = {}) {
  const prev = process.env.VENTU_WIND_AIFS;
  if (Object.prototype.hasOwnProperty.call(env, 'VENTU_WIND_AIFS')) {
    process.env.VENTU_WIND_AIFS = env.VENTU_WIND_AIFS;
  } else {
    delete process.env.VENTU_WIND_AIFS;
  }
  const resolved = require.resolve(MODULE_PATH);
  delete require.cache[resolved];
  const mod = require(MODULE_PATH);
  if (prev === undefined) delete process.env.VENTU_WIND_AIFS;
  else process.env.VENTU_WIND_AIFS = prev;
  return mod;
}

afterEach(() => {
  delete process.env.VENTU_WIND_AIFS;
});

describe('forecastConfidence model lists', () => {
  it('ondas: EWAM + ECMWF WAM 9km substituem o antigo ecmwf_wam025 (que devolve null)', () => {
    const { WAVE_MODELS } = loadModule();
    expect(WAVE_MODELS).toEqual(['ewam', 'ecmwf_wam', 'ncep_gfswave025', 'gwam']);
    expect(WAVE_MODELS).not.toContain('ecmwf_wam025');
  });

  it('vento: base sem AIFS; com VENTU_WIND_AIFS=1 adiciona ecmwf_aifs025', () => {
    const base = loadModule();
    expect(base.WIND_MODELS).toEqual([
      'icon_eu',
      'ecmwf_ifs025',
      'gfs_seamless',
      'meteofrance_arpege_europe',
    ]);

    const withAifs = loadModule({ VENTU_WIND_AIFS: '1' });
    expect(withAifs.WIND_MODELS).toHaveLength(5);
    expect(withAifs.WIND_MODELS).toContain('ecmwf_aifs025');
  });

  it('VENTU_WIND_AIFS=0 não adiciona AIFS', () => {
    const off = loadModule({ VENTU_WIND_AIFS: '0' });
    expect(off.WIND_MODELS).toHaveLength(4);
    expect(off.WIND_MODELS).not.toContain('ecmwf_aifs025');
  });
});

describe('forecastConfidence — membro morto (série toda a 0)', () => {
  const times = Array.from({ length: 168 }, (_, i) =>
    new Date(Date.UTC(2026, 8, 25) + i * 3_600_000).toISOString().slice(0, 16));
  const live = (v) => times.map((_, i) => v + (i % 5) / 10);

  /** Cenário Nazaré 2026-09-25: gfswave025 a 0 nas 168 h, os outros a ~1,2 m. */
  const marineWith = (deadGfswave) => ({
    hourly: {
      time: times,
      wave_height_ewam: live(1.2),
      wave_height_ecmwf_wam: live(1.25),
      wave_height_ncep_gfswave025: deadGfswave ? times.map(() => 0) : live(1.22),
      wave_height_gwam: live(1.3),
    },
  });
  const noWind = { hourly: { time: times } };

  it('exclui a série a 0 da contagem e do spread', () => {
    const { confidenceAtIndex } = loadModule();
    const withDead = confidenceAtIndex(marineWith(true), noWind, 100);
    const allLive = confidenceAtIndex(marineWith(false), noWind, 100);

    expect(withDead.waveModelCount).toBe(3);
    expect(allLive.waveModelCount).toBe(4);
    expect(withDead.waveSpread).toBeLessThan(0.5);
    // Sem o filtro, o spread seria max - 0 ≈ 1,3 m e o spot ficava preso em "baixa".
    expect(withDead.confidence).toBe(allLive.confidence);
  });

  it('confidenceByDay usa os mesmos membros vivos', () => {
    const { confidenceByDay } = loadModule();
    const daily = confidenceByDay(marineWith(true), noWind);
    expect(daily.length).toBeGreaterThan(0);
    for (const d of daily) expect(d.waveSpread).toBeLessThan(0.5);
  });
});

describe('forecastConfidence — piso operacional de vento calmo', () => {
  const times = ['2026-07-21T12:00'];

  it('vento calmo (1.36 m/s, spread 0.8 m/s) com onda estável (1.5 m, spread 0.15 m) dá confiança alta; vento forte divergente (10 m/s, spread 5 m/s) mantém baixa', () => {
    const { confidenceAtIndex } = loadModule();

    const calmMarine = {
      hourly: {
        time: times,
        wave_height_ewam: [1.425],
        wave_height_ecmwf_wam: [1.5],
        wave_height_ncep_gfswave025: [1.5],
        wave_height_gwam: [1.575],
      },
    };
    const calmWind = {
      hourly: {
        time: times,
        wind_speed_10m_icon_eu: [0.96],
        wind_speed_10m_ecmwf_ifs025: [1.36],
        wind_speed_10m_gfs_seamless: [1.36],
        wind_speed_10m_meteofrance_arpege_europe: [1.76],
      },
    };
    const calm = confidenceAtIndex(calmMarine, calmWind, 0);
    expect(calm.degraded).toBe(false);
    expect(calm.windSpread).toBe(0.8);
    expect(calm.waveSpread).toBe(0.15);
    expect(calm.confidence).toBe('alta');

    const divergentMarine = {
      hourly: {
        time: times,
        wave_height_ewam: [1.275],
        wave_height_ecmwf_wam: [1.5],
        wave_height_ncep_gfswave025: [1.5],
        wave_height_gwam: [1.725],
      },
    };
    const strongDivergentWind = {
      hourly: {
        time: times,
        wind_speed_10m_icon_eu: [7.5],
        wind_speed_10m_ecmwf_ifs025: [10],
        wind_speed_10m_gfs_seamless: [10],
        wind_speed_10m_meteofrance_arpege_europe: [12.5],
      },
    };
    const divergent = confidenceAtIndex(divergentMarine, strongDivergentWind, 0);
    expect(divergent.degraded).toBe(false);
    expect(divergent.windSpread).toBe(5);
    expect(divergent.windSpreadPct).toBe(0.5);
    expect(divergent.confidence).toBe('baixa');
  });
});
