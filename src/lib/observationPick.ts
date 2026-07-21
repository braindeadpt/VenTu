import { OBSERVED_FRESH_MAX_HOURS, type ObservedConditions } from '@/lib/observations';

export const MAX_OBSERVATION_DISTANCE_KM = 30;
/** METAR may reach island spots slightly farther (e.g. Seixal–LPMA). */
export const MAX_METAR_OBSERVATION_DISTANCE_KM = 35;

/** Within this km, prefer Ecowitt > IPMA > METAR over raw distance. */
export const SOURCE_DISTANCE_TIE_KM = 8;

const SOURCE_RANK: Record<string, number> = { ecowitt: 0, ipma: 1, metar: 2 };

export function isFreshObservation(
  observedAt: string,
  maxHours = OBSERVED_FRESH_MAX_HOURS,
): boolean {
  const ms = Date.now() - new Date(observedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return false;
  return ms / 3_600_000 <= maxHours;
}

function sourceRank(source: string): number {
  return SOURCE_RANK[source] ?? 9;
}

function maxDistanceForSource(source: string): number {
  return source === 'metar'
    ? MAX_METAR_OBSERVATION_DISTANCE_KM
    : MAX_OBSERVATION_DISTANCE_KM;
}

/**
 * Nearest station wins when clearly closer; within ~8 km prefer better source type;
 * equal → freshest snapshot.
 */
export function pickBestObservation(
  ...candidates: (ObservedConditions | null | undefined)[]
): ObservedConditions | null {
  const eligible = candidates.filter((o): o is ObservedConditions => {
    if (!o) return false;
    return (
      o.distanceKm <= maxDistanceForSource(o.source) &&
      isFreshObservation(o.observedAt)
    );
  });

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
