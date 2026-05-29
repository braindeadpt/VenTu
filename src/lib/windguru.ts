/**
 * External Windguru links only — no embed until terms of use are reviewed.
 *
 * TODO: Map stable Windguru station IDs per spot slug for direct forecast pages.
 * TODO: Evaluate WRF 9km iframe embed against Windguru ToS / licensing.
 */
export function getWindguruSearchUrl(spotName: string, lat: number, lon: number): string {
  const q = encodeURIComponent(`${spotName} ${lat.toFixed(4)},${lon.toFixed(4)}`);
  return `https://www.windguru.cz/search.php?s=${q}`;
}
