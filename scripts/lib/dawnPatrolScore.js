'use strict';

/**
 * Dawn Patrol score recalibration — pure helpers shared with dawn-patrol.js.
 *
 * The morning advice used to score the Open-Meteo forecast with its own
 * heuristic (waves/period/wind → 0-100). This layer recalibrates that score
 * with the buoy layer, so the user sees the SAME correction the spot page
 * shows the next morning:
 *
 *  1. fresh observedWave in conditions.json (IH ≤3h, WMO/Copernicus ≤6h) →
 *     the measured height is the morning truth — source 'boia';
 *  2. else the row's `waveBias` meta (applied by the pipeline) → the regional
 *     ME shifts the morning forecast height — source 'viés regional';
 *  3. else forecast-only — source 'previsão' (no recalibration).
 *
 * Honesty rules mirror the UI: a fresh reading always wins; a row already
 * corrected by the pipeline is never double-corrected; the score only changes
 * when the correction is actually applied.
 */

const MIN_BIAS_N = 30;
const MIN_BIAS_M = 0.15;
const MAX_BIAS_M = 1.5;

/** Source-aware freshness gates — mirror src/lib/observedWave.ts. */
const MAX_AGE_HOURS = { 'ih-buoy': 3, 'wmo-buoy': 6 };

const round1 = (n) => Math.round(n * 10) / 10;

function isoAgeHours(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

function isFreshWave(observedWave, nowMs) {
  if (!observedWave || typeof observedWave !== 'object') return false;
  const age = isoAgeHours(observedWave.observedAt, nowMs);
  if (age === null || age < 0) return false;
  return age <= (MAX_AGE_HOURS[observedWave.source] ?? 3);
}

/**
 * The dawn scoring heuristic (waves 0-50, period 0-20, wind 0-30) — the same
 * formula findBestWindow used inline; extracted so the recalibrated score
 * recomputes it with the corrected height.
 * @param {{ waveHeight: number, wavePeriod: number, windSpeed: number }} c
 * @returns {number} 0-100
 */
function morningScore(c) {
  let score = 0;
  if (c.waveHeight >= 1.0 && c.waveHeight <= 2.5) score += 30 + c.waveHeight * 8;
  else if (c.waveHeight > 2.5) score += 40;
  else score += c.waveHeight * 20;

  if (c.wavePeriod >= 10) score += 20;
  else if (c.wavePeriod >= 8) score += 15;
  else score += c.wavePeriod * 1.5;

  const windKnots = c.windSpeed * 1.94384;
  if (windKnots < 10) score += 25;
  else if (windKnots < 15) score += 18;
  else if (windKnots < 20) score += 10;
  else score += 5;

  return Math.round(score);
}

/**
 * Resolve the recalibration for a spot's morning best window from the
 * committed conditions.json (the same file the spot page reads). Returns null
 * when no correction applies (forecast-only).
 *
 * @param {{ slug: string, region?: string, conditionsSource?: string }} spot
 * @param {{ waveHeight: number }} bestWindow morning best window (forecast)
 * @param {Record<string, unknown> | null} conditionsJson conditions.json
 * @param {number} [nowMs]
 * @returns {null | { height: number, source: 'boia' | 'viés regional', meta: object }}
 */
function resolveMorningRecalibration(spot, bestWindow, conditionsJson, nowMs = Date.now()) {
  if (!spot?.slug || !bestWindow || !conditionsJson || typeof conditionsJson !== 'object') {
    return null;
  }
  const raw = Number(bestWindow.waveHeight);
  if (!Number.isFinite(raw) || raw < 0) return null;

  const row =
    conditionsJson[spot.slug] ??
    (spot.conditionsSource ? conditionsJson[spot.conditionsSource] : null);
  if (!row || typeof row !== 'object') return null;

  // 1) Leitura fresca — a verdade matinal; ganha sempre (mesma regra da UI).
  const observedWave = row.observedWave;
  if (isFreshWave(observedWave, nowMs)) {
    const h = Number(observedWave.waveHeight);
    if (Number.isFinite(h) && h >= 0) {
      const meta = {};
      if (typeof observedWave.stationName === 'string') meta.stationName = observedWave.stationName;
      if (typeof observedWave.distanceKm === 'number') meta.distanceKm = observedWave.distanceKm;
      return { height: h, source: 'boia', meta };
    }
  }

  // 2) Viés regional aplicado pela pipeline (meta na row) — nunca corrigir duas
  //    vezes; a mesma aritmética do buoyBias.applyWaveBias.
  const waveBias = row.waveBias;
  if (waveBias && typeof waveBias === 'object') {
    const me = Number(waveBias.me);
    const n = Number(waveBias.n);
    if (Number.isFinite(me) && Number.isInteger(n) && n >= MIN_BIAS_N) {
      const meAbs = Math.abs(me);
      if (meAbs >= MIN_BIAS_M && meAbs <= MAX_BIAS_M) {
        const corrected = Math.max(0.1, round1(raw + me));
        const deltaM = round1(corrected - raw);
        if (Math.abs(deltaM) >= 0.05) {
          return {
            height: corrected,
            source: 'viés regional',
            meta: { region: waveBias.region, me, n, deltaM },
          };
        }
      }
    }
  }

  return null;
}

module.exports = {
  MIN_BIAS_N,
  MIN_BIAS_M,
  MAX_BIAS_M,
  MAX_AGE_HOURS,
  morningScore,
  resolveMorningRecalibration,
};
