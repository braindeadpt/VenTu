/**
 * Buoy layer health — lets the UI explain WHY there is no observedWave:
 *
 * IH (primary):
 *   - 'no-key' — IH_API_KEY not configured in the pipeline (stations only).
 *   - 'down'   — key configured but the IH wave API returned no snapshots.
 *   - 'stale'  — snapshots exist but every reading is older than the freshness
 *                gate (3h IH); the card would hide itself, so we say so.
 *   - 'ok'     — fresh readings available.
 *
 * WMO/Copernicus (keyless fallback):
 *   - 'down'   — no file, no buoys, or hasWaveData false (fallback dead).
 *   - 'stale'  — buoys exist but every reading is older than the 6h gate.
 *   - 'ok'     — at least one fresh reading.
 *
 * The notice combines both: it only renders when NEITHER source has fresh
 * readings (if the WMO fallback covers the spot, the card renders and there
 * is nothing to warn about), and it names the WMO state so «WMO em baixo» is
 * explicit instead of a generic IH-only warning.
 *
 * Derived from public/data/ih-buoys.json + public/data/wmo-buoys.json.
 */
import { getAssetPath } from '@/lib/paths';

export type BuoyLayerStatus = 'ok' | 'no-key' | 'down' | 'stale';

export type WmoLayerStatus = 'ok' | 'down' | 'stale';

export interface IhBuoysFile {
  stations?: Record<
    string,
    {
      status?: string;
      lastSea?: string;
      latest?: { date?: string };
    }
  >;
  spotMapping?: Record<string, unknown>;
  fetchedAt?: string;
  apiKeyConfigured?: boolean;
  hasWaveData?: boolean;
}

export interface WmoBuoysFile {
  buoys?: Record<
    string,
    {
      code?: string;
      latest?: { date?: string };
    }
  >;
  spotMapping?: Record<string, unknown>;
  fetchedAt?: string;
  hasWaveData?: boolean;
}

/** Max age (h) before a snapshot counts as stale — mirrors the data layer. */
export const BUOY_READING_MAX_AGE_HOURS = 3;
/** WMO/Copernicus gate is wider (6h) because NRT ingestion lags hours. */
export const WMO_READING_MAX_AGE_HOURS = 6;

function isoAgeHours(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

/**
 * Pure derivation — testable without fetch.
 * @returns {BuoyLayerStatus}
 */
export function deriveBuoyLayerStatus(
  file: IhBuoysFile | null | undefined,
  nowMs = Date.now(),
): BuoyLayerStatus {
  if (!file || !file.stations) return 'no-key';
  if (file.apiKeyConfigured === false) return 'no-key';
  if (!file.hasWaveData) return 'down';

  // Snapshots exist — are any of them fresh? Use the newest reading across
  // active stations (inactive buoys with old lastSea must not trigger).
  let newest = Infinity;
  for (const st of Object.values(file.stations)) {
    if (st.status === 'inactive' || st.status === 'inativa') continue;
    const age = isoAgeHours(st.latest?.date ?? st.lastSea, nowMs);
    if (age !== null && age >= 0 && age < newest) newest = age;
  }
  if (!Number.isFinite(newest)) return 'down';
  return newest <= BUOY_READING_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Pure WMO/Copernicus derivation (keyless fallback). Same walk as the IH one
 * but with the wider 6h gate; 'down' covers missing file/empty buoys.
 * @returns {WmoLayerStatus}
 */
export function deriveWmoLayerStatus(
  file: WmoBuoysFile | null | undefined,
  nowMs = Date.now(),
): WmoLayerStatus {
  if (!file || !file.buoys) return 'down';
  if (!file.hasWaveData) return 'down';

  let newest = Infinity;
  for (const buoy of Object.values(file.buoys)) {
    const age = isoAgeHours(buoy.latest?.date, nowMs);
    if (age !== null && age >= 0 && age < newest) newest = age;
  }
  if (!Number.isFinite(newest)) return 'down';
  return newest <= WMO_READING_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Combined health of the observed-wave layer. Renders the notice only when
 * NEITHER source is fresh — if the WMO fallback covers, there is data.
 * @returns {{ status: BuoyLayerStatus | null, wmo: WmoLayerStatus }}
 *   status: null when the layer is effectively healthy (IH or WMO fresh),
 *   else the IH status to headline (no-key/down/stale) with the WMO state
 *   available for the «WMO em baixo» note.
 */
export function combineBuoyLayerHealth(
  ih: BuoyLayerStatus,
  wmo: WmoLayerStatus,
): { status: BuoyLayerStatus | null; wmo: WmoLayerStatus } {
  if (ih === 'ok' || wmo === 'ok') return { status: null, wmo };
  return { status: ih, wmo };
}

/** Module-level cache (single fetch per session), mirrors spotDataCache. */
let buoyHealthCache: { status: BuoyLayerStatus | null; wmo: WmoLayerStatus } | null = null;
let buoyHealthInflight: Promise<{ status: BuoyLayerStatus | null; wmo: WmoLayerStatus }> | null = null;

/**
 * Fetch ih-buoys.json + wmo-buoys.json once per session and combine the
 * layer health. A missing/errored IH file degrades to 'no-key' and a missing
 * WMO file to 'down' (conservative, never throws).
 */
export async function loadBuoyLayerHealth(
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<{ status: BuoyLayerStatus | null; wmo: WmoLayerStatus }> {
  if (buoyHealthCache) return buoyHealthCache;
  if (buoyHealthInflight) return buoyHealthInflight;

  const promise = (async () => {
    let ih: BuoyLayerStatus = 'no-key';
    let wmo: WmoLayerStatus = 'down';
    try {
      const res = await fetchImpl(getAssetPath('/data/ih-buoys.json'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ih = deriveBuoyLayerStatus((await res.json()) as IhBuoysFile, nowMs);
    } catch {
      // File missing (first run before the pipeline) — treat as not configured.
      ih = 'no-key';
    }
    try {
      const res = await fetchImpl(getAssetPath('/data/wmo-buoys.json'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      wmo = deriveWmoLayerStatus((await res.json()) as WmoBuoysFile, nowMs);
    } catch {
      // File missing — the keyless fallback is effectively down.
      wmo = 'down';
    }
    return combineBuoyLayerHealth(ih, wmo);
  })().finally(() => {
    buoyHealthInflight = null;
  });

  buoyHealthInflight = promise;
  promise.then((v) => {
    buoyHealthCache = v;
  });
  return promise;
}

/** Test hook: clear the module cache between tests. */
export function clearBuoyLayerHealthCache(): void {
  buoyHealthCache = null;
  buoyHealthInflight = null;
}
