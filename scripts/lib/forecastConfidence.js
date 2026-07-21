/**
 * Forecast confidence from multi-model spread (Open-Meteo).
 * Shared logic for update-conditions.js — mirrored in src/lib/forecastConfidence.ts
 */

/** @typedef {'alta' | 'média' | 'baixa'} ConfidenceTier */

/**
 * Tunable thresholds — combined normalized spread (0–1 scale).
 * @type {{ altaMax: number; baixaMin: number; minSpreadEpsilon: number }}
 */
const CONFIDENCE_CONFIG = {
  /** Combined spread below this → alta */
  altaMax: 0.15,
  /** Combined spread above this → baixa */
  baixaMin: 0.35,
  /** Avoid divide-by-zero when means are tiny */
  minSpreadEpsilon: 0.05,
};

const WAVE_MODELS = ['ecmwf_wam025', 'ncep_gfswave025', 'gwam'];
/** ICON-EU (~7 km) first — also used by windBlend for scoring wind. */
const WIND_MODELS = [
  'icon_eu',
  'ecmwf_ifs025',
  'gfs_seamless',
  'meteofrance_arpege_europe',
];

function readModelValues(hourly, baseKey, models, index) {
  const values = [];
  for (const model of models) {
    const key = `${baseKey}_${model}`;
    const v = hourly[key]?.[index];
    if (v != null && Number.isFinite(v)) values.push(v);
  }
  return values;
}

function numericSpread(values) {
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * @param {number} waveSpreadAbs
 * @param {number} windSpreadAbs
 * @param {number} waveMean
 * @param {number} windMean
 * @param {{ waveModelCount: number; windModelCount: number }} counts
 */
function buildConfidenceDetail(waveSpreadAbs, windSpreadAbs, waveMean, windMean, counts) {
  let waveSpreadPct = 0;
  let windSpreadPct = 0;

  if (counts.waveModelCount >= 2) {
    const wMean = Math.max(waveMean, CONFIDENCE_CONFIG.minSpreadEpsilon);
    waveSpreadPct = waveSpreadAbs / wMean;
  }
  if (counts.windModelCount >= 2) {
    const wMean = Math.max(windMean, CONFIDENCE_CONFIG.minSpreadEpsilon);
    windSpreadPct = windSpreadAbs / wMean;
  }

  const degraded =
    counts.waveModelCount < 2 ||
    counts.windModelCount < 2;

  let combinedSpreadPct = 0;
  if (counts.waveModelCount >= 2 && counts.windModelCount >= 2) {
    combinedSpreadPct = (waveSpreadPct + windSpreadPct) / 2;
  } else if (counts.waveModelCount >= 2) {
    combinedSpreadPct = waveSpreadPct;
  } else if (counts.windModelCount >= 2) {
    combinedSpreadPct = windSpreadPct;
  }

  /** @type {ConfidenceTier} */
  let confidence = 'média';
  if (!degraded) {
    if (combinedSpreadPct < CONFIDENCE_CONFIG.altaMax) confidence = 'alta';
    else if (combinedSpreadPct > CONFIDENCE_CONFIG.baixaMin) confidence = 'baixa';
    else confidence = 'média';
  }

  return {
    confidence,
    waveSpread: round2(waveSpreadAbs),
    windSpread: round2(windSpreadAbs),
    waveSpreadPct: round3(waveSpreadPct),
    windSpreadPct: round3(windSpreadPct),
    combinedSpreadPct: round3(combinedSpreadPct),
    degraded,
    waveModelCount: counts.waveModelCount,
    windModelCount: counts.windModelCount,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function confidenceAtIndex(marineMulti, weatherMulti, index) {
  const waveValues = readModelValues(marineMulti.hourly, 'wave_height', WAVE_MODELS, index);
  const windValues = readModelValues(weatherMulti.hourly, 'wind_speed_10m', WIND_MODELS, index);

  const waveSpreadAbs = numericSpread(waveValues);
  const windSpreadAbs = numericSpread(windValues);
  const waveMean =
    waveValues.length > 0 ? waveValues.reduce((a, b) => a + b, 0) / waveValues.length : 0;
  const windMean =
    windValues.length > 0 ? windValues.reduce((a, b) => a + b, 0) / windValues.length : 0;

  return buildConfidenceDetail(waveSpreadAbs, windSpreadAbs, waveMean, windMean, {
    waveModelCount: waveValues.length,
    windModelCount: windValues.length,
  });
}

function dateKey(isoTime) {
  return isoTime.slice(0, 10);
}

/**
 * Per-day confidence: daily mean per model, then spread across models.
 */
function confidenceByDay(marineMulti, weatherMulti) {
  const times = marineMulti?.hourly?.time || [];
  const byDate = new Map();

  for (let i = 0; i < times.length; i++) {
    const dk = dateKey(times[i]);
    if (!byDate.has(dk)) {
      byDate.set(dk, { waveByModel: {}, windByModel: {}, n: 0 });
    }
    const bucket = byDate.get(dk);
    bucket.n += 1;

    for (const model of WAVE_MODELS) {
      const v = marineMulti.hourly[`wave_height_${model}`]?.[i];
      if (v != null && Number.isFinite(v)) {
        if (!bucket.waveByModel[model]) bucket.waveByModel[model] = { sum: 0, c: 0 };
        bucket.waveByModel[model].sum += v;
        bucket.waveByModel[model].c += 1;
      }
    }
    for (const model of WIND_MODELS) {
      const v = weatherMulti.hourly[`wind_speed_10m_${model}`]?.[i];
      if (v != null && Number.isFinite(v)) {
        if (!bucket.windByModel[model]) bucket.windByModel[model] = { sum: 0, c: 0 };
        bucket.windByModel[model].sum += v;
        bucket.windByModel[model].c += 1;
      }
    }
  }

  const daily = [];
  for (const [date, bucket] of byDate) {
    const waveAvgs = Object.values(bucket.waveByModel).map((x) => x.sum / x.c);
    const windAvgs = Object.values(bucket.windByModel).map((x) => x.sum / x.c);
    const waveSpreadAbs = numericSpread(waveAvgs);
    const windSpreadAbs = numericSpread(windAvgs);
    const waveMean = waveAvgs.length ? waveAvgs.reduce((a, b) => a + b, 0) / waveAvgs.length : 0;
    const windMean = windAvgs.length ? windAvgs.reduce((a, b) => a + b, 0) / windAvgs.length : 0;

    const detail = buildConfidenceDetail(waveSpreadAbs, windSpreadAbs, waveMean, windMean, {
      waveModelCount: waveAvgs.length,
      windModelCount: windAvgs.length,
    });

    daily.push({
      date,
      confidence: detail.confidence,
      waveSpread: detail.waveSpread,
      windSpread: detail.windSpread,
      degraded: detail.degraded,
    });
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  return daily;
}

const { findCurrentHourIndex: findOpenMeteoHourIndex } = require('./openMeteoTime');

function findCurrentHourIndex(times) {
  return findOpenMeteoHourIndex(times);
}

module.exports = {
  CONFIDENCE_CONFIG,
  WAVE_MODELS,
  WIND_MODELS,
  confidenceAtIndex,
  confidenceByDay,
  findCurrentHourIndex,
};
