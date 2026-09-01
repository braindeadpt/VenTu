/**
 * IH coastal isobaths (depcnt_8_16_30) — vector layer data for the maps.
 *
 * scripts/fetch-ih-isobaths.js bakes two files:
 *   - spot-isobaths.json: per-spot DISTANCES to the nearest 8/16/30 m contour
 *     (the IsobathsStrip text readout);
 *   - isobaths-contours.json: the simplified contour GEOMETRY (Douglas-Peucker,
 *     ~2K vertices, ~89 KB) keyed by depth — loaded lazily by the maps to draw
 *     the lines as a vector layer.
 *
 * This module loads/parses the contours file (module-cached, missing file →
 * null, never breaks the page) and exposes the shared depth styles + a
 * per-radius filter, so the spot map and the interactive map never diverge.
 */
import { getAssetPath } from '@/lib/paths';

export interface IsobathContoursFile {
  depths?: number[];
  /** depth string ('8' | '16' | '30') → list of lines, each [[lon, lat], ...]. */
  contours?: Record<string, number[][][]>;
  vertexCount?: number;
  toleranceDeg?: number;
  fetchedAt?: string;
}

export const ISOBATH_DEPTHS = [8, 16, 30] as const;

/** Depth styles shared by every surface (spot map + interactive map legend). */
export const ISOBATH_DEPTH_STYLE: Record<
  number,
  { color: string; label: string }
> = {
  8: { color: '#14b8a6', label: '8 m' },
  16: { color: '#f59e0b', label: '16 m' },
  30: { color: '#3b82f6', label: '30 m' },
};

let contoursCache: IsobathContoursFile | null = null;
let contoursInflight: Promise<IsobathContoursFile | null> | null = null;

/**
 * Fetch isobaths-contours.json once per session. Missing file / errors → null
 * (the maps simply draw no isobath layer — never break).
 */
export async function loadIsobathContours(
  fetchImpl: typeof fetch = fetch,
): Promise<IsobathContoursFile | null> {
  if (contoursCache) return contoursCache;
  if (contoursInflight) return contoursInflight;

  const promise = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/isobaths-contours.json'));
      if (!res.ok) return null;
      return (await res.json()) as IsobathContoursFile;
    } catch {
      return null;
    }
  })().finally(() => {
    contoursInflight = null;
  });

  contoursInflight = promise;
  promise.then((v) => {
    contoursCache = v;
  });
  return promise;
}

/** Test hook: clear the module cache. */
export function clearIsobathContoursCache(): void {
  contoursCache = null;
  contoursInflight = null;
}

/** km per degree at a latitude (local equirectangular, good at this scale). */
function kmPerDegree(lat: number) {
  const rad = (lat * Math.PI) / 180;
  return { lat: 111.32, lon: 111.32 * Math.cos(rad) };
}

/**
 * Lines per depth within `radiusKm` of a point — the spot map draws only the
 * local contours (a vertex inside the radius means the line passes near).
 * @returns Array of { depth, lines } for depths present in the file.
 */
export function contoursWithinRadius(
  file: IsobathContoursFile | null,
  lat: number,
  lon: number,
  radiusKm: number,
): { depth: number; lines: number[][][] }[] {
  if (!file?.contours) return [];
  const k = kmPerDegree(lat);
  const rLat = radiusKm / k.lat;
  const rLon = radiusKm / k.lon;
  const out: { depth: number; lines: number[][][] }[] = [];
  for (const depth of ISOBATH_DEPTHS) {
    const lines = file.contours[String(depth)];
    if (!lines || lines.length === 0) continue;
    const near = lines.filter((line) =>
      line.some(([vLon, vLat]) => {
        const dLat = vLat - lat;
        const dLon = vLon - lon;
        return Math.abs(dLat) <= rLat && Math.abs(dLon) <= rLon;
      }),
    );
    if (near.length > 0) out.push({ depth, lines: near });
  }
  return out;
}
