import { describe, it, expect } from 'vitest';
import {
  buildGridFiltersSearch,
  mergeGridFiltersSearch,
  readGridFiltersFromUrl,
} from '@/lib/gridFilters';

const REGIONS = ['Todos', 'Lisboa', 'Algarve', 'Açores'] as const;

describe('buildGridFiltersSearch', () => {
  it('persists sport=all so Todos is selectable on the homepage', () => {
    expect(buildGridFiltersSearch('all', 'Todos', REGIONS)).toBe('?sport=all');
  });

  it('persists specific sports', () => {
    expect(buildGridFiltersSearch('surf', 'Todos', REGIONS)).toBe('?sport=surf');
  });
});

describe('readGridFiltersFromUrl', () => {
  it('reads explicit all', () => {
    expect(readGridFiltersFromUrl('?sport=all', REGIONS).sport).toBe('all');
  });

  it('defaults to all when param missing', () => {
    expect(readGridFiltersFromUrl('', REGIONS).sport).toBe('all');
  });
});

describe('readGridFiltersFromUrl — region', () => {
  it('reads an encoded region once (URLSearchParams already decodes)', () => {
    expect(readGridFiltersFromUrl('?region=A%C3%A7ores', REGIONS).region).toBe('Açores');
  });

  it('does not throw on malformed percent-encoding (?region=50%)', () => {
    expect(() => readGridFiltersFromUrl('?region=50%', REGIONS)).not.toThrow();
    expect(readGridFiltersFromUrl('?region=50%', REGIONS).region).toBe('Todos');
    expect(readGridFiltersFromUrl('?region=%', REGIONS).region).toBe('Todos');
  });

  it('ignores unknown regions', () => {
    expect(readGridFiltersFromUrl('?region=Marte', REGIONS).region).toBe('Todos');
  });
});

describe('mergeGridFiltersSearch', () => {
  it('keeps layer / view / spot params intact', () => {
    const out = mergeGridFiltersSearch(
      '?radar=1&wind=1&lat=38.7&lon=-9.4&z=11&spot=nazare&t=14&basemap=sat',
      'surf',
      'Todos',
      REGIONS,
    );
    const p = new URLSearchParams(out);
    expect(p.get('sport')).toBe('surf');
    expect(p.get('radar')).toBe('1');
    expect(p.get('wind')).toBe('1');
    expect(p.get('lat')).toBe('38.7');
    expect(p.get('lon')).toBe('-9.4');
    expect(p.get('z')).toBe('11');
    expect(p.get('spot')).toBe('nazare');
    expect(p.get('t')).toBe('14');
    expect(p.get('basemap')).toBe('sat');
    expect(p.has('region')).toBe(false);
  });

  it('sets and clears region', () => {
    const withRegion = mergeGridFiltersSearch('?sport=all&radar=1', 'all', 'Açores', REGIONS);
    expect(new URLSearchParams(withRegion).get('region')).toBe('Açores');
    const cleared = mergeGridFiltersSearch(withRegion, 'all', 'Todos', REGIONS);
    expect(new URLSearchParams(cleared).has('region')).toBe(false);
    expect(new URLSearchParams(cleared).get('radar')).toBe('1');
  });

  it('overwrites a stale sport param', () => {
    expect(new URLSearchParams(mergeGridFiltersSearch('?sport=kitesurf', 'surf', 'Todos', REGIONS)).get('sport')).toBe('surf');
  });
});
