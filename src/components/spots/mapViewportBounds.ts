import type { Spot } from '@/types';
import { getMacroRegion } from '@/lib/regions';
import { DEFAULT_REGION } from '@/lib/gridFilters';

const ISLAND_MACRO_REGIONS = new Set(['Açores', 'Madeira']);

/** Keep initial fitBounds on continental PT unless the user filters to islands. */
export function includeSpotInViewportBounds(
  spot: Spot,
  selectedRegion: string,
): boolean {
  const macro = getMacroRegion(spot.region);
  if (selectedRegion === 'Açores' || selectedRegion === 'Madeira') {
    return macro === selectedRegion;
  }
  if (selectedRegion !== DEFAULT_REGION && selectedRegion !== 'Todos') {
    return macro === selectedRegion;
  }
  return !ISLAND_MACRO_REGIONS.has(macro);
}
