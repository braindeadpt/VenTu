import { describe, it, expect } from 'vitest';
import { getConditionsDataId, resolveConditionsEntry } from './spotConditionsSource';
import type { Spot } from '@/types';

const aliasSpot = {
  id: 'foil-fao-cavado',
  conditionsSource: 'esposende',
} as Pick<Spot, 'id' | 'conditionsSource'>;

describe('spotConditionsSource', () => {
  it('returns conditionsSource when set', () => {
    expect(getConditionsDataId(aliasSpot)).toBe('esposende');
  });

  it('falls back to spot id', () => {
    expect(getConditionsDataId({ id: 'esposende' })).toBe('esposende');
  });

  it('resolves entry from source id', () => {
    const data = { esposende: { windSpeed: 12 } };
    expect(resolveConditionsEntry(aliasSpot, data)).toEqual({ windSpeed: 12 });
  });
});
