import { describe, it, expect } from 'vitest';
import {
  readGridFiltersFromUrl,
  buildGridFiltersSearch,
  DEFAULT_SPORT,
  DEFAULT_REGION,
} from '@/lib/gridFilters';

const REGIONS = ['Todos', 'Norte', 'Centro', 'Lisboa', 'Algarve'] as const;

describe('readGridFiltersFromUrl', () => {
  it('returns defaults when search string is empty', () => {
    const result = readGridFiltersFromUrl('', REGIONS);
    expect(result).toEqual({ sport: DEFAULT_SPORT, region: DEFAULT_REGION });
  });

  it('parses a valid sport parameter', () => {
    const result = readGridFiltersFromUrl('?sport=kitesurf', REGIONS);
    expect(result.sport).toBe('kitesurf');
  });

  it('ignores an invalid sport parameter', () => {
    const result = readGridFiltersFromUrl('?sport=invalid', REGIONS);
    expect(result.sport).toBe(DEFAULT_SPORT);
  });

  it('parses a valid region parameter', () => {
    const result = readGridFiltersFromUrl('?region=Norte', REGIONS);
    expect(result.region).toBe('Norte');
  });

  it('decodes URI-encoded region parameter', () => {
    const result = readGridFiltersFromUrl('?region=Algarve', REGIONS);
    expect(result.region).toBe('Algarve');
  });

  it('ignores a region not in the allowed list', () => {
    const result = readGridFiltersFromUrl('?region=Unknown', REGIONS);
    expect(result.region).toBe(DEFAULT_REGION);
  });

  it('parses both sport and region together', () => {
    const result = readGridFiltersFromUrl('?sport=surf&region=Lisboa', REGIONS);
    expect(result).toEqual({ sport: 'surf', region: 'Lisboa' });
  });

  it('accepts all valid sport filter values', () => {
    const validSports = ['all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'big-wave', 'foil', 'sup', 'wakeboard'];
    for (const sport of validSports) {
      const result = readGridFiltersFromUrl(`?sport=${sport}`, REGIONS);
      expect(result.sport).toBe(sport);
    }
  });
});

describe('buildGridFiltersSearch', () => {
  it('returns empty string for default values', () => {
    expect(buildGridFiltersSearch(DEFAULT_SPORT, DEFAULT_REGION, REGIONS)).toBe('');
  });

  it('includes sport when not default', () => {
    const qs = buildGridFiltersSearch('surf', DEFAULT_REGION, REGIONS);
    expect(qs).toBe('?sport=surf');
  });

  it('includes region when not default and in list', () => {
    const qs = buildGridFiltersSearch(DEFAULT_SPORT, 'Norte', REGIONS);
    expect(qs).toBe('?region=Norte');
  });

  it('omits region when not in allowed list', () => {
    const qs = buildGridFiltersSearch(DEFAULT_SPORT, 'Unknown', REGIONS);
    expect(qs).toBe('');
  });

  it('includes both sport and region', () => {
    const qs = buildGridFiltersSearch('windsurf', 'Algarve', REGIONS);
    expect(qs).toContain('sport=windsurf');
    expect(qs).toContain('region=Algarve');
  });
});
