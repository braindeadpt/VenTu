/**
 * Ensemble P10/P50/P90 per spot-hour — the probabilistic band behind each
 * hourly forecast row.
 *
 * Why: the pipeline already downloads 4 wave models (EWAM, ECMWF WAM, GFS
 * Wave, GWAM) and 4 wind models (ICON-EU, ECMWF IFS, GFS, Météo-France) for
 * every spot, but only ever kept the *spread* between them, collapsed into the
 * alta/média/baixa confidence tier (forecastConfidence.js). The members
 * themselves were discarded, so nothing downstream could say "1,2–2,1 m" — only
 * "confiança média". This module keeps the distribution: for each hour row it
 * adds the ensemble quantiles of wave height (m) and wind speed (m/s).
 *
 * Cost: zero extra Open-Meteo calls — the members ride along in the payloads
 * the daytime run already fetches (fetchMarineWaveModels / fetchWindModels).
 * The only price is file size, so the block is deliberately compact: one
 * 8-number array per hour instead of six named keys (measured +0,95 MB on
 * forecasts.json vs +1,93 MB for the readable shape, against a 12 MB budget in
 * check-payload-budgets.js). Field order is the ENSEMBLE_FIELDS contract below
 * and is enforced by validate-generated-data.js, so the layout cannot drift
 * silently.
 *
 * Quantile method: linear interpolation between order statistics (R-7, the
 * numpy/Excel default) over the members that answered for that hour. No
 * distribution is fitted — with 4 members the interval is narrow by
 * construction and the stored member count (`waveN`/`windN`) is what tells a
 * consumer how much to trust it. Members are matched to the row by timestamp
 * (never by index): the best_match, wave-model and wind-model requests are
 * separate calls and Open-Meteo may start them on different hours.
 */

/** Order of the 8 numbers in a row's `ens` array. Counts come last. */
const ENSEMBLE_FIELDS = [
  'waveP10',
  'waveP50',
  'waveP90',
  'windP10',
  'windP50',
  'windP90',
  'waveN',
  'windN',
];

/**
 * Members required before a band is published for that family. With 2 members
 * "P10" would be an interpolation between two points — a number that looks like
 * a probability but carries none. Below the threshold the family's three
 * quantiles are written as nulls and only the count is kept.
 */
const MIN_MEMBERS = 3;

/**
 * Uma série inteira de valores exatamente 0 é a Open-Meteo a *preencher um run
 * ausente*, não meteorologia. Caso medido (2026-09-25): `ncep_gfswave025` em
 * Nazaré devolve 0 nas 192 horas — todo o horizonte e ainda `past_days=1` —
 * enquanto EWAM/ECMWF WAM/GWAM concordam em 1,1–3,2 m. Um membro a 0,00 m
 * puxava o P10 publicado para o mar chato e já inflacionava o
 * `confidenceDetail.waveSpread` (Nazaré presa em "baixa" para sempre), por
 * isso a série morta sai dos membros ANTES do cálculo. Mesma família do
 * sentinela 99.99 do IH (dataPlausibility.js).
 *
 * Limiar: um dia inteiro de valores exatamente 0. Menos horas não é evidência,
 * e uma semana genuinamente plana não é física para o Hm0 nesta costa.
 */
const DEAD_SERIES_MIN_HOURS = 24;

/**
 * @param {unknown} series o array de um modelo no payload multi-modelo
 * @returns {boolean}
 */
function isDeadSeries(series) {
  if (!Array.isArray(series)) return false;
  let zeros = 0;
  for (const v of series) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v !== 0) return false;
    zeros += 1;
  }
  return zeros >= DEAD_SERIES_MIN_HOURS;
}

/**
 * Modelos configurados menos os que preenchem um run ausente com zeros.
 * @param {object | null | undefined} hourly
 * @param {string} base ex. 'wave_height'
 * @param {string[]} models
 * @returns {string[]}
 */
function liveModels(hourly, base, models) {
  return models.filter((model) => !isDeadSeries(hourly?.[`${base}_${model}`]));
}

/** Decimals kept per family (2 = cm for waves, 1 = 0,1 m/s for wind). */
const DECIMALS = { wave: 2, wind: 1 };

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Linear-interpolation quantile (R-7) over an unsorted sample.
 * @param {number[]} values
 * @param {number} p 0–1
 * @returns {number | null}
 */
function quantile(values, p) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  if (xs.length === 1) return xs[0];
  const h = (xs.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return xs[lo] + (xs[hi] - xs[lo]) * (h - lo);
}

/**
 * P10/P50/P90 of one family's members, rounded, or nulls when too few members.
 * @param {number[]} values
 * @param {number} decimals
 * @returns {(number | null)[]}
 */
function quantileTriple(values, decimals) {
  const members = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (members.length < MIN_MEMBERS) return [null, null, null];
  const p10 = round(quantile(members, 0.1), decimals);
  const p50 = round(quantile(members, 0.5), decimals);
  const p90 = round(quantile(members, 0.9), decimals);
  // Interpolation reproduces order statistics, so p10 <= p50 <= p90 holds
  // before rounding; rounding both ends inward can only shrink the interval.
  return [Math.min(p10, p50), p50, Math.max(p90, p50)];
}

/**
 * Members of one family at a given hour, read from an Open-Meteo multi-model
 * payload (`<base>_<model>` arrays).
 * @param {object} hourly
 * @param {string} base
 * @param {string[]} models
 * @param {number} i
 * @returns {number[]}
 */
function readMembers(hourly, base, models, i) {
  const out = [];
  for (const model of models) {
    const v = hourly?.[`${base}_${model}`]?.[i];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * `time` string → index, so members are matched by timestamp rather than by
 * array position (the payloads come from separate requests).
 * @param {string[] | undefined} times
 * @returns {Map<string, number>}
 */
function indexByTime(times) {
  const map = new Map();
  if (Array.isArray(times)) {
    for (let i = 0; i < times.length; i++) {
      if (!map.has(times[i])) map.set(times[i], i);
    }
  }
  return map;
}

/**
 * The `ens` array for one row, or null when neither family has any member.
 * @param {{ waveValues: number[]; windValues: number[] }} input
 * @returns {number[] | null}
 */
function buildEnsembleEntry({ waveValues, windValues }) {
  const wave = quantileTriple(waveValues, DECIMALS.wave);
  const wind = quantileTriple(windValues, DECIMALS.wind);
  if (wave.every((v) => v === null) && wind.every((v) => v === null)) return null;
  return [...wave, ...wind, waveValues.length, windValues.length];
}

/**
 * Add the compact ensemble block to every forecast row that has members.
 * Mutates the rows in place (the pipeline owns them) and returns stats.
 *
 * @param {Array<{time: string}>} rows from mergeForecast()
 * @param {object} sources
 * @param {object | null} sources.marineHourly multi-model wave payload hourly
 * @param {object | null} sources.windHourly multi-model wind payload hourly
 * @param {string[]} sources.waveModels
 * @param {string[]} sources.windModels
 * @returns {{ hours: number; waveMembers: number; windMembers: number; deadModels: string[] }}
 */
function attachEnsemble(rows, { marineHourly, windHourly, waveModels, windModels }) {
  const stats = { hours: 0, waveMembers: 0, windMembers: 0, deadModels: [] };
  if (!Array.isArray(rows) || !rows.length) return stats;
  const waveAt = indexByTime(marineHourly?.time);
  const windAt = indexByTime(windHourly?.time);
  // Os membros mortos (séries a 0) saem antes de contar: nem entram nos
  // quantis nem no waveN/windN gravado, senão a banda seria calculada sobre
  // uma amostra que inclui um valor inventado.
  const liveWave = liveModels(marineHourly, 'wave_height', waveModels);
  const liveWind = liveModels(windHourly, 'wind_speed_10m', windModels);
  for (const model of waveModels) if (!liveWave.includes(model)) stats.deadModels.push(`wave:${model}`);
  for (const model of windModels) if (!liveWind.includes(model)) stats.deadModels.push(`wind:${model}`);

  for (const row of rows) {
    if (!row || typeof row.time !== 'string') continue;
    const waveIndex = waveAt.get(row.time);
    const windIndex = windAt.get(row.time);
    const waveValues = waveIndex === undefined ? [] : readMembers(marineHourly, 'wave_height', liveWave, waveIndex);
    const windValues = windIndex === undefined ? [] : readMembers(windHourly, 'wind_speed_10m', liveWind, windIndex);
    const entry = buildEnsembleEntry({ waveValues, windValues });
    if (!entry) continue;
    row.ens = entry;
    stats.hours += 1;
    stats.waveMembers += waveValues.length;
    stats.windMembers += windValues.length;
  }

  return stats;
}

/** Famílias na ordem em que ocupam o array: 3 quantis cada, depois a contagem. */
const FAMILY_LAYOUT = [
  { name: 'wave', base: 0, count: 6, decimals: DECIMALS.wave },
  { name: 'wind', base: 3, count: 7, decimals: DECIMALS.wind },
];

/** Nº máximo de membros aceites na contagem (defensivo: são 4–5 modelos). */
const MAX_MEMBERS = 16;

/**
 * Valida uma banda `ens` gravada numa hora. Devolve a mensagem de erro ou null.
 * Consumido pelo validador do pipeline — o contrato do array vive aqui, num
 * sítio só, para o formato não derivar em silêncio.
 * @param {unknown} entry
 * @returns {string | null}
 */
function validateEnsembleEntry(entry) {
  if (!Array.isArray(entry)) return 'ens deve ser um array';
  if (entry.length !== ENSEMBLE_FIELDS.length) {
    return `ens com ${entry.length} valores (esperado ${ENSEMBLE_FIELDS.length}: ${ENSEMBLE_FIELDS.join(', ')})`;
  }
  for (const field of FAMILY_LAYOUT) {
    const values = entry.slice(field.base, field.base + 3);
    const n = entry[field.count];
    if (!Number.isInteger(n) || n < 0 || n > MAX_MEMBERS) {
      return `${ENSEMBLE_FIELDS[field.count]} inválido (${JSON.stringify(n)})`;
    }
    const nums = values.filter((v) => v !== null);
    if (nums.length !== 0 && nums.length !== 3) {
      return `${field.name}: quantis parcialmente nulos (${JSON.stringify(values)})`;
    }
    if (nums.length === 0 && n >= MIN_MEMBERS) {
      return `${field.name}: sem banda apesar de ${n} membros`;
    }
    if (nums.length === 3) {
      if (n < MIN_MEMBERS) return `${field.name}: banda com ${n} membros (<${MIN_MEMBERS})`;
      for (let i = 0; i < 3; i++) {
        const v = values[i];
        const name = ENSEMBLE_FIELDS[field.base + i];
        if (typeof v !== 'number' || !Number.isFinite(v)) return `${name} não numérico (${JSON.stringify(v)})`;
        if (v < 0) return `${name} negativo (${v})`;
        if (Math.abs(v * 10 ** field.decimals - Math.round(v * 10 ** field.decimals)) > 1e-6) {
          return `${name} com mais de ${field.decimals} casas decimais (${v})`;
        }
      }
      if (!(values[0] <= values[1] && values[1] <= values[2])) {
        return `${field.name}: P10/P50/P90 fora de ordem (${JSON.stringify(values)})`;
      }
    }
  }
  const wave = entry.slice(0, 3);
  const wind = entry.slice(3, 6);
  if (wave.every((v) => v === null) && wind.every((v) => v === null)) {
    return 'ens sem membros em nenhuma família (a chave devia ter sido omitida)';
  }
  return null;
}

/**
 * Cobertura da banda num índice de previsões.
 * @param {Record<string, Array<{ens?: number[]}>>} forecasts
 * @returns {{ spots: number; banded: number; total: number }}
 */
function ensembleCoverage(forecasts) {
  let banded = 0;
  let total = 0;
  let spots = 0;
  for (const rows of Object.values(forecasts ?? {})) {
    if (!Array.isArray(rows)) continue;
    let spotBanded = 0;
    for (const row of rows) {
      total += 1;
      if (row && Array.isArray(row.ens)) spotBanded += 1;
    }
    banded += spotBanded;
    if (spotBanded > 0) spots += 1;
  }
  return { spots, banded, total };
}

module.exports = {
  ENSEMBLE_FIELDS,
  MIN_MEMBERS,
  MAX_MEMBERS,
  DECIMALS,
  DEAD_SERIES_MIN_HOURS,
  quantile,
  quantileTriple,
  indexByTime,
  readMembers,
  isDeadSeries,
  liveModels,
  buildEnsembleEntry,
  attachEnsemble,
  validateEnsembleEntry,
  ensembleCoverage,
};
