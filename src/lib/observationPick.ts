import { OBSERVED_FRESH_MAX_HOURS, type ObservedConditions } from '@/lib/observations';

export const MAX_OBSERVATION_DISTANCE_KM = 30;

export function isFreshObservation(
  observedAt: string,
  maxHours = OBSERVED_FRESH_MAX_HOURS,
): boolean {
  const ms = Date.now() - new Date(observedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return false;
  return ms / 3_600_000 <= maxHours;
}

/** Nearest station wins; equal distance → freshest snapshot. */
export function pickBestObservation(
  ...candidates: (ObservedConditions | null | undefined)[]
): ObservedConditions | null {
  const eligible = candidates.filter((o): o is ObservedConditions => {
    if (!o) return false;
    return (
      o.distanceKm <= MAX_OBSERVATION_DISTANCE_KM && isFreshObservation(o.observedAt)
    );
  });

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const dist = a.distanceKm - b.distanceKm;
    if (Math.abs(dist) > 0.05) return dist;
    return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
  });

  return eligible[0];
}
