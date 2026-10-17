const { applyWaveBias, MIN_BIAS_N, MIN_BIAS_M } = require('./buoyBias');

function confidenceFromPrevious(prev) {
  if (!prev?.confidenceDetail) {
    return {
      confidence: 'média',
      confidenceDetail: {
        waveSpread: 0,
        windSpread: 0,
        waveSpreadPct: 0,
        windSpreadPct: 0,
        combinedSpreadPct: 0,
        degraded: true,
      },
      dailyConfidence: prev?.dailyConfidence ?? [],
    };
  }
  return {
    confidence: prev.confidence ?? 'média',
    confidenceDetail: {
      waveSpread: prev.confidenceDetail.waveSpread ?? 0,
      windSpread: prev.confidenceDetail.windSpread ?? 0,
      waveSpreadPct: prev.confidenceDetail.waveSpreadPct ?? 0,
      windSpreadPct: prev.confidenceDetail.windSpreadPct ?? 0,
      combinedSpreadPct: prev.confidenceDetail.combinedSpreadPct ?? 0,
      degraded: true,
    },
    dailyConfidence: prev.dailyConfidence ?? [],
  };
}

function applyWaveBiasToRow(current, region, waveBias, enabled) {
  const clone = { ...current };
  const meta = applyWaveBias(clone, region, waveBias, enabled);
  return meta ? { ...clone, waveBias: meta } : clone;
}

function applyAliasSpots(aliasSpots, allConditions, allForecasts, log = console) {
  const copied = [];
  for (const spot of aliasSpots) {
    const srcId = spot.conditionsSource;
    if (!allConditions[srcId]) {
      log.error(`  ✗ ${spot.id}: conditionsSource "${srcId}" not found — fetch source spot first`);
      continue;
    }
    allConditions[spot.id] = JSON.parse(JSON.stringify(allConditions[srcId]));
    allForecasts[spot.id] = allForecasts[srcId];
    copied.push(spot.id);
    log.log(`  ↳ ${spot.id} ← ${srcId} (no API)`);
  }
  return copied;
}

function wavePowerKwPerM(heightM, periodS) {
  if (!heightM || !periodS || heightM <= 0 || periodS <= 0) return 0;
  return 0.5 * heightM * heightM * periodS;
}

const SWELL_TRAIN_MIN_HEIGHT_M = 0.1;

function wavePowerFromMarine({ swellHeight, swellPeriod, waveHeight, wavePeriod }) {
  if (swellHeight > SWELL_TRAIN_MIN_HEIGHT_M && swellPeriod > 0) {
    return wavePowerKwPerM(swellHeight, swellPeriod);
  }
  return wavePowerKwPerM(waveHeight || 0, wavePeriod || 0);
}

function pickSwellTrain(height, period, direction) {
  if (height == null || height < SWELL_TRAIN_MIN_HEIGHT_M || period == null || period <= 0) return null;
  return { height, period, direction: direction ?? 0 };
}

/**
 * Média de uma série horária (só valores finitos). Auditoria de dados 16/10
 * (A4): o `sea_level_height_msl` do Open-Meteo tem média a 7 dias de −0,35 a
 * −0,41 m na costa continental (devia andar perto de 0 numa série de maré),
 * por isso o site mostrava as marés ~0,45 m abaixo do real. Retira-se a média
 * da série (168 h ≈ 13,5 ciclos M2) antes de somar o nível médio de cada porto
 * (`src/lib/horaSpot.ts`). Com menos de `minN` valores (pouco mais de 2 ciclos
 * M2), devolve `null` e a série não se desloca.
 * @param {Array<unknown>} values
 * @param {number} [minN]
 * @returns {number | null}
 */
function seriesMean(values, minN = 25) {
  if (!Array.isArray(values)) return null;
  let s = 0;
  let n = 0;
  for (const v of values) {
    if (v == null) continue;
    const x = Number(v);
    if (Number.isFinite(x)) {
      s += x;
      n += 1;
    }
  }
  return n >= minN ? s / n : null;
}

/** Valor finito da série, ou `null` (nunca 0 inventado; auditoria 16/10, M2). */
function finiteOrNull(v) {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Altura de maré relativa ao nível médio da série (m, 3 casas), ou `null`. */
function tideFromSeries(seaLevel, mean) {
  const x = finiteOrNull(seaLevel);
  if (x == null) return null;
  return Math.round((x - (mean ?? 0)) * 1000) / 1000;
}

function getTideStatus(seaLevel, seaLevelNext) {
  const threshold = 0.5;
  if (seaLevel > threshold) return { status: 'high', label: 'Maré Alta' };
  if (seaLevel < -threshold) return { status: 'low', label: 'Maré Baixa' };
  if (seaLevelNext !== undefined && seaLevelNext > seaLevel) return { status: 'rising', label: 'Maré a Subir' };
  return { status: 'falling', label: 'Maré a Descer' };
}

/** UV da hora actual + máximo do dia de hoje (datas locais Europe/Lisbon do
 *  payload Open-Meteo — «hoje» é a data da hora corrente, não a data UTC do
 *  runner). Devolve {} quando a série uv_index não existe. */
function uvIndexFields(hourly, timeIndex) {
  const series = hourly?.uv_index;
  if (!Array.isArray(series)) return {};
  // Number(null) === 0 — um null da série é «sem dados», nunca «UV 0».
  const finite = (i) => series[i] != null && Number.isFinite(Number(series[i]));
  const out = {};
  if (finite(timeIndex)) out.uvIndex = Math.round(Number(series[timeIndex]) * 10) / 10;
  const today = typeof hourly.time?.[timeIndex] === 'string' ? hourly.time[timeIndex].slice(0, 10) : null;
  if (today) {
    let max = -Infinity;
    for (let i = 0; i < (hourly.time?.length ?? 0); i += 1) {
      if (hourly.time[i]?.slice(0, 10) !== today) continue;
      if (finite(i) && Number(series[i]) > max) max = Number(series[i]);
    }
    if (max > -Infinity) out.uvIndexMax = Math.round(max * 10) / 10;
  }
  return out;
}

module.exports = {
  seriesMean,
  finiteOrNull,
  tideFromSeries,
  MIN_BIAS_N,
  MIN_BIAS_M,
  confidenceFromPrevious,
  applyWaveBiasToRow,
  applyAliasSpots,
  wavePowerKwPerM,
  wavePowerFromMarine,
  pickSwellTrain,
  getTideStatus,
  uvIndexFields,
  SWELL_TRAIN_MIN_HEIGHT_M,
};
