import type { Spot } from '@/types';

/** Spot id used in conditions.json / forecasts.json (may differ from map pin id). */
export function getConditionsDataId(spot: Pick<Spot, 'id' | 'conditionsSource'>): string {
  return spot.conditionsSource ?? spot.id;
}

export function resolveConditionsEntry<T>(
  spot: Pick<Spot, 'id' | 'conditionsSource'>,
  data: Record<string, T>,
): T | undefined {
  const sourceId = getConditionsDataId(spot);
  return data[sourceId] ?? data[spot.id];
}
