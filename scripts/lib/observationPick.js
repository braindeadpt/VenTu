/**
 * Pick ground-truth observation for a spot: nearest station wins; tie → freshest.
 * Shared with src/lib/observationPick.ts (keep in sync).
 */

const { MAX_STATION_DISTANCE_KM, MAX_OBS_AGE_MS } = require('./ipma.js');

function isFreshObservedAt(observedAt, maxAgeMs = MAX_OBS_AGE_MS) {
  const ts = new Date(observedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

/**
 * @param {Array<Record<string, unknown> | null | undefined>} candidates ObservedConditions-shaped
 * @returns {object | null}
 */
function pickBestObservation(...candidates) {
  const eligible = candidates
    .filter(Boolean)
    .filter(
      (o) =>
        typeof o.distanceKm === 'number' &&
        o.distanceKm <= MAX_STATION_DISTANCE_KM &&
        isFreshObservedAt(o.observedAt),
    );

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const dist = a.distanceKm - b.distanceKm;
    if (Math.abs(dist) > 0.05) return dist;
    return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
  });

  return eligible[0];
}

module.exports = {
  pickBestObservation,
  isFreshObservedAt,
};
