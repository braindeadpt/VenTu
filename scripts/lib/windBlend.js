/**
 * Multi-model wind blend for scoring (Open-Meteo).
 * Vector-coherent blend (u, v) without positive bias:
 * - When ICON-EU (~7 km Europe) is live: 65 % ICON-EU + 35 % best_match in (u, v)
 *   so speed and direction always come from the same coherent wind vector.
 * - Without ICON-EU (e.g. Açores): median speed/gust across live models + best_match
 *   and unit-vector mean direction — never Math.max across all gusts.
 * - Matches hourly rows by timestamp (never blind array index) and preserves null.
 */

const { indexByTime, liveModels } = require('./ensembleQuantiles');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ICON_WEIGHT = 0.65;

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

/** Meteorological direction (where wind comes FROM, deg) + speed → vector (u, v). */
function toUv(speed, dirDeg) {
  const rad = dirDeg * DEG2RAD;
  return [-speed * Math.sin(rad), -speed * Math.cos(rad)];
}

/** Vector (u, v) → meteorological direction (0..360) and speed. */
function fromUv(u, v) {
  const speed = Math.hypot(u, v);
  const dir = (Math.atan2(-u, -v) * RAD2DEG + 360) % 360;
  return { speed, dir };
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
  if (!hourly || index == null || index < 0) return out;
  for (const model of models) {
    const v = hourly[`${baseKey}_${model}`]?.[index];
    if (v != null && Number.isFinite(v)) out[model] = v;
  }
  return out;
}

/**
 * Blend forecast wind for sport scores without upward bias or mismatched vectors.
 * @param {number | null | undefined} bestMatchSpeedMs
 * @param {number | null | undefined} bestMatchDirDeg
 * @param {number | null | undefined} bestMatchGustMs
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
  const hasBaseSpeed = bestMatchSpeedMs != null && Number.isFinite(bestMatchSpeedMs);
  const hasBaseDir = bestMatchDirDeg != null && Number.isFinite(bestMatchDirDeg);
  const hasBaseGust = bestMatchGustMs != null && Number.isFinite(bestMatchGustMs);
  const speeds = Object.values(speedByModel).filter((v) => v != null && Number.isFinite(v));

  if (!hasBaseSpeed && !speeds.length) {
    return {
      windSpeed: null,
      windDirection: hasBaseDir ? bestMatchDirDeg : null,
      windGust: hasBaseGust ? bestMatchGustMs : null,
      method: 'best_match',
      blended: false,
    };
  }
  if (!speeds.length) {
    return {
      windSpeed: bestMatchSpeedMs,
      windDirection: bestMatchDirDeg,
      windGust: bestMatchGustMs,
      method: 'best_match',
      blended: false,
    };
  }

  const baseSpeed = hasBaseSpeed ? bestMatchSpeedMs : median(speeds);
  const baseDir = hasBaseDir ? bestMatchDirDeg : 0;
  const baseGust = hasBaseGust ? bestMatchGustMs : baseSpeed;

  const iconSpeed = speedByModel.icon_eu;
  const iconDir = dirByModel.icon_eu;
  const iconGust = gustByModel.icon_eu;
  const hasIcon = iconSpeed != null && Number.isFinite(iconSpeed);
  const med = median(speeds);

  let windSpeed;
  let windDirection = baseDir;
  let windGust;
  let method;

  if (hasIcon) {
    method = 'icon_eu_vector';
    const useDir = iconDir != null && Number.isFinite(iconDir) ? iconDir : baseDir;
    if (hasBaseSpeed && hasBaseDir) {
      const [u1, v1] = toUv(iconSpeed, useDir);
      const [u0, v0] = toUv(baseSpeed, baseDir);
      const res = fromUv(ICON_WEIGHT * u1 + (1 - ICON_WEIGHT) * u0, ICON_WEIGHT * v1 + (1 - ICON_WEIGHT) * v0);
      // Scalar weighted speed keeps magnitude unbiased even when two models disagree in direction;
      // direction comes strictly from the coherent weighted vector (u, v).
      windSpeed = ICON_WEIGHT * iconSpeed + (1 - ICON_WEIGHT) * baseSpeed;
      windDirection = res.speed > 0.05 ? res.dir : useDir;
    } else {
      windSpeed = iconSpeed;
      windDirection = useDir;
    }
    const rawGust =
      iconGust != null && Number.isFinite(iconGust)
        ? hasBaseGust
          ? ICON_WEIGHT * iconGust + (1 - ICON_WEIGHT) * baseGust
          : iconGust
        : baseGust;
    windGust = Math.max(rawGust, windSpeed * 1.1);
  } else {
    method = 'median_vector';
    const allSpeeds = hasBaseSpeed ? [...speeds, baseSpeed] : speeds;
    windSpeed = median(allSpeeds) ?? baseSpeed;
    // Unit-vector circular mean across available model directions (+ best_match)
    let su = 0;
    let sv = 0;
    let nd = 0;
    for (const [m, sp] of Object.entries(speedByModel)) {
      const d = dirByModel[m];
      if (Number.isFinite(sp) && Number.isFinite(d)) {
        const [u, v] = toUv(1, d);
        su += u;
        sv += v;
        nd++;
      }
    }
    if (hasBaseDir) {
      const [u, v] = toUv(1, baseDir);
      su += u;
      sv += v;
      nd++;
    }
    if (nd > 0 && Math.hypot(su, sv) > 0.1) {
      windDirection = fromUv(su, sv).dir;
    }
    const modelGusts = Object.values(gustByModel).filter(Number.isFinite);
    const allGusts = hasBaseGust ? [...modelGusts, baseGust] : modelGusts;
    const medGust = median(allGusts) ?? baseGust;
    windGust = Math.max(medGust, windSpeed * 1.1);
  }

  const blended =
    hasBaseSpeed &&
    (Math.abs(windSpeed - baseSpeed) > 0.05 || (hasBaseGust && Math.abs(windGust - baseGust) > 0.05));

  return {
    windSpeed: Math.round(windSpeed * 1000) / 1000,
    windDirection: Math.round(((windDirection % 360) + 360) % 360 * 10) / 10,
    windGust: Math.round(windGust * 1000) / 1000,
    method,
    blended,
    iconEuMs: hasIcon ? iconSpeed : null,
    medianMs: med,
    modelCount: speeds.length,
  };
}

/**
 * Apply blend across hourly arrays aligned by timestamp (fallback to index when
 * synthetic test rows omit `time`). Mutates `hours` entries in place when live
 * models exist; preserves `null` («sem dados») without turning it into 0.
 * @param {Array<{ time?: string; windSpeed: number | null; windDirection: number | null; windGust: number | null }>} hours
 * @param {object} windModelsHourly Open-Meteo multi-model hourly
 * @param {string[]} models
 * @returns {{ blendedHours: number; method: string }}
 */
function applyWindBlendToHours(hours, windModelsHourly, models) {
  if (!windModelsHourly?.time || !hours?.length) {
    return { blendedHours: 0, method: 'best_match' };
  }

  const active = liveModels(windModelsHourly, 'wind_speed_10m', models);
  if (!active.length) return { blendedHours: 0, method: 'best_match' };
  const timeIdx = indexByTime(windModelsHourly.time);

  let blendedHours = 0;
  let lastMethod = 'best_match';

  for (let i = 0; i < hours.length; i++) {
    const row = hours[i];
    if (!row || row.windSpeed == null || !Number.isFinite(row.windSpeed)) continue;
    const wi = typeof row.time === 'string' ? timeIdx.get(row.time) : i < windModelsHourly.time.length ? i : undefined;
    if (wi === undefined) continue;
    const speeds = readModelMap(windModelsHourly, 'wind_speed_10m', active, wi);
    const dirs = readModelMap(windModelsHourly, 'wind_direction_10m', active, wi);
    const gusts = readModelMap(windModelsHourly, 'wind_gusts_10m', active, wi);
    const out = blendWindAtIndex(row.windSpeed, row.windDirection, row.windGust, speeds, dirs, gusts);
    if (out.windSpeed != null) row.windSpeed = out.windSpeed;
    if (out.windDirection != null) row.windDirection = out.windDirection;
    if (out.windGust != null) row.windGust = out.windGust;
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
