/**
 * IH_API_KEY layer status — lets the About page (and anyone cloning the repo)
 * see at a glance whether the IH observed-wave layer is configured, active,
 * rejected (expired key, HTTP 401/403) or down (IH wave API outage).
 *
 * Derived server-side from public/data/ih-buoys.json (the pipeline output):
 *   - 'not-configured' — IH_API_KEY absent in the pipeline (stations only,
 *     `apiKeyConfigured: false`); the observed layer never runs.
 *   - 'rejected'       — `apiKeyStatus: 'unauthorized'` recorded by
 *     fetch-ih-buoys.js when getDatawellData returned HTTP 401/403 (fail-early
 *     with alert; see docs/IH_API_KEY.md). Renew the secret.
 *   - 'down'           — key configured but the wave API returned no snapshots
 *     (`hasWaveData: false`) — transient IH outage, not a key problem.
 *   - 'active'         — key configured and at least one buoy snapshot present.
 *
 * Mirrors the `loadForecastSkillBuoys` pattern (fs read at build/render time,
 * safe in the browser where it degrades to 'not-configured').
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { BuoyLayerMeta } from '@/lib/pipelineMeta';

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
  layer?: Pick<BuoyLayerMeta, 'status' | 'streak' | 'lastOkAt' | 'streakUpdatedAt'> | null;
}

/**
 * Pure derivation — testable without I/O.
 * Precedence: rejected (key invalid) > not-configured > down > active.
 */
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

/**
 * Load the status from the committed pipeline output. Server-only; in the
 * browser (never happens on the About page) it degrades to 'not-configured'.
 */
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

export function loadIhKeyStatus(): IhKeyStatusInfo {
  if (typeof window !== 'undefined') return deriveIhKeyStatus(null);
  let info: IhKeyStatusInfo = deriveIhKeyStatus(null);
  try {
    const filePath = join(process.cwd(), 'public/data/ih-buoys.json');
    if (existsSync(filePath)) {
      info = deriveIhKeyStatus(
        JSON.parse(readFileSync(filePath, 'utf-8')) as IhBuoysHealthFile,
      );
    }
  } catch (e) {
    console.warn('Failed to load ih-buoys.json:', e);
  }
  // Sub-estado keyless: a Nazaré Costeira WMO (6200199) cobre a costa central
  // mesmo sem IH_API_KEY — para o clone perceber que a camada observada não
  // está toda desligada. Best-effort (falha → fica sem o bloco).
  try {
    const wmoPath = join(process.cwd(), 'public/data/wmo-buoys.json');
    if (existsSync(wmoPath)) {
      const wmo = JSON.parse(readFileSync(wmoPath, 'utf-8')) as WmoBuoysFileLike;
      info = { ...info, wmoNazare: deriveWmoNazareCoverage(wmo) };
    }
  } catch (e) {
    console.warn('Failed to load wmo-buoys.json (keyless Nazaré sub-state):', e);
  }
  // Streak down/stale (pipeline-meta buoyLayer) — «há quantas horas a onda
  // observada está degradada». Derivation live no About via the shared helper
  // (deriveBuoyLayerDowntime), para as superfícies nunca divergirem.
  try {
    const metaPath = join(process.cwd(), 'public/data/pipeline-meta.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as {
        buoyLayer?: BuoyLayerMeta | null;
      };
      const l = meta?.buoyLayer;
      info = {
        ...info,
        layer: l
          ? {
              status: l.status,
              streak: l.streak,
              lastOkAt: l.lastOkAt,
              streakUpdatedAt: l.streakUpdatedAt,
            }
          : null,
      };
    }
  } catch (e) {
    console.warn('Failed to load pipeline-meta.json (buoy streak sub-state):', e);
  }
  return info;
}
