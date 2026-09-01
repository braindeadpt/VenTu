/**
 * Calibration PT-reference per region (buoy-coherence.json → regions[].calibrationRefs).
 *
 * The merge-observations records, per spot it recalibrated (ES read adjusted to a PT
 * reference), which PT buoy was used: region audit block `calibrationRefs` in
 * buoy-coherence.json. This module mirrors that shape for the About page —
 * next to the wave-bias calibration table, the reader sees the PT reference
 * chosen per region and the ME/n of the ES→PT pair that recalibrated the wave
 * height. Mirrors scripts/lib/buoyCoherence.js (buildRegionSourceAudit).
 */

/** One ES→PT pair used for calibration inside a region. */
export interface CalibrationRefEntry {
  /** `${esCode}→${ptRefCode}` — dedup key used by the producer. */
  key: string;
  esCode: string;
  esName?: string | null;
  ptRefCode: string;
  ptRefName?: string | null;
  ptRefArea?: string | null;
  pair?: string | null;
  /** ME of the ES→PT pair (observed PT − observed ES on overlapping hours). */
  me: number;
  n: number;
  /** Spot slugs whose ES reading was recalibrated with this reference. */
  spots: string[];
}

/** A spot recalibrated with a non-nearest PT reference (suboptimal pair). */
export interface SuboptimalCalibrationRef {
  spot: string;
  esCode: string;
  ptRefCode: string;
  ptRefKm: number | null;
  nearestPtCode: string | null;
  nearestPtName: string | null;
  nearestPtKm: number | null;
}

export interface RegionCalibrationRefs {
  region: string;
  refs: CalibrationRefEntry[];
  /** Spots whose ES reading was calibrated with a non-nearest PT buoy. */
  suboptimalRefs: number;
  suboptimal: SuboptimalCalibrationRef[];
}

export interface BuoyCoherenceRefsData {
  fetchedAt: string | null;
  day: string | null;
  regions: RegionCalibrationRefs[];
  hasData: boolean;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

/**
 * Pure: extract regions → calibrationRefs from a raw buoy-coherence.json.
 * Entries without usable esCode/ptRefCode or finite me/n are dropped; spot
 * slugs are kept as strings (unknown shapes filtered). Never throws.
 */
export function parseBuoyCoherenceRefs(raw: unknown): BuoyCoherenceRefsData {
  const empty: BuoyCoherenceRefsData = {
    fetchedAt: null,
    day: null,
    regions: [],
    hasData: false,
  };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as {
    fetchedAt?: unknown;
    day?: unknown;
    regions?: unknown;
  };

  const regions: RegionCalibrationRefs[] = [];
  const rawRegions =
    obj.regions && typeof obj.regions === 'object' && !Array.isArray(obj.regions)
      ? (obj.regions as Record<string, unknown>)
      : {};
  for (const [region, regionData] of Object.entries(rawRegions)) {
    if (!regionData || typeof regionData !== 'object') continue;
    const rawRefs = (regionData as { calibrationRefs?: unknown }).calibrationRefs;
    if (!rawRefs || typeof rawRefs !== 'object' || Array.isArray(rawRefs)) continue;
    const refs: CalibrationRefEntry[] = [];
    for (const [key, v] of Object.entries(rawRefs as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const e = v as {
        esCode?: unknown;
        esName?: unknown;
        ptRefCode?: unknown;
        ptRefName?: unknown;
        ptRefArea?: unknown;
        pair?: unknown;
        me?: unknown;
        n?: unknown;
        spots?: unknown;
      };
      const esCode = str(e.esCode);
      const ptRefCode = str(e.ptRefCode);
      const me = num(e.me);
      const n = num(e.n);
      if (!esCode || !ptRefCode || me === null || n === null) continue;
      const spots = Array.isArray(e.spots)
        ? e.spots.filter((s): s is string => typeof s === 'string')
        : [];
      refs.push({
        key: str(key) ?? `${esCode}→${ptRefCode}`,
        esCode,
        esName: str(e.esName),
        ptRefCode,
        ptRefName: str(e.ptRefName),
        ptRefArea: str(e.ptRefArea),
        pair: str(e.pair),
        me,
        n,
        spots,
      });
    }
    if (refs.length === 0) continue;
    refs.sort((a, b) => b.n - a.n);
    const suboptimal: SuboptimalCalibrationRef[] = [];
    const rawSub = (regionData as { suboptimal?: unknown }).suboptimal;
    if (Array.isArray(rawSub)) {
      for (const s of rawSub) {
        if (!s || typeof s !== 'object') continue;
        const e = s as {
          spot?: unknown;
          esCode?: unknown;
          ptRefCode?: unknown;
          ptRefKm?: unknown;
          nearestPtCode?: unknown;
          nearestPtName?: unknown;
          nearestPtKm?: unknown;
        };
        const spot = str(e.spot);
        const esCode = str(e.esCode);
        const ptRefCode = str(e.ptRefCode);
        if (!spot || !esCode || !ptRefCode) continue;
        suboptimal.push({
          spot,
          esCode,
          ptRefCode,
          ptRefKm: num(e.ptRefKm),
          nearestPtCode: str(e.nearestPtCode),
          nearestPtName: str(e.nearestPtName),
          nearestPtKm: num(e.nearestPtKm),
        });
      }
    }
    regions.push({
      region,
      refs,
      suboptimalRefs: Math.max(0, suboptimal.length),
      suboptimal,
    });
  }
  regions.sort((a, b) => a.region.localeCompare(b.region));

  return {
    fetchedAt: str(obj.fetchedAt),
    day: str(obj.day),
    regions,
    hasData: regions.length > 0,
  };
}