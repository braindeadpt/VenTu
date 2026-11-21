import { describe, it, expect } from 'vitest';
import { checkConditionsStale, getSpotConditions, type PrecomputedConditions } from '@/lib/dataLoader';
import { spots } from '@/lib/spots';
import { getConditionsDataId } from '@/lib/spotConditionsSource';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const fresh = (minAgo = 0) => ({
  updatedAt: new Date(NOW - minAgo * 60_000).toISOString(),
  waveHeight: 1, wavePeriod: 8, waveDirection: 270, windSpeed: 10,
  windDirection: 225, windGust: 12, waterTemp: 16,
});

/** Conditions map keyed by each spot's conditionsSource alias. */
function byAlias(minAgo = 0): PrecomputedConditions {
  const file: PrecomputedConditions = {};
  for (const spot of spots) file[getConditionsDataId(spot)] = fresh(minAgo);
  return file;
}

describe('checkConditionsStale', () => {
  it('honours the conditionsSource alias (alias-keyed fresh data is not stale)', () => {
    expect(checkConditionsStale(byAlias(), 30, NOW)).toBe(false);
  });

  it('reports stale when a spot has no entry', () => {
    expect(checkConditionsStale({}, 30, NOW)).toBe(true);
  });

  it('reports stale when updatedAt is older than maxAge', () => {
    expect(checkConditionsStale(byAlias(120), 30, NOW)).toBe(true);
  });

  it('accepts entries keyed by plain spot id too', () => {
    const file: PrecomputedConditions = {};
    for (const spot of spots) file[spot.id] = fresh();
    expect(checkConditionsStale(file, 30, NOW)).toBe(false);
  });
});
