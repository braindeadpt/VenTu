/**
 * Multi-model wind blend for scoring (Open-Meteo).
 * Prefer ICON-EU (~7 km Europe) when present; never invent above model max;
 * never weaken best_match when models agree lower (floor at best_match).
 */

/**
 * @param {number[]} values
 * @returns {number | null}
 */
function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Read per-model series at index from Open-Meteo multi-model hourly.
 * @param {object} hourly
 * @param {string} baseKey e.g. wind_speed_10m
 * @param {string[]} models
 * @param {number} index
 * @returns {Record<string, number>}
 */
function readModelMap(hourly, baseKey, models, index) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!hourly) return out;
  for (const model of models) {
    const v = hourly[`${baseKey}_${model}`]?.[index];
    if (v != null && Number.isFinite(v)) out[model] = v;
  }
  return out;
}

/**
 * Blend forecast wind for sport scores.
 * @param {number} bestMatchSpeedMs
 * @param {number} bestMatchDirDeg
 * @param {number} bestMatchGustMs
 * @param {Record<string, number>} speedByModel
 * @param {Record<string, number>} dirByModel
 * @param {Record<string, number>} gustByModel
 */
function blendWindAtIndex(
  bestMatchSpeedMs,
  bestMatchDirDeg,
  bestMatchGustMs,
  speedByModel,
  dirByModel,
  gustByModel,
) {
  const speeds = Object.values(speedByModel);
  if (!speeds.length) {
    return {
      windSpeed: bestMatchSpeedMs,
      windDirection: bestMatchDirDeg,
      windGust: bestMatchGustMs,
      method: 'best_match',
      blended: false,
    };
  }

  const iconSpeed = speedByModel.icon_eu;
  const med = median(speeds);
  const preferred =
    iconSpeed != null && Number.isFinite(iconSpeed) ? iconSpeed : med;
  const method =
    iconSpeed != null && Number.isFinite(iconSpeed) ? 'icon_eu_floor' : 'median_floor';

  // Floor at best_match so blend never weakens the default product wind.
  const windSpeed = Math.max(bestMatchSpeedMs, preferred ?? bestMatchSpeedMs);

  let windDirection = bestMatchDirDeg;
  if (method === 'icon_eu_floor' && Number.isFinite(dirByModel.icon_eu)) {
    windDirection = dirByModel.icon_eu;
  } else if (Number.isFinite(med) && preferred === med) {
    // Keep best_match direction when using median (dirs don't average well).
    windDirection = bestMatchDirDeg;
  }

  const modelGusts = Object.values(gustByModel).filter(Number.isFinite);
  const preferredGust =
    method === 'icon_eu_floor' && Number.isFinite(gustByModel.icon_eu)
      ? gustByModel.icon_eu
      : modelGusts.length
        ? Math.max(...modelGusts)
        : bestMatchGustMs;
  const windGust = Math.max(bestMatchGustMs, preferredGust, windSpeed * 1.1);

  const blended =
    Math.abs(windSpeed - bestMatchSpeedMs) > 0.05 ||
    Math.abs(windGust - bestMatchGustMs) > 0.05;

  return {
    windSpeed: Math.round(windSpeed * 1000) / 1000,
    windDirection: Math.round(windDirection * 10) / 10,
    windGust: Math.round(windGust * 1000) / 1000,
    method,
    blended,
    iconEuMs: iconSpeed ?? null,
    medianMs: med,
    modelCount: speeds.length,
  };
}

/**
 * Apply blend across hourly arrays aligned with best_match weather.
 * Mutates `hours` entries in place when models available.
 * @param {Array<{ windSpeed: number; windDirection: number; windGust: number }>} hours
 * @param {object} windModelsHourly Open-Meteo multi-model hourly
 * @param {string[]} models
 * @returns {{ blendedHours: number; method: string }}
 */
function applyWindBlendToHours(hours, windModelsHourly, models) {
  if (!windModelsHourly?.time || !hours?.length) {
    return { blendedHours: 0, method: 'best_match' };
  }

  let blendedHours = 0;
  let lastMethod = 'best_match';
  const n = Math.min(hours.length, windModelsHourly.time.length);

  for (let i = 0; i < n; i++) {
    const speeds = readModelMap(windModelsHourly, 'wind_speed_10m', models, i);
    const dirs = readModelMap(windModelsHourly, 'wind_direction_10m', models, i);
    const gusts = readModelMap(windModelsHourly, 'wind_gusts_10m', models, i);
    const out = blendWindAtIndex(
      hours[i].windSpeed,
      hours[i].windDirection,
      hours[i].windGust,
      speeds,
      dirs,
      gusts,
    );
    hours[i].windSpeed = out.windSpeed;
    hours[i].windDirection = out.windDirection;
    hours[i].windGust = out.windGust;
    if (out.blended) blendedHours++;
    lastMethod = out.method;
  }

  return { blendedHours, method: lastMethod };
}

module.exports = {
  median,
  readModelMap,
  blendWindAtIndex,
  applyWindBlendToHours,
};
