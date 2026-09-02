/**
 * Unit tests for scripts/verify-ih-buoy-layer.js — o gate do workflow que
 * falha o job quando IH_API_KEY está configurada mas a camada de ondas não
 * ficou no ih-buoys.json.
 *
 * Contrato (validado em 2026-09-02 com a key real): `getDatawellData` só
 * serve a família Datawell — a Fugro (2/1010/1011) devolve série vazia com
 * as estações vivas na OGC keyless. Logo:
 *   - FALHA só se `hasWaveData !== true` OU se NENHUMA Datawell costeira
 *     (Leixões 4, Sines 19, Faro 20, Caniçal 33) tiver `latest` fresco.
 *   - A Fugro 2 e cada Datawell individual em falta são AVISOS (não falham).
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

/** Estação Fugro — hoje SEM leitura esperada (família não servida por getDatawellData). */
const FUGRO_2_NO_LATEST = {
  idEst: 2,
  name: 'CSA88/2',
  family: 'fugro',
  area: 'Boia Nazaré Costeira',
  last_data: '2026-09-02T11:00:00Z',
};

/**
 * Leixões (4) / Sines (19) / Faro (20) / Caniçal (33) — boias Datawell
 * costeiras; uma fresca basta para a camada estar viva.
 */
const DATAWELL_WITH_LATEST = {
  '4': { idEst: 4, name: 'CSA92/D', family: 'datawell', area: 'Leixões', latest: { hm0: 1.01, tp: 7.7, date: '2026-09-02T10:32:15Z' } },
  '19': { idEst: 19, name: 'CSA83/1D', family: 'datawell', area: 'Sines', latest: { hm0: 0.95, tp: 6.7, date: '2026-09-02T10:26:43Z' } },
  '20': { idEst: 20, name: 'CSA82/D', family: 'datawell', area: 'Faro', latest: { hm0: 0.5, tp: 7.1, date: '2026-09-02T10:25:21Z' } },
  '33': { idEst: 33, name: 'CSA94', family: 'datawell', area: 'Caniçal', latest: { hm0: 0.92, tp: 7.1, date: '2026-09-02T10:29:57Z' } },
};

/** Ficheiro keyed típico: estação 2 catalogada SEM latest (realidade de hoje). */
const keyedFile = (station2 = FUGRO_2_NO_LATEST, stationOverrides = {}) => ({
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

const stripLatest = (entries) =>
  Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k, { ...v, latest: undefined }]),
  );

describe('verifyIhBuoyLayer', () => {
  it('PASS: cenário real de 2026-09-02 — Datawell frescas, Fugro 2 sem latest → aviso, exit ok', () => {
    const { ok, problems, warnings, freshDatawell } = verifyIhBuoyLayer(keyedFile());
    expect(ok).toBe(true);
    expect(problems).toEqual([]);
    // A Fugro não é servida por getDatawellData → aviso, não falha.
    expect(warnings.some((w) => w.includes('Fugro') && w.includes('sem leitura'))).toBe(true);
    expect(freshDatawell.map((d) => d.key)).toEqual(['4', '19', '20', '33']);
  });

  it('PASS: hm0 = 0 (mar chato) é uma leitura válida — só exige finito', () => {
    const { ok } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_NO_LATEST, {
        '20': { ...DATAWELL_WITH_LATEST['20'], latest: { ...DATAWELL_WITH_LATEST['20'].latest, hm0: 0 } },
      }),
    );
    expect(ok).toBe(true);
  });

  it('PASS com avisos: Faro (20) em baixo, as outras três frescas → exit ok', () => {
    const { ok, problems, warnings } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_NO_LATEST, stripLatest({ '20': DATAWELL_WITH_LATEST['20'] })),
    );
    expect(ok).toBe(true);
    expect(problems).toEqual([]);
    expect(warnings.some((w) => w.includes('Faro') && w.includes('estação 20'))).toBe(true);
    expect(warnings.filter((w) => w.includes('AVISO Datawell')).length).toBe(1);
  });

  it('PASS: só uma Datawell fresca basta (Leixões 4) — as outras são avisos', () => {
    const { ok, warnings } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_NO_LATEST, {
        '19': { ...DATAWELL_WITH_LATEST['19'], latest: undefined },
        '20': { ...DATAWELL_WITH_LATEST['20'], latest: undefined },
        '33': { ...DATAWELL_WITH_LATEST['33'], latest: undefined },
      }),
    );
    expect(ok).toBe(true);
    const datawellWarnings = warnings.filter((w) => w.includes('AVISO Datawell'));
    expect(datawellWarnings.length).toBe(3);
  });

  it('FAIL: hasWaveData false (key aceite mas sem séries de onda)', () => {
    const { ok, problems } = verifyIhBuoyLayer({ ...keyedFile(), hasWaveData: false });
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('hasWaveData=false');
  });

  it('FAIL: nenhuma Datawell fresca com a key activa — a camada não está a funcionar', () => {
    const { ok, problems } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_NO_LATEST, stripLatest(DATAWELL_WITH_LATEST)),
    );
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain(
      'Nenhuma boia Datawell costeira (Leixões 4, Sines 19, Faro 20, Caniçal 33) tem leitura fresca',
    );
  });

  it('FAIL: payload sem stations com key activa (nenhuma boia fresca contável)', () => {
    const { ok, problems } = verifyIhBuoyLayer({ ...keyedFile(), stations: undefined });
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('Nenhuma boia Datawell costeira');
  });

  it('AVISO (não falha): estação 2 ausente do catálogo', () => {
    const { ok, warnings } = verifyIhBuoyLayer(keyedFile(FUGRO_2_NO_LATEST, { '2': undefined }));
    // '2': undefined põe a estação fora do catálogo; as Datawell continuam frescas.
    expect(ok).toBe(true);
    expect(warnings.some((w) => w.includes('AVISO Fugro') && w.includes('2'))).toBe(true);
  });

  it('AVISO (não falha): estação 2 com family errada', () => {
    const { ok, warnings } = verifyIhBuoyLayer(
      keyedFile({ ...FUGRO_2_NO_LATEST, family: 'datawell' }),
    );
    expect(ok).toBe(true);
    expect(warnings.some((w) => w.includes("family 'datawell'"))).toBe(true);
  });

  it('AVISO (não falha): Datawell com family errada ou ausente do catálogo, se houver ≥1 fresca', () => {
    const { ok, warnings } = verifyIhBuoyLayer(
      keyedFile(FUGRO_2_NO_LATEST, {
        '19': { idEst: 19, name: 'CSA83/1D', family: 'fugro', area: 'Sines', latest: { hm0: 2.1 } },
        '33': undefined,
      }),
    );
    expect(ok).toBe(true);
    expect(warnings.some((w) => w.includes("station 19") || w.includes("estação 19"))).toBe(true);
    expect(warnings.some((w) => w.includes('Caniçal') && w.includes('estação 33'))).toBe(true);
  });

  it('keyless (hasWaveData false) NÃO adiciona avisos Datawell/Fugro — só o hasWaveData falha', () => {
    const data = keyedFile();
    delete data.stations['4'].latest;
    delete data.stations['19'].latest;
    delete data.stations['20'].latest;
    delete data.stations['33'].latest;
    const { ok, problems, warnings } = verifyIhBuoyLayer({ ...data, hasWaveData: false });
    expect(ok).toBe(false);
    expect(problems.join('\n')).toContain('hasWaveData=false');
    expect(problems.join('\n')).not.toContain('Nenhuma boia Datawell');
    expect(warnings).toEqual([]);
  });

  it('FAIL: payload null/ilegível (nunca rebenta — devolve problemas)', () => {
    expect(verifyIhBuoyLayer(null).ok).toBe(false);
    expect(verifyIhBuoyLayer(undefined).ok).toBe(false);
  });

  it('constantes do gate: Fugro 2 (fugro) + Leixões/Sines/Faro/Caniçal (datawell)', () => {
    expect(FUGRO_2_KEY).toBe('2');
    expect(FUGRO_2_FAMILY).toBe('fugro');
    expect(DATAWELL_FAMILY).toBe('datawell');
    expect(DATAWELL_COASTAL_BUOYS.map((b) => b.key)).toEqual(['4', '19', '20', '33']);
  });
});