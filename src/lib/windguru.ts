/**
 * External Windguru links only — no embed until terms of use are reviewed.
 *
 * Curated spot IDs open the correct forecast page; others fall back to search.
 * TODO: Evaluate WRF 9km iframe embed against Windguru ToS / licensing.
 */

/** Windguru spot page IDs — https://www.windguru.cz/{id} */
export const SPOT_WINDGURU_IDS: Record<string, string> = {
  cabedelo: '54473',
  'foil-cabedelo': '54473',
  'cabedelo-wakepark': '54473',
};

export function getWindguruSpotUrl(spotId: string): string | null {
  const id = SPOT_WINDGURU_IDS[spotId];
  return id ? `https://www.windguru.cz/${id}` : null;
}

export function getWindguruSearchUrl(spotName: string, lat: number, lon: number): string {
  const q = encodeURIComponent(`${spotName} ${lat.toFixed(4)},${lon.toFixed(4)}`);
  return `https://www.windguru.cz/search.php?s=${q}`;
}

/** Direct forecast page when curated; otherwise geographic search. */
export function getWindguruUrl(
  slug: string,
  spotName: string,
  lat: number,
  lon: number,
): string {
  return getWindguruSpotUrl(slug) ?? getWindguruSearchUrl(spotName, lat, lon);
}
