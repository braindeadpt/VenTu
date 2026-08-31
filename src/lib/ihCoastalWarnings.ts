/**
 * IH coastal navigation warnings (nav_warning_coastal) — Avisos à Navegação
 * Costeiros em vigor, baked by scripts/fetch-ih-coastal-warnings.js into
 * ih-coastal-warnings.json with a per-spot coverage map (point-in-polygon).
 *
 * Complement to IPMA/MeteoAlarm (meteorology) focused on maritime safety:
 * exercises, hazards, restrictions. The spot page shows only the warnings
 * whose polygons actually cover the spot.
 */
import { getAssetPath } from '@/lib/paths';

export interface CoastalNavWarning {
  id: number;
  ref: string;
  category: string;
  url: string;
}

export type CoastalWarningsFile = {
  warnings?: CoastalNavWarning[];
  /** spotId → warning ids covering it. */
  coverage?: Record<string, number[]>;
  fetchedAt?: string;
  sourceCollection?: string;
};

let warningsCache: CoastalWarningsFile | null = null;
let warningsInflight: Promise<CoastalWarningsFile | null> | null = null;

/**
 * Fetch ih-coastal-warnings.json once per session. Missing file / errors →
 * null (the UI hides the block — never breaks the page).
 */
export async function loadCoastalNavWarnings(
  fetchImpl: typeof fetch = fetch,
): Promise<CoastalWarningsFile | null> {
  if (warningsCache) return warningsCache;
  if (warningsInflight) return warningsInflight;

  const promise = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/ih-coastal-warnings.json'));
      if (!res.ok) return null;
      return (await res.json()) as CoastalWarningsFile;
    } catch {
      return null;
    }
  })().finally(() => {
    warningsInflight = null;
  });

  warningsInflight = promise;
  promise.then((v) => {
    warningsCache = v;
  });
  return promise;
}

/** Warnings covering a spot (resolved from coverage ids), or null. */
export function warningsForSpot(
  file: CoastalWarningsFile | null,
  spotId: string,
): CoastalNavWarning[] | null {
  if (!file?.warnings || !file.coverage) return null;
  const ids = file.coverage[spotId];
  if (!ids || ids.length === 0) return null;
  const byId = new Map(file.warnings.map((w) => [w.id, w]));
  const out = ids
    .map((id) => byId.get(id))
    .filter((w): w is CoastalNavWarning => Boolean(w));
  return out.length > 0 ? out : null;
}

/** Test hook: clear the module cache between tests. */
export function clearCoastalNavWarningsCache(): void {
  warningsCache = null;
  warningsInflight = null;
}
