/**
 * Pick ground-truth observation for a spot: nearest station wins; tie → freshest.
 * Within ~8 km, prefer Ecowitt > IPMA > METAR (airports less coastal-representative).
 * Shared with src/lib/observationPick.ts (keep in sync).
 */

const { MAX_STATION_DISTANCE_KM, MAX_OBS_AGE_MS } = require('./ipma.js');
const { MAX_METAR_DISTANCE_KM_ISLANDS } = require('./metar.js');

/** Distance epsilon (km) below which source quality ranks first. */
const SOURCE_DISTANCE_TIE_KM = 8;

const SOURCE_RANK = { ecowitt: 0, ipma: 1, metar: 2 };

function isFreshObservedAt(observedAt, maxAgeMs = MAX_OBS_AGE_MS) {
  const ts = new Date(observedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

function sourceRank(source) {
  return SOURCE_RANK[source] ?? 9;
}

/** IPMA/Ecowitt ≤30 km; METAR ≤35 km (island Madeira/Açores edge cases). */
function maxDistanceForSource(source) {
  return source === 'metar' ? MAX_METAR_DISTANCE_KM_ISLANDS : MAX_STATION_DISTANCE_KM;
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
        o.distanceKm <= maxDistanceForSource(o.source) &&
        isFreshObservedAt(o.observedAt),
    );

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const dist = a.distanceKm - b.distanceKm;
    if (Math.abs(dist) > SOURCE_DISTANCE_TIE_KM) return dist;
    const rank = sourceRank(a.source) - sourceRank(b.source);
    if (rank !== 0) return rank;
    if (Math.abs(dist) > 0.05) return dist;
    return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
  });

  return eligible[0];
}

module.exports = {
  pickBestObservation,
  isFreshObservedAt,
  SOURCE_DISTANCE_TIE_KM,
  SOURCE_RANK,
};
