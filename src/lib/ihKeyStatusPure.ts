/**
 * IH_API_KEY layer status — PURE derivation (no I/O), shared by the server
 * loader (`ihKeyStatus.ts`, which adds the fs reads) and the client
 * `AboutDataCards` (which re-derives from fetched JSON under `ventu_live`).
 *
 * Kept fs-free on purpose: importing this module from a client component must
 * not pull `pipelineMeta.ts` (fs at module scope) into the client bundle.
 *
 * Precedence: rejected (key invalid) > not-configured > down > active.
 */

export type IhKeyStatus = 'not-configured' | 'active' | 'rejected' | 'down';

export interface IhBuoysHealthFile {
  fetchedAt?: string;
  apiKeyConfigured?: boolean;
  hasWaveData?: boolean;
  apiKeyStatus?: string;
  authError?: { status?: number; at?: string };
  stations?: Record<string, { name?: string; latest?: { date?: string } }>;
}

/**
 * Keyless WMO/Copernicus coverage sub-state: the Nazaré Costeira buoy
 * (6200199) health. Even WITHOUT an IH_API_KEY the observed-wave layer is not
 * fully off — this buoy covers the central coast (Costa de Prata/Lisboa) via
 * the independent Copernicus route when its latest reading is fresh.
 * Mirrors the producer's freshness gate (MAX_OBS_AGE_HOURS = 6h).
 */
export interface WmoNazareCoverage {
  /** Latest 6200199 reading within the WMO freshness gate (6h). */
  fresh: boolean;
  readingAt?: string;
  waveHeightM?: number;
}

/** The pipeline-meta `buoyLayer` fields the About card needs (streak window). */
export interface BuoyLayerMetaLike {
  status: 'ok' | 'no-key' | 'down' | 'stale';
  streak?: number;
  lastOkAt?: string;
  streakUpdatedAt?: string;
}

export interface IhKeyStatusInfo {
  status: IhKeyStatus;
  apiKeyConfigured: boolean;
  hasWaveData: boolean;
  /** Number of stations catalogued (OGC, keyless — always present). */
  buoyCount: number;
  fileFetchedAt?: string;
  /** When the key was rejected (authError.at from the pipeline). */
  rejectedAt?: string;
  /** HTTP status of the rejection (401 | 403). */
  rejectedStatus?: number;
  /** Newest reading date across stations (active state). */
  newestReadingAt?: string;
  /** Keyless WMO/Copernicus Nazaré sub-state (present when derivable). */
  wmoNazare?: WmoNazareCoverage;
  /** The pipeline-meta `buoyLayer` block (streak/lastOkAt) — for the
   *  degradation window «há quantas horas» shown on the About card. */
  layer?: BuoyLayerMetaLike | null;
}

export function deriveIhKeyStatus(
  file: IhBuoysHealthFile | null | undefined,
): IhKeyStatusInfo {
  if (!file) {
    return { status: 'not-configured', apiKeyConfigured: false, hasWaveData: false, buoyCount: 0 };
  }
  const base = {
    apiKeyConfigured: file.apiKeyConfigured === true,
    hasWaveData: file.hasWaveData === true,
    buoyCount: file.stations ? Object.keys(file.stations).length : 0,
    fileFetchedAt: file.fetchedAt,
  };

  if (file.apiKeyStatus === 'unauthorized') {
    return {
      ...base,
      status: 'rejected',
      rejectedAt: file.authError?.at,
      rejectedStatus: file.authError?.status,
    };
  }
  if (file.apiKeyConfigured === false) {
    return { ...base, status: 'not-configured' };
  }
  if (file.hasWaveData !== true) {
    return { ...base, status: 'down' };
  }

  let newest: string | undefined;
  for (const st of Object.values(file.stations ?? {})) {
    const d = st.latest?.date;
    if (d && (!newest || d > newest)) newest = d;
  }
  return { ...base, status: 'active', newestReadingAt: newest };
}

/* WMO freshness gate — mirrors MAX_OBS_AGE_HOURS=6 from copernicusBuoys.js. */
const WMO_NAZARE_FRESH_HOURS = 6;

export interface WmoBuoysFileLike {
  buoys?: Record<string, { latest?: { date?: string; hs?: number } }>;
}

/**
 * Pure: derive the keyless WMO Nazaré (6200199) coverage from wmo-buoys.json.
 * Fresh = latest reading within the 6h gate (the independent Copernicus route
 * that keeps the central coast observed even without IH_API_KEY).
 */
export function deriveWmoNazareCoverage(
  wmoBuoys: WmoBuoysFileLike | null | undefined,
  nowMs: number = Date.now(),
): WmoNazareCoverage {
  const latest = wmoBuoys?.buoys?.['6200199']?.latest;
  const readingAt = typeof latest?.date === 'string' ? latest.date : undefined;
  if (!readingAt) return { fresh: false };
  const ageHours = (Number.isFinite(new Date(readingAt).getTime())
    ? (nowMs - new Date(readingAt).getTime()) / 3_600_000
    : Infinity);
  return {
    fresh: ageHours >= 0 && ageHours <= WMO_NAZARE_FRESH_HOURS,
    readingAt,
    ...(Number.isFinite(Number(latest?.hs)) && latest?.hs !== undefined
      ? { waveHeightM: Math.round(Number(latest.hs) * 10) / 10 }
      : {}),
  };
}