/**
 * IPMA radar overlay — baked data from scripts/fetch-ipma-radar.js.
 *
 * The IPMA has no public WMTS/tile endpoint for radar; the stable source is
 * the manifest (imgs-radar.json, 5-min PNG frames with alpha) plus the
 * official overlay bounds used by IPMA's own Leaflet map builder:
 *   SW (34.011513, -12.454795) → NE (43.792862, -4.345465)
 * We bake the latest frame to /data/radar/ipma-radar.png and overlay it with
 * L.imageOverlay — the frame is transparent outside the echoes.
 */

import { getAssetPath } from '@/lib/paths';

export interface IpmaRadarFrame {
  frameTime: string | null;
  framePath: string;
  /** Path relative to /data, e.g. radar/frames/pcr-....png */
  imagePath: string;
}

export interface IpmaRadarData {
  source: 'ipma-radar';
  fetchedAt: string;
  frameTime: string | null;
  framePath: string;
  /** Path relative to /data (imagePath: 'radar/ipma-radar.png'). */
  imagePath: string;
  /** Newest-first carousel frames (last hour @ 5 min). Falls back to [latest]. */
  frames?: IpmaRadarFrame[];
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  attribution?: string;
}

/** Fallback bounds if radar.json is missing/broken (same as the IPMA builder). */
export const IPMA_RADAR_BOUNDS: IpmaRadarData['bounds'] = {
  south: 34.011513,
  west: -12.454795,
  north: 43.792862,
  east: -4.345465,
};

const RADAR_DATA_PATH = '/data/radar.json';

let cached: IpmaRadarData | null | undefined;
let inflight: Promise<IpmaRadarData | null> | null = null;

/**
 * Fetch the baked radar metadata once per session (module-level cache — the
 * map, hero and spot pages share the same request). Never throws: returns
 * null when the layer is unavailable (radar.json missing or malformed).
 */
export async function fetchRadarData(): Promise<IpmaRadarData | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(getAssetPath(RADAR_DATA_PATH));
      if (!res.ok) throw new Error('radar.json fetch failed');
      const data = (await res.json()) as IpmaRadarData;
      if (data?.source !== 'ipma-radar' || !data.imagePath) {
        throw new Error('invalid radar.json');
      }
      cached = data;
      return data;
    } catch {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Local URL of the baked frame PNG. */
export function radarImageUrl(data: IpmaRadarData | null): string {
  return getAssetPath(`/data/${data?.imagePath ?? 'radar/ipma-radar.png'}`);
}

export interface RadarFrameAsset {
  /** Local URL of the frame PNG. */
  url: string;
  /** Frame wall-clock as ISO (Lisbon local time, "Z"-suffixed). */
  frameTime: string | null;
}

/**
 * Carousel frames, newest-first. Falls back to the single baked frame when
 * the manifest predates the carousel format (no frames array).
 */
export function radarFrames(data: IpmaRadarData | null): RadarFrameAsset[] {
  const frames = Array.isArray(data?.frames) && data.frames.length > 0 ? data.frames : null;
  if (frames) {
    return frames.map((f) => ({
      url: getAssetPath(`/data/${f.imagePath}`),
      frameTime: f.frameTime ?? null,
    }));
  }
  return [{ url: radarImageUrl(data), frameTime: data?.frameTime ?? null }];
}

/**
 * "18:35" from the frameTime ISO. The manifest date is Lisbon wall-clock
 * stored with a "Z" suffix, so we display it as-is (no timezone shift).
 */
export function radarFrameClock(iso: string | null): string | null {
  if (!iso) return null;
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : null;
}

/**
 * "2026-08-15 01:00" from the frameTime ISO — data + hora, sem shift de fuso
 * (a data do manifest é wall-clock de Lisboa com sufixo "Z"). Permite
 * distinguir frames de dias diferentes no tooltip do badge ao pairar.
 */
export function radarFrameFullClock(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Leaflet LatLngBounds-like corners from radar.json bounds. */
export function radarBoundsCorners(
  data: IpmaRadarData | null,
): [[number, number], [number, number]] {
  const b = data?.bounds ?? IPMA_RADAR_BOUNDS;
  return [
    [b.south, b.west],
    [b.north, b.east],
  ];
}
