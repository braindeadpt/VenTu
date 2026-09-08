/**
 * IH_API_KEY layer status — lets the About page (and anyone cloning the repo)
 * see at a glance whether the IH observed-wave layer is configured, active,
 * rejected (expired key, HTTP 401/403) or down (IH wave API outage).
 *
 * Derived server-side from public/data/ih-buoys.json (the pipeline output).
 * The pure derivation lives in `ihKeyStatusPure.ts` (fs-free, imported by the
 * client AboutDataCards under `ventu_live`); this module adds the fs reads.
 *
 * Mirrors the `loadForecastSkillBuoys` pattern (fs read at build/render time,
 * safe in the browser where it degrades to 'not-configured').
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { BuoyLayerMeta } from '@/lib/pipelineMeta';

export type {
  IhKeyStatus,
  IhBuoysHealthFile,
  WmoNazareCoverage,
  WmoBuoysFileLike,
  IhKeyStatusInfo,
} from '@/lib/ihKeyStatusPure';
export { deriveIhKeyStatus, deriveWmoNazareCoverage } from '@/lib/ihKeyStatusPure';
import { deriveIhKeyStatus, deriveWmoNazareCoverage, type IhKeyStatusInfo, type IhBuoysHealthFile, type WmoBuoysFileLike } from '@/lib/ihKeyStatusPure';

/**
 * Load the status from the committed pipeline output. Server-only; in the
 * browser (never happens on the About page) it degrades to 'not-configured'.
 */
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