/**
 * Unit tests for scripts/verify-ih-buoy-layer.js — o gate do workflow que
 * falha o job quando IH_API_KEY está configurada mas a camada de ondas não
 * ficou no ih-buoys.json (hasWaveData false), a boia Fugro 2 (Nazaré
 * Costeira) não devolveu leituras, OU (com a key activa) as boias Datawell
 * costeiras Leixões/Sines/Faro não têm leitura.
 *
 * Cobre a função pura verifyIhBuoyLayer (PASS/FAIL por condição) — o exit 1
 * do CLI é derivado directamente dela.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  verifyIhBuoyLayer,
  FUGRO_2_KEY,
  FUGRO_2_FAMILY,
  DATAWELL_FAMILY,
  DATAWELL_COASTAL_BUOYS,
} = require('../../verify-ih-buoy-layer.js');

const FUGRO_2_WITH_LATEST = {
  idEst: 2,
  name: 'CSA88/2',
  family: 'fugro',
  area: 'Boia Nazaré Costeira',
  latest: { hm0: 1.8, tp: 11, thtp: 315, hmax: 2.4, temp: 18.5, date: '2026-08-31T02:00:00Z' },
};

/** Leixões (4) / Sines (19) / Faro (20) — boias Datawell costeiras esperadas. */
const DATAWELL_WITH_LATEST = {
  '4': { idEst: 4, name: 'CSA92/D', family: 'datawell', area: 'Leixões', latest: { hm0: 1.9, tp: 10, date: '2026-08-31T02:00:00Z' } },
  '19': { idEst: 19, name: 'CSA83/1D', family: 'datawell', area: 'Sines', latest: { hm0: 2.1, tp: 9, date: '2026-08-31T02:00:00Z' } },
  '20': { idEst: 20, name: 'CSA82/D', family: 'datawell', area: 'Faro', latest: { hm0: 1.2, tp: 12, date: '2026-08-31T02:00:00Z' } },
};

const keyedFile = (station2 = FUGRO_2_WITH_LATEST, stationOverrides = {}) => ({
  stations: {
    '1': { idEst: 1, family: 'datawell' },
    [FUGRO_2_KEY]: station2,
    ...DATAWELL_WITH_LATEST,
    ...stationOverrides,
  },
  spotMapping: {},
  apiKeyConfigured: true,
  hasWaveData: true,
});

describe('verifyIhBuoyLayer', () => {
  it('PASS: hasWaveData true + Fugro 2 E as boias Datawell costeiras com leitura', () => {
    const { ok, problems, fugro2, datawell } = verifyIhBuoyLayer(keyedFile());
    expect(ok).toBe(true);
    expect(problems).toEqual([]);
    expect(fugro2).toMatchObject({ idEst: 2, family: 'fugro' });
    // As 3 Datawell (Leixões/Sines/Faro) estão ok e têm leitura.
    expect(datawell).toHaveLength(3);
    expect(datawell.every((d) => d.ok)).toBe(true);
    expect(datawell.map((d) => d.key)).toEqual(['4', '19', '20']);
  });

  it('PASS: hm0 = 0 (mar chato) é uma leitura válida — só exige finito', () => {
    const { ok } = verifyIhBuoyLayer(
      keyedFile({ ...FUGRO_2_WITH_LATEST, latest: { ...FUGRO_2_WITH_LATEST.latest, hm0: 0 } }),
    );
    expect(ok).toBe(true);
  });

  it('FAIL: hasWaveData false (key aceite mas sem séries de onda)', () => {
    const { ok, problems } = verifyIhBuoyLayer({ ...keyedFile(), hasWaveData: false });
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('hasWaveData=false');
  });

  it('FAIL: Fugro 2 sem latest (ficheiro keyless — exactamente o caso a detectar)', () => {
    const { ok, problems } = verifyIhBuoyLayer(
      keyedFile({ idEst: 2, name: 'CSA88/2', family: 'fugro', area: 'Boia Nazaré Costeira' }),
    );
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('sem leitura fresca');
  });

  it('FAIL: estação 2 ausente do catálogo', () => {
    const { ok, problems } = verifyIhBuoyLayer({ stations: {}, hasWaveData: true });
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('não está catalogada');
  });

  it('FAIL: estação 2 com family errada (o gate é específico da Fugro)', () => {
    const { ok, problems } = verifyIhBuoyLayer(
      keyedFile({ ...FUGRO_2_WITH_LATEST, family: 'datawell' }),
    );
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain("family 'datawell'");
  });

  it('FAIL: Leixões (4) sem latest com a key activa — Datawell também é validada', () => {
    const { ok, problems, datawell } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_WITH_LATEST, {
        '4': { idEst: 4, name: 'CSA92/D', family: 'datawell', area: 'Leixões' },
      }),
    );
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('Boia Datawell Leixões (CSA92/D) (estação 4) sem leitura fresca');
    expect(datawell.find((d) => d.key === '4').ok).toBe(false);
    expect(datawell.find((d) => d.key === '4').reason).toBe('no-latest');
  });

  it('FAIL: Sines (19) com family errada (esperado datawell)', () => {
    const { ok, problems } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_WITH_LATEST, {
        '19': { idEst: 19, name: 'CSA83/1D', family: 'fugro', area: 'Sines', latest: { hm0: 2.1 } },
      }),
    );
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain("Estação 19 (Sines (CSA83/1D)) tem family 'fugro'");
  });

  it('FAIL: Faro (20) ausente do catálogo com a key activa', () => {
    const { problems } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_WITH_LATEST, { '20': undefined }),
    );
    expect(problems.join('\n')).toContain('Boia Datawell Faro (CSA82/D) (estação 20) não está catalogada');
    expect(problems.join('\n')).not.toContain('Boia Datawell Leixões');
  });

  it('keyless (hasWaveData false) NÃO valida as Datawell — só o hasWaveData falha', () => {
    // Sem key, as Datawell não têm latest; o gate não se aplica (evita falso-pass no setup keyless).
    const data = keyedFile(FUGRO_2_WITH_LATEST);
    delete data.stations['4'].latest;
    delete data.stations['19'].latest;
    delete data.stations['20'].latest;
    const { ok, problems } = verifyIhBuoyLayer({ ...data, hasWaveData: false });
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('hasWaveData=false');
    expect(problems.join('\n')).not.toContain('Boia Datawell');
  });

  it('FAIL: payload null/ilegível (nunca rebenta — devolve problemas)', () => {
    expect(verifyIhBuoyLayer(null).ok).toBe(false);
    expect(verifyIhBuoyLayer(undefined).ok).toBe(false);
  });

  it('constantes do gate: Fugro 2 (fugro) + Leixões/Sines/Faro (datawell)', () => {
    expect(FUGRO_2_KEY).toBe('2');
    expect(FUGRO_2_FAMILY).toBe('fugro');
    expect(DATAWELL_FAMILY).toBe('datawell');
    expect(DATAWELL_COASTAL_BUOYS.map((b) => b.key)).toEqual(['4', '19', '20']);
  });
});
