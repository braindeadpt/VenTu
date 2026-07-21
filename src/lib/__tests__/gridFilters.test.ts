import { describe, it, expect } from 'vitest';
import { buildGridFiltersSearch, readGridFiltersFromUrl } from '@/lib/gridFilters';

const REGIONS = ['Lisboa', 'Algarve'] as const;

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
