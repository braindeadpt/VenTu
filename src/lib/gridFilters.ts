import type { GridSportFilter } from '@/lib/sportRatings';

export const DEFAULT_SPORT: GridSportFilter = 'all';
export const DEFAULT_REGION = 'Todos';

const VALID_FILTERS: GridSportFilter[] = [
  'all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'big-wave', 'foil', 'sup', 'wakeboard',
];

export function readGridFiltersFromUrl(
  search: string,
  regions: readonly string[],
): { sport: GridSportFilter; region: string } {
  const params = new URLSearchParams(search);
  const sportParam = params.get('sport');
  let sport: GridSportFilter = DEFAULT_SPORT;
  if (sportParam && VALID_FILTERS.includes(sportParam as GridSportFilter)) {
    sport = sportParam as GridSportFilter;
  }

  const regionParam = params.get('region');
  let region = DEFAULT_REGION;
  if (regionParam) {
    const decoded = decodeURIComponent(regionParam);
    if (regions.includes(decoded)) {
      region = decoded;
    }
  }

  return { sport, region };
}

export function buildGridFiltersSearch(
  sport: GridSportFilter,
  region: string,
  regions: readonly string[],
): string {
  const params = new URLSearchParams();

  if (sport !== DEFAULT_SPORT) {
    params.set('sport', sport);
  }
  if (region !== DEFAULT_REGION && regions.includes(region)) {
    params.set('region', region);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function syncGridFiltersToUrl(
  sport: GridSportFilter,
  region: string,
  regions: readonly string[],
): void {
  if (typeof window === 'undefined') return;

  const search = buildGridFiltersSearch(sport, region, regions);
  const newUrl = `${window.location.pathname}${search}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (current !== newUrl) {
    window.history.replaceState(null, '', newUrl);
  }
}

export function readGridFiltersFromWindow(regions: readonly string[]) {
  return readGridFiltersFromUrl(window.location.search, regions);
}
