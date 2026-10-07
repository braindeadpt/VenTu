import type { Spot } from '@/types';
import { getMacroRegion } from '@/lib/regions';
import { DEFAULT_REGION, MAINLAND_REGION } from '@/lib/gridFilters';

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
  if (selectedRegion === MAINLAND_REGION) {
    return !ISLAND_MACRO_REGIONS.has(macro);
  }
  if (selectedRegion !== DEFAULT_REGION && selectedRegion !== 'Todos') {
    return macro === selectedRegion;
  }
  return !ISLAND_MACRO_REGIONS.has(macro);
}

/**
 * Bounds fixos de cada território (os mesmos JUMPS da maquete). Servem de
 * enquadramento quando o filtro escolhido não tem spots (ex.: kitesurf nos
 * Açores) — o mapa vai na mesma ao território em vez de ficar parado.
 */
export const TERRITORY_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  [MAINLAND_REGION]: [[36.9, -9.6], [42.2, -7.3]],
  Açores: [[36.9, -31.4], [39.8, -24.9]],
  Madeira: [[32.55, -17.35], [33.15, -16.25]],
};

export function territoryBoundsFor(
  selectedRegion: string,
): [[number, number], [number, number]] | null {
  return TERRITORY_BOUNDS[selectedRegion] ?? null;
}
