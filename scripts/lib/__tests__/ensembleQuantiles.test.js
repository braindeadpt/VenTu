import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  attachEnsemble,
  buildEnsembleEntry,
  indexByTime,
  isDeadSeries,
  liveModels,
  quantile,
  quantileTriple,
  readMembers,
  ENSEMBLE_FIELDS,
  MIN_MEMBERS,
  DECIMALS,
  DEAD_SERIES_MIN_HOURS,
} = require('../ensembleQuantiles.js');
const { WAVE_MODELS, WIND_MODELS } = require('../forecastConfidence.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Open-Meteo multi-model hourly payload: `<base>_<model>` parallel arrays. */
function marinePayload(times, byModel) {
  const hourly = { time: times };
  for (const [model, values] of Object.entries(byModel)) hourly[`wave_height_${model}`] = values;
  return { hourly };
}
function windPayload(times, byModel) {
  const hourly = { time: times };
  for (const [model, values] of Object.entries(byModel)) hourly[`wind_speed_10m_${model}`] = values;
  return { hourly };
}
const hours = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => `2026-09-25T${String(from + i).padStart(2, '0')}:00`);

/** n horas distintas a partir de 2026-09-25T00:00 (universo realista de 168 h). */
const seq = (n) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 8, 25) + i * 3_600_000).toISOString().slice(0, 16));

describe('quantile — interpolação linear (R-7)', () => {
  it('reproduz os quantis do numpy/Excel numa amostra conhecida', () => {
    const xs = [1, 2, 3, 4];
    expect(quantile(xs, 0)).toBe(1);
    expect(quantile(xs, 0.1)).toBeCloseTo(1.3, 6);
    expect(quantile(xs, 0.5)).toBe(2.5);
    expect(quantile(xs, 0.9)).toBeCloseTo(3.7, 6);
    expect(quantile(xs, 1)).toBe(4);
  });

  it('ordena a amostra e ignora entradas não finitas', () => {
    expect(quantile([4, 1, null, 3, NaN, 2, undefined], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([7], 0.9)).toBe(7);
  });

  it('fica sempre dentro de [min, max]', () => {
    const xs = [0.4, 1.1, 1.9, 3.2];
    for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const q = quantile(xs, p);
      expect(q).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(q).toBeLessThanOrEqual(Math.max(...xs));
    }
  });
});

describe('quantileTriple — limiar de membros e arredondamento', () => {
  it(`exige ${MIN_MEMBERS} membros: abaixo disso devolve nulls`, () => {
    expect(quantileTriple([1, 2], DECIMALS.wave)).toEqual([null, null, null]);
    expect(quantileTriple([], DECIMALS.wave)).toEqual([null, null, null]);
    expect(quantileTriple([1, 2, 3], DECIMALS.wave)).toEqual([1.2, 2, 2.8]);
  });

  it('arredonda às casas da família (onda 2, vento 1)', () => {
    expect(quantileTriple([1.234, 1.567, 1.891], DECIMALS.wave)).toEqual([1.3, 1.57, 1.83]);
    expect(quantileTriple([8.14, 9.27, 10.31], DECIMALS.wind)).toEqual([8.4, 9.3, 10.1]);
  });

  it('mantém p10 ≤ p50 ≤ p90 e nunca negativo', () => {
    for (let seed = 0; seed < 200; seed++) {
      const values = Array.from({ length: 3 + (seed % 2) }, (_, i) => ((seed * 37 + i * 11) % 400) / 100);
      const [p10, p50, p90] = quantileTriple(values, DECIMALS.wave);
      expect(p10).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p90);
      expect(p10).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('readMembers', () => {
  it('lê os membros pelos nomes reais do ensemble (<base>_<modelo>)', () => {
    const payload = marinePayload(hours(2), {
      [WAVE_MODELS[0]]: [1, 9],
      [WAVE_MODELS[1]]: [2, null],
      [WAVE_MODELS[2]]: [3, undefined],
      [WAVE_MODELS[3]]: [NaN, 4],
    });
    expect(readMembers(payload.hourly, 'wave_height', WAVE_MODELS, 0)).toEqual([1, 2, 3]);
    expect(readMembers(payload.hourly, 'wave_height', WAVE_MODELS, 1)).toEqual([9, 4]);
    expect(readMembers(payload.hourly, 'wave_height', WAVE_MODELS, 5)).toEqual([]);
    expect(readMembers(null, 'wave_height', WAVE_MODELS, 0)).toEqual([]);
  });
});

describe('buildEnsembleEntry — contrato do array', () => {
  it(`tem ${ENSEMBLE_FIELDS.length} números, na ordem documentada`, () => {
    const entry = buildEnsembleEntry({ waveValues: [1, 2, 3, 4], windValues: [8, 9, 10, 11] });
    expect(entry).toHaveLength(ENSEMBLE_FIELDS.length);
    const byField = Object.fromEntries(ENSEMBLE_FIELDS.map((f, i) => [f, entry[i]]));
    expect(byField.waveP10).toBeLessThan(byField.waveP50);
    expect(byField.waveP50).toBeLessThan(byField.waveP90);
    expect(byField.windP10).toBeLessThan(byField.windP50);
    expect(byField.windP50).toBeLessThan(byField.windP90);
    expect(byField.waveN).toBe(4);
    expect(byField.windN).toBe(4);
  });

  it('escreve nulls na família com poucos membros mas mantém a contagem', () => {
    const entry = buildEnsembleEntry({ waveValues: [1, 2, 3], windValues: [8, 9] });
    expect(entry.slice(0, 3)).toEqual([1.2, 2, 2.8]);
    expect(entry.slice(3, 6)).toEqual([null, null, null]);
    expect(entry.slice(6)).toEqual([3, 2]);
  });

  it('devolve null quando não há membros nenhuns', () => {
    expect(buildEnsembleEntry({ waveValues: [], windValues: [] })).toBeNull();
  });
});

describe('attachEnsemble — alinhamento pela hora, nunca pelo índice', () => {
  it('casa os membros pelo timestamp mesmo com o payload a começar noutra hora', () => {
    const rows = [
      { time: '2026-09-25T02:00', waveHeight: 1.2, windSpeed: 5 },
      { time: '2026-09-25T03:00', waveHeight: 1.4, windSpeed: 6 },
    ];
    // O payload dos modelos começa às 00:00 (valores baixos, distintos): se o
    // alinhamento fosse por índice, a linha das 02:00 recebia estes membros.
    const marine = marinePayload(hours(4), {
      ewam: [0.5, 0.5, 1.2, 1.4],
      ecmwf_wam: [0.6, 0.6, 1.4, 1.6],
      ncep_gfswave025: [0.4, 0.4, 1.1, 1.3],
      gwam: [0.7, 0.7, 1.6, 1.7],
    });
    const wind = windPayload(hours(4), {
      icon_eu: [1, 1, 5, 6],
      ecmwf_ifs025: [2, 2, 6, 7],
      gfs_seamless: [3, 3, 7, 8],
      meteofrance_arpege_europe: [2, 2, 6, 7],
    });
    const stats = attachEnsemble(rows, {
      marineHourly: marine.hourly,
      windHourly: wind.hourly,
      waveModels: WAVE_MODELS,
      windModels: WIND_MODELS,
    });

    expect(stats).toEqual({ hours: 2, waveMembers: 8, windMembers: 8, deadModels: [] });
    expect(rows[0].ens.slice(0, 3)).toEqual([1.13, 1.3, 1.54]);
    expect(rows[0].ens.slice(3, 6)).toEqual([5.3, 6, 6.7]);
    expect(rows[1].ens.slice(0, 3)).toEqual([1.33, 1.5, 1.67]);
    expect(rows[0].ens.slice(6)).toEqual([4, 4]);
    // Não são as horas do princípio do payload.
    expect(rows[0].ens[0]).toBeGreaterThan(1);
  });

  it('não escreve a chave nas horas sem membros e não toca nas restantes', () => {
    const rows = [
      { time: '2026-09-25T00:00', waveHeight: 1, windSpeed: 5, tideHeight: 1.1 },
      { time: '2026-09-30T23:00', waveHeight: 1, windSpeed: 5 },
    ];
    const marine = marinePayload(hours(1), { ewam: [1], ecmwf_wam: [2], ncep_gfswave025: [3] });
    const stats = attachEnsemble(rows, {
      marineHourly: marine.hourly,
      windHourly: null,
      waveModels: WAVE_MODELS,
      windModels: WIND_MODELS,
    });

    expect(stats.hours).toBe(1);
    expect(stats.windMembers).toBe(0);
    expect(rows[0].ens).toHaveLength(ENSEMBLE_FIELDS.length);
    expect(rows[0].ens.slice(3, 6)).toEqual([null, null, null]);
    expect(rows[0].ens.slice(6)).toEqual([3, 0]);
    expect(rows[0].tideHeight).toBe(1.1);
    expect('ens' in rows[1]).toBe(false);
  });

  it('aguenta payloads ausentes e linhas vazias sem rebentar', () => {
    const empty = { hours: 0, waveMembers: 0, windMembers: 0, deadModels: [] };
    const none = { marineHourly: null, windHourly: null, waveModels: [], windModels: [] };
    expect(attachEnsemble([], none)).toEqual(empty);
    expect(attachEnsemble(null, none)).toEqual(empty);
    const rows = [{ time: '2026-09-25T00:00' }];
    expect(attachEnsemble(rows, { marineHourly: undefined, windHourly: undefined, waveModels: WAVE_MODELS, windModels: WIND_MODELS }).hours).toBe(0);
    expect('ens' in rows[0]).toBe(false);
  });

  it('indexByTime mantém a primeira ocorrência de cada hora', () => {
    const map = indexByTime(['a', 'b', 'a']);
    expect(map.get('a')).toBe(0);
    expect(map.get('b')).toBe(1);
    expect(map.get('z')).toBeUndefined();
    expect(indexByTime(undefined).size).toBe(0);
  });
});

describe('membro morto — série toda a 0 (run ausente preenchido)', () => {
  // Medido em 2026-09-25: ncep_gfswave025 devolve 0 nas 192 horas em Nazaré
  // (horizonte e past_days) enquanto os outros três dão 1,1–3,2 m.
  const flatline = () => Array.from({ length: 168 }, () => 0);
  const live = (v) => Array.from({ length: 168 }, (_, i) => v + (i % 5) / 10);

  it(`isDeadSeries só dispara com ${DEAD_SERIES_MIN_HOURS}+ horas a zero`, () => {
    expect(isDeadSeries(flatline())).toBe(true);
    expect(isDeadSeries(Array.from({ length: 23 }, () => 0))).toBe(false);
    expect(isDeadSeries(live(1))).toBe(false);
    expect(isDeadSeries([0, 0, 0, 2])).toBe(false); // um valor real chega para viver
    expect(isDeadSeries([null, null, null])).toBe(false); // ausente não é "preenchido a 0"
    expect(isDeadSeries(undefined)).toBe(false);
  });

  it('liveModels tira o modelo a zeros e mantém os restantes', () => {
    const hourly = {
      wave_height_ewam: live(1.2),
      wave_height_ecmwf_wam: live(1.4),
      wave_height_ncep_gfswave025: flatline(),
      wave_height_gwam: live(1.6),
    };
    expect(liveModels(hourly, 'wave_height', WAVE_MODELS)).toEqual(['ewam', 'ecmwf_wam', 'gwam']);
    expect(liveModels({}, 'wave_height', WAVE_MODELS)).toEqual(WAVE_MODELS);
  });

  it('a banda ignora o membro morto (P10 não cai para o mar chato)', () => {
    const withDead = { wave_height_ewam: live(1.2),
      wave_height_ecmwf_wam: live(1.4),
      wave_height_ncep_gfswave025: flatline(),
      wave_height_gwam: live(1.6) };
    const withoutDead = { wave_height_ewam: live(1.2), wave_height_ecmwf_wam: live(1.4), wave_height_gwam: live(1.6) };
    const times = seq(168);
    const rows = times.map((t) => ({ time: t }));
    const stats = attachEnsemble(rows, {
      marineHourly: { time: times, ...withDead },
      windHourly: null,
      waveModels: WAVE_MODELS,
      windModels: WIND_MODELS,
    });

    expect(stats.deadModels).toEqual(['wave:ncep_gfswave025']);
    expect(stats.waveMembers).toBe(rows.length * 3);
    // Sem o membro a 0, a banda é a mesma dos três vivos; com ele, o P10 seria 0.
    const reference = rows.map(({ time }) => ({ time }));
    attachEnsemble(reference, {
      marineHourly: { time: times, ...withoutDead },
      windHourly: null,
      waveModels: ['ewam', 'ecmwf_wam', 'gwam'],
      windModels: WIND_MODELS,
    });
    expect(rows[0].ens.slice(0, 3)).toEqual(reference[0].ens.slice(0, 3));
    expect(rows[0].ens[0]).toBeGreaterThan(1);
    expect(rows[0].ens[6]).toBe(3);
  });

  it('sem membros vivos suficientes a hora fica sem banda (honesto)', () => {
    const times = ['2026-09-25T00:00', '2026-09-25T01:00'];
    const rows = times.map((t) => ({ time: t }));
    const stats = attachEnsemble(rows, {
      marineHourly: { time: times, wave_height_ewam: live(1.2), wave_height_ecmwf_wam: flatline(), wave_height_ncep_gfswave025: flatline(), wave_height_gwam: flatline() },
      windHourly: null,
      waveModels: WAVE_MODELS,
      windModels: WIND_MODELS,
    });
    expect(stats.deadModels).toEqual(['wave:ecmwf_wam', 'wave:ncep_gfswave025', 'wave:gwam']);
    expect(stats.hours).toBe(0);
    expect('ens' in rows[0]).toBe(false);
  });
});

describe('ligação ao pipeline (guarda de regressão)', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const perSpot = read('scripts/lib/updateConditionsPerSpot.js');
  const updateConditions = read('scripts/update-conditions.js');
  const moduleSource = read('scripts/lib/ensembleQuantiles.js');

  it('processSpot chama attachEnsemble com os membros já descarregados', () => {
    expect(perSpot).toMatch(/attachEnsemble\(forecast,/);
    expect(perSpot).toMatch(/marineHourly: waveModelsHourly/);
    expect(perSpot).toMatch(/windHourly: weatherData\._windModelsHourly/);
    // A banda vem dos membros que o run diurno já pediu: o módulo não faz I/O.
    expect(moduleSource).not.toMatch(/fetch\(|https?:\/\//);
  });

  it('o run resume a cobertura da banda e avisa se ela desaparecer', () => {
    expect(updateConditions).toMatch(/result\.ensembleHours/);
    expect(updateConditions).toMatch(/Banda horária P10\/P50\/P90/);
    expect(updateConditions).toMatch(/Banda ensemble em falta/);
  });
});
