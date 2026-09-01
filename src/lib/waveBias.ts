/**
 * Per-buoy wave bias (wave-bias.json) for the About page + spot-page fallback.
 *
 * wave-bias.json is an optional pipeline artifact (ERA5 vs wave buoys, ME/MAE/
 * RMSE/n per buoy and region). This module reads it at build time (SSG, same
 * pattern as dataLoader.ts) and exposes the calibrated buoys — IH (source:
 * 'ih', Datawell com chave) e ES (source: 'wmo-es', Copernicus WMO sem chave)
 * — in a typed, sanitised shape. The About page shows them next to the model
 * attribution, with an honest note that this is MODEL bias (ERA5 reanalysis),
 * not forecast skill.
 *
 * `loadWaveBiasRegions` is the client-side loader (fetch + session cache) used
 * by the spot page to fall back to the regional bias when the buoy is not
 * fresh (see scoreConditions.applyRegionalBiasFallback).
 */

import { getAssetPath } from '@/lib/paths';

/** Plataforma da boia — IH (Datawell com chave) ou ES (Copernicus WMO, sem chave). */
export type WaveBiasSource = 'ih' | 'wmo-es';

export interface WaveBiasBuoy {
  /** Código da estação (ID numérico IH ou código WMO/espanhol). */
  code: string;
  name: string;
  area?: string;
  /** Plataforma de origem — IH (chave) ou ES (Copernicus WMO, sem chave). */
  source: WaveBiasSource;
  n: number;
  me: number;
  mae: number;
  rmse: number;
  corr?: number | null;
  /** false = gated by the ES×PT coherence check (not attributed to regions). */
  regionAttribution?: boolean;
}

export interface WaveBiasData {
  fetchedAt: string | null;
  /** Boias com viés calculado — IH (Datawell, com chave) e/ou ES (Puertos
   *  del Estado via Copernicus WMO, sem chave). */
  buoys: WaveBiasBuoy[];
  /** Boias ES excluídas da atribuição regional (par ES×PT incoherent). */
  gatedCodes: string[];
  coherenceDay: string | null;
  hasData: boolean;
}

const NUMERIC_KEYS = ['n', 'me', 'mae', 'rmse'] as const;
const FLOAT_KEYS = ['me', 'mae', 'rmse'] as const;

/**
 * Pure: sanitise a raw wave-bias.json object into the About shape, keeping
 * only the ES/WMO buoys with usable stats. Never throws.
 */
export function parseWaveBiasBuoys(raw: unknown): WaveBiasData {
  const empty: WaveBiasData = {
    fetchedAt: null,
    buoys: [],
    gatedCodes: [],
    coherenceDay: null,
    hasData: false,
  };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as {
    fetchedAt?: unknown;
    buoys?: Record<string, unknown>;
    coherenceGate?: { day?: unknown; gatedCodes?: unknown };
  };

  const buoys: WaveBiasBuoy[] = [];
  if (obj.buoys && typeof obj.buoys === 'object') {
    for (const [code, b] of Object.entries(obj.buoys)) {
      if (!b || typeof b !== 'object') continue;
      const buoy = b as {
        source?: unknown;
        name?: unknown;
        area?: unknown;
        n?: unknown;
        me?: unknown;
        mae?: unknown;
        rmse?: unknown;
        corr?: unknown;
        regionAttribution?: unknown;
      };
      // Aceita IH (Datawell, com chave) e ES (Copernicus WMO, sem chave) — o
      // pipeline marca `source` ('ih' | 'wmo-es') por boia; sem `source`, ignora
      // (nunca inventa a origem de uma leitura ambígua).
      const source = buoy.source;
      if (source !== 'ih' && source !== 'wmo-es') continue;
      const n = Number(buoy.n);
      if (!Number.isInteger(n) || n <= 0) continue;
      const stats: Record<string, number> = {};
      let ok = true;
      for (const key of FLOAT_KEYS) {
        const v = Number(buoy[key]);
        if (!Number.isFinite(v)) {
          ok = false;
          break;
        }
        stats[key] = Math.round(v * 100) / 100;
      }
      if (!ok) continue;
      const corr = Number(buoy.corr);
      buoys.push({
        code,
        name: typeof buoy.name === 'string' && buoy.name ? buoy.name : `WMO ${code}`,
        area: typeof buoy.area === 'string' ? buoy.area : undefined,
        source,
        n,
        me: stats.me,
        mae: stats.mae,
        rmse: stats.rmse,
        corr: Number.isFinite(corr) ? Math.round(corr * 100) / 100 : null,
        regionAttribution: buoy.regionAttribution === false ? false : undefined,
      });
    }
  }

  buoys.sort((a, b) => a.name.localeCompare(b.name));

  const gatedCodes: string[] = [];
  let coherenceDay: string | null = null;
  if (obj.coherenceGate && typeof obj.coherenceGate === 'object') {
    const gate = obj.coherenceGate as { day?: unknown; gatedCodes?: unknown };
    if (Array.isArray(gate.gatedCodes)) {
      for (const c of gate.gatedCodes) {
        if (typeof c === 'string') gatedCodes.push(c);
      }
    }
    coherenceDay = typeof gate.day === 'string' ? gate.day : null;
  }

  return {
    fetchedAt: typeof obj.fetchedAt === 'string' ? obj.fetchedAt : null,
    buoys,
    gatedCodes,
    coherenceDay,
    hasData: buoys.length > 0,
  };
}

/** Raw wave-bias.json regions for the client-side fallback (spot page). */
export interface WaveBiasRegionsFile {
  fetchedAt?: string | null;
  regions?: Record<
    string,
    { n?: unknown; me?: unknown; mae?: unknown; rmse?: unknown; corr?: unknown }
  >;
}

let waveBiasRegionsCache: WaveBiasRegionsFile | null | undefined;
let waveBiasRegionsInflight: Promise<WaveBiasRegionsFile | null> | null = null;

/**
 * Fetch public/data/wave-bias.json once per session (client). Missing/404/
 * corrupt → null (the fallback simply never applies). Never throws.
 */
export async function loadWaveBiasRegions(
  fetchImpl: typeof fetch = fetch,
): Promise<WaveBiasRegionsFile | null> {
  if (waveBiasRegionsCache !== undefined) return waveBiasRegionsCache;
  if (waveBiasRegionsInflight) return waveBiasRegionsInflight;

  waveBiasRegionsInflight = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/wave-bias.json'));
      if (!res.ok) {
        waveBiasRegionsCache = null;
        return null;
      }
      const raw = (await res.json()) as WaveBiasRegionsFile;
      waveBiasRegionsCache = raw && typeof raw === 'object' ? raw : null;
      return waveBiasRegionsCache;
    } catch {
      waveBiasRegionsCache = null;
      return null;
    }
  })()
    .catch(() => null)
    .finally(() => {
      waveBiasRegionsInflight = null;
    });
  return waveBiasRegionsInflight;
}

/** Test hook: clear the session cache. */
export function clearWaveBiasRegionsCache(): void {
  waveBiasRegionsCache = undefined;
  waveBiasRegionsInflight = null;
}

let waveBiasRegionsBuildCache: WaveBiasRegionsFile | null | undefined;

/** Injected fs surface (tests pass a mock; production uses node:fs). */
export interface WaveBiasRegionsFs {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding: string) => string;
}

/**
 * Read public/data/wave-bias.json at build time (SSG) and return ONLY the
 * `regions` shape used by the regional-bias fallback. Missing/corrupt → null
 * (the fallback simply never applies). Module-level cache — the homepage/index
 * pages are statically generated, so this runs once per build. Mirrors
 * `loadWaveBiasBuoys` (same file, different projection).
 *
 * `fsImpl`/`filePath` are test seams only — production callers pass nothing
 * (the dynamic `require('fs')` keeps this module client-safe).
 */
export function loadWaveBiasRegionsBuild(
  fsImpl?: WaveBiasRegionsFs | null,
  filePath?: string,
): WaveBiasRegionsFile | null {
  if (waveBiasRegionsBuildCache !== undefined) return waveBiasRegionsBuildCache;
  if (typeof window !== 'undefined') {
    waveBiasRegionsBuildCache = null;
    return null;
  }
  try {
    const fs = fsImpl ?? (require('fs') as WaveBiasRegionsFs);
    const path = require('path');
    const resolved = filePath ?? path.join(process.cwd(), 'public/data/wave-bias.json');
    if (fs.existsSync(resolved)) {
      const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
      waveBiasRegionsBuildCache =
        raw && typeof raw === 'object' ? (raw as WaveBiasRegionsFile) : null;
      return waveBiasRegionsBuildCache;
    }
  } catch (e) {
    console.warn('Failed to load wave-bias.json regions (build):', e);
  }
  waveBiasRegionsBuildCache = null;
  return null;
}

/** Test hook: clear the build cache. */
export function clearWaveBiasRegionsBuildCache(): void {
  waveBiasRegionsBuildCache = undefined;
}

let cached: WaveBiasData | null = null;

/**
 * Read public/data/wave-bias.json at build time (SSG). Missing/corrupt →
 * empty result (the About section simply hides). Module-level cache — the
 * page is statically generated, so this runs once per build.
 */
export function loadWaveBiasBuoys(): WaveBiasData {
  if (cached) return cached;
  if (typeof window !== 'undefined') return parseWaveBiasBuoys(null);
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public/data/wave-bias.json');
    if (fs.existsSync(filePath)) {
      cached = parseWaveBiasBuoys(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
      return cached;
    }
  } catch (e) {
    console.warn('Failed to load wave-bias.json:', e);
  }
  cached = parseWaveBiasBuoys(null);
  return cached;
}
