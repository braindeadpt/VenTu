/**
 * Freshness gate for IH tide-gauge overlay.
 *
 * Open-Meteo sea_level_height_msl is the product tide (phase / next high-low).
 * IH lastObs is an optional observed height — never attach it when the
 * observation itself is older than MAX_OBS_AGE_HOURS (outage reuse of
 * ih-tides.json must not look like a live gauge).
 */

const MAX_OBS_AGE_HOURS = 6;

/**
 * @param {unknown} lastData ISO timestamp from the station (lastData / last_date_time)
 * @param {number} [nowMs]
 * @param {number} [maxHours]
 * @returns {boolean}
 */
function isFreshIhObservation(lastData, nowMs = Date.now(), maxHours = MAX_OBS_AGE_HOURS) {
  if (typeof lastData !== 'string' || !lastData.trim()) return false;
  const t = new Date(lastData).getTime();
  if (Number.isNaN(t)) return false;
  const ageHours = (nowMs - t) / 3_600_000;
  // Reject future timestamps (clock skew / corrupt payload) and anything older than TTL.
  if (ageHours < 0) return false;
  return ageHours <= maxHours;
}

module.exports = { isFreshIhObservation, MAX_OBS_AGE_HOURS };
