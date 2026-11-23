/**
 * Multi-model wind blend for scoring (Open-Meteo).
 * Unbiased wind blend:
 * - When ICON-EU (~7 km Europe) is live: 65 % ICON-EU + 35 % best_match in speed,
 *   gust and unit-vector direction while directions agree (≤ 60°) or either model
 *   is calm (< 0.5 m/s, where direction is undefined noise); when directions
 *   diverge (> 60°), publishes one member's complete vector (speed, direction,
 *   gust) — base wins only with a full triple and a stronger gust than ICON-EU.
 * - Without ICON-EU (e.g. Açores): median speed + unit-vector mean direction;
 *   gust = conservative max(median gust, median speed + median excess).
 * - Matches hourly rows by timestamp (never blind array index) and preserves null.
 */

const { indexByTime, liveModels } = require('./ensembleQuantiles');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ICON_WEIGHT = 0.65;
/** Acima deste desvio angular entre modelos, evita cancelar vetores ou misturar rajadas: usa o vetor completo de maior resolução (ICON-EU). */
const MAX_COHERENT_DIR_DIFF_DEG = 60;

/** Menor diferença angular entre duas direções (0..180°). */
function angularDiffDeg(a, b) {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

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
  const baseDir = hasBaseDir ? bestMatchDirDeg : null;
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
    const hasIconGust = iconGust != null && Number.isFinite(iconGust);
    // Com calmaria (< 0.5 m/s) num dos modelos a direção é ruído, não divergência.
    const calmEither = hasBaseSpeed && (iconSpeed < 0.5 || baseSpeed < 0.5);
    const coherentDir =
      hasBaseSpeed &&
      (calmEither || (hasBaseDir && angularDiffDeg(useDir, baseDir) <= MAX_COHERENT_DIR_DIFF_DEG));
    if (coherentDir) {
      // Direções concordantes (≤ 60°) ou calmaria num dos modelos: combina velocidade e
      // rajada 65/35; em calmaria usa a direção do modelo com vento, senão vetor unitário.
      windSpeed = ICON_WEIGHT * iconSpeed + (1 - ICON_WEIGHT) * baseSpeed;
      if (calmEither) {
        // Direção do modelo com vento; se esse não tiver direção, usa a do outro.
        windDirection = iconSpeed >= baseSpeed ? useDir : hasBaseDir ? baseDir : useDir;
      } else {
        const [u1, v1] = toUv(ICON_WEIGHT, useDir);
        const [u0, v0] = toUv(1 - ICON_WEIGHT, baseDir);
        windDirection = fromUv(u1 + u0, v1 + v0).dir;
      }
      const rawGust = hasIconGust
        ? hasBaseGust
          ? ICON_WEIGHT * iconGust + (1 - ICON_WEIGHT) * baseGust
          : iconGust
        : baseGust;
      windGust = Math.max(rawGust, windSpeed * 1.1);
    } else {
      // Direções divergentes (> 60°) ou sem base: publica o vetor COMPLETO
      // (velocidade, direção, rajada) de UM membro — triplos sempre reais do
      // mesmo modelo. O best_match só é elegível com vetor completo (velocidade
      // + direção + rajada) e rajada superior à do ICON-EU; sem direção ou
      // rajada própria, ou em empate, fica o ICON-EU (maior resolução ~7 km).
      const baseComplete = hasBaseSpeed && hasBaseDir && hasBaseGust;
      const baseWins = baseComplete && (!hasIconGust || baseGust > iconGust);
      if (baseWins) {
        windSpeed = baseSpeed;
        windDirection = baseDir;
        windGust = Math.max(baseGust, windSpeed * 1.1);
      } else {
        windSpeed = iconSpeed;
        windDirection = Number.isFinite(iconDir) ? iconDir : null;
        const rawGust = hasIconGust ? iconGust : iconSpeed;
        windGust = Math.max(rawGust, windSpeed * 1.1);
      }
    }
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
    // A nota penaliza rajada absoluta e excesso relativo separadamente: publica a
    // estimativa mais conservadora entre a mediana das rajadas e a mediana do
    // excesso (gust - speed) sobre a velocidade mediana.
    const excesses = [];
    for (const [m, sp] of Object.entries(speedByModel)) {
      const g = gustByModel[m];
      if (Number.isFinite(sp) && Number.isFinite(g)) excesses.push(Math.max(0, g - sp));
    }
    if (hasBaseSpeed && hasBaseGust) excesses.push(Math.max(0, baseGust - baseSpeed));
    const medExcess = median(excesses) ?? 0;
    windGust = Math.max(medGust, windSpeed + medExcess, windSpeed * 1.1);
  }

  const blended =
    hasBaseSpeed &&
    (Math.abs(windSpeed - baseSpeed) > 0.05 || (hasBaseGust && Math.abs(windGust - baseGust) > 0.05));

  return {
    windSpeed: Math.round(windSpeed * 1000) / 1000,
    windDirection:
      windDirection == null ? null : Math.round((((windDirection % 360) + 360) % 360) * 10) / 10,
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
