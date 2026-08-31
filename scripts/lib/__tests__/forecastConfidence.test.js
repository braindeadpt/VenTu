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
