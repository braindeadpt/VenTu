import type { GridSportFilter } from '@/lib/sportRatings';

export const DEFAULT_SPORT: GridSportFilter = 'all';
export const DEFAULT_REGION = 'Todos';
/**
 * Pseudo-região «Continente» — só o mapa a expõe (pill «Continente» e opção
 * do select). Filtra tudo o que não é Açores nem Madeira.
 */
export const MAINLAND_REGION = 'Continente';

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
  // `URLSearchParams.get` já devolve o valor descodificado — um segundo
  // decodeURIComponent rebentava com URIError em `?region=50%`.
  if (regionParam && regions.includes(regionParam)) {
    region = regionParam;
  }

  return { sport, region };
}

export function buildGridFiltersSearch(
  sport: GridSportFilter,
  region: string,
  regions: readonly string[],
): string {
  const params = new URLSearchParams();

  // Always persist sport — including `all` — so homepage can distinguish
  // explicit «Todos» from a missing param (which falls back to surf).
  params.set('sport', sport);
  if (region !== DEFAULT_REGION && regions.includes(region)) {
    params.set('region', region);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Escreve sport/region por cima da query EXISTENTE — os restantes params
 * (camadas, `spot`, `lat`/`lon`/`z`, `t`, `basemap`…) ficam intactos.
 */
export function mergeGridFiltersSearch(
  currentSearch: string,
  sport: GridSportFilter,
  region: string,
  regions: readonly string[],
): string {
  const params = new URLSearchParams(currentSearch);
  params.set('sport', sport);
  if (region !== DEFAULT_REGION && regions.includes(region)) {
    params.set('region', region);
  } else {
    params.delete('region');
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

  const search = mergeGridFiltersSearch(window.location.search, sport, region, regions);
  const newUrl = `${window.location.pathname}${search}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (current !== newUrl) {
    window.history.replaceState(null, '', newUrl);
  }
}

export function readGridFiltersFromWindow(regions: readonly string[]) {
  return readGridFiltersFromUrl(window.location.search, regions);
}
