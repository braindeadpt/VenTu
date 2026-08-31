/**
 * Coastal isobaths (IH depcnt_8_16_30) — real seabed depth contours near the
 * beach, baked by scripts/fetch-ih-isobaths.js into spot-isobaths.json as
 * `spots[spotId][depth] = km` (distance from the shore point to the nearest
 * 8/16/30 m contour).
 *
 * The UI shows this as a discreet «Fundo perto da praia» readout — e.g.
 * «8 m a 0.25 km · 16 m a 0.31 km · 30 m a 0.46 km» for Nazaré, where the
 * seabed shelves fast. Loaded client-side with a session cache (single fetch
 * per session), mirroring waveBias/buoyLayerHealth.
 */
import { getAssetPath } from '@/lib/paths';

export type IsobathsFile = {
  spots?: Record<string, Record<number, number>>;
  fetchedAt?: string;
  sourceCollection?: string;
  depths?: number[];
};

let isobathsCache: IsobathsFile | null = null;
let isobathsInflight: Promise<IsobathsFile | null> | null = null;

/** Depths shown in order (8 → 16 → 30 m). */
export const ISOBATH_DEPTHS = [8, 16, 30] as const;
export type IsobathDepth = (typeof ISOBATH_DEPTHS)[number];

/**
 * Fetch spot-isobaths.json once per session. Missing file / errors → null
 * (the UI hides the strip — never breaks the page).
 */
export async function loadSpotIsobaths(
  fetchImpl: typeof fetch = fetch,
): Promise<IsobathsFile | null> {
  if (isobathsCache) return isobathsCache;
  if (isobathsInflight) return isobathsInflight;

  const promise = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/spot-isobaths.json'));
      if (!res.ok) return null;
      return (await res.json()) as IsobathsFile;
    } catch {
      return null;
    }
  })().finally(() => {
    isobathsInflight = null;
  });

  isobathsInflight = promise;
  promise.then((v) => {
    isobathsCache = v;
  });
  return promise;
}

/** Distances for a spot (depth → km), or null. */
export function isobathDistancesForSpot(
  file: IsobathsFile | null,
  spotId: string,
): Record<number, number> | null {
  return file?.spots?.[spotId] ?? null;
}

/** Test hook: clear the module cache between tests. */
export function clearSpotIsobathsCache(): void {
  isobathsCache = null;
  isobathsInflight = null;
}
