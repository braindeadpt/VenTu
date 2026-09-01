/**
 * Forecast skill per buoy (forecast-skill.json) for the About page and the
 * spot page's discreet «skill desta boia» line.
 *
 * forecast-skill.json is an optional pipeline artifact (real forecast skill —
 * best_match vs buoy readings on the same hours, lead time > 0, accumulated
 * run after run). byBuoy is keyed by IH idEst (numeric) or WMO string code.
 *
 * This module mirrors waveBias.ts: a build-time reader (SSG, About page) and
 * a client-side resolver (spot page, where the file is fetched like
 * conditions.json and resolved against the spot's buoy mapping).
 */

export type ForecastSkillOrigin = 'ih' | 'wmo-pt' | 'wmo-es';

/** Aggregated skill stats over a set of pairs (a platform or a buoy). */
export interface ForecastSkillStats {
  n: number;
  me: number;
  mae?: number;
  rmse?: number;
  corr?: number | null;
  meanLeadHours?: number | null;
}

export interface ForecastSkillBuoy extends ForecastSkillStats {
  /** Buoy id key in byBuoy: IH idEst (string) or WMO platform code (string). */
  id: string;
  name: string;
  /** Platform: IH Datawell (keyed) vs WMO-ES Copernicus (keyless). */
  origin?: ForecastSkillOrigin;
}

export interface ForecastSkillData {
  fetchedAt: string | null;
  pairCount: number;
  buoys: ForecastSkillBuoy[];
  /** Stats split by platform (IH vs WMO-ES) — the mixed total alone hides how each behaves. */
  byOrigin?: Record<ForecastSkillOrigin, ForecastSkillStats | null>;
  /** Pair counters per platform (always present, even below MIN_PAIRS). */
  pairCountByOrigin?: Record<ForecastSkillOrigin, number>;
  /** Pairs whose reading is from a Spanish buoy (ES→PT calibrated layer). */
  calibratedPairCount?: number;
  hasData: boolean;
}

interface ByBuoyEntry {
  buoyName?: unknown;
  n?: unknown;
  me?: unknown;
  mae?: unknown;
  rmse?: unknown;
  corr?: unknown;
  meanLeadHours?: unknown;
  origin?: unknown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Human label for a buoy's platform/country — shared by the About skill table
 * and the spot page's discreet line, so both surfaces always say the same
 * thing about where the buoy skill comes from. The user must see that the NW
 * is covered by the keyless Copernicus-ES route (not just a cryptic code):
 *   - ih     → IH · Portugal (Instituto Hidrográfico, with IH_API_KEY)
 *   - wmo-pt → Copernicus-PT · Portugal (Nazaré Costeira WMO via Copernicus, keyless)
 *   - wmo-es → Copernicus-ES · Espanha (Puertos del Estado via Copernicus, keyless)
 */
export function forecastSkillOriginLabel(
  origin: ForecastSkillOrigin | undefined,
  isPt: boolean,
): string {
  if (origin === 'ih') {
    return isPt ? 'IH · Portugal' : 'IH · Portugal';
  }
  if (origin === 'wmo-pt') {
    return isPt ? 'Copernicus-PT · Portugal' : 'Copernicus-PT · Portugal';
  }
  if (origin === 'wmo-es') {
    return isPt ? 'Copernicus-ES · Espanha' : 'Copernicus-ES · Spain';
  }
  return '—';
}

/** Compact tag variant for tight UIs (e.g. the About table column). */
export function forecastSkillOriginTag(
  origin: ForecastSkillOrigin | undefined,
): string {
  if (origin === 'ih') return 'IH';
  if (origin === 'wmo-pt') return 'Copernicus-PT';
  if (origin === 'wmo-es') return 'Copernicus-ES';
  return '—';
}

/** Min pairs before a buoy's skill is reported — mirrors the producer (forecastSkill.js MIN_PAIRS). */
const MIN_PAIRS = 10;

/**
 * Pure: sanitise a raw stats object ({n, me, mae, rmse, corr, meanLeadHours})
 * into ForecastSkillStats. Requires finite n and me; null otherwise.
 */
function sanitizeStats(raw: unknown): ForecastSkillStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as { n?: unknown; me?: unknown; mae?: unknown; rmse?: unknown; corr?: unknown; meanLeadHours?: unknown };
  const n = Number(e.n);
  const me = Number(e.me);
  if (!Number.isInteger(n) || n < 1 || !Number.isFinite(me)) return null;
  const out: ForecastSkillStats = { n, me: round2(me) };
  // Guard null/undefined explícito: Number(null) === 0 corroeria o valor.
  for (const [k, to] of [
    ['mae', round2],
    ['rmse', round2],
  ] as const) {
    if (e[k] == null) continue;
    const v = Number(e[k]);
    if (Number.isFinite(v)) (out as unknown as Record<string, unknown>)[k] = to(v);
  }
  if (e.corr != null) {
    const corr = Number(e.corr);
    if (Number.isFinite(corr)) out.corr = round2(corr);
  }
  if (e.meanLeadHours != null) {
    const lead = Number(e.meanLeadHours);
    if (Number.isFinite(lead)) out.meanLeadHours = round2(lead);
  }
  return out;
}

/**
 * Pure: sanitise a raw forecast-skill.json object into the typed shape,
 * keeping only buoys with usable n/me (n ≥ MIN_PAIRS — the same gate the
 * producer uses before reporting a buoy). Never throws.
 */
export function parseForecastSkillBuoys(raw: unknown): ForecastSkillData {
  const empty: ForecastSkillData = {
    fetchedAt: null,
    pairCount: 0,
    buoys: [],
    pairCountByOrigin: { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 },
    calibratedPairCount: 0,
    hasData: false,
  };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as {
    fetchedAt?: unknown;
    pairCount?: unknown;
    byBuoy?: unknown;
    byOrigin?: unknown;
    pairCountByOrigin?: unknown;
    calibratedPairCount?: unknown;
  };
  const byBuoy =
    obj.byBuoy && typeof obj.byBuoy === 'object' && !Array.isArray(obj.byBuoy)
      ? (obj.byBuoy as Record<string, unknown>)
      : {};

  // Stats por plataforma (IH vs WMO-ES) — sanejadas como as de boia.
  const byOrigin: Record<ForecastSkillOrigin, ForecastSkillStats | null> = {
    ih: null,
    'wmo-pt': null,
    'wmo-es': null,
  };
  const rawByOrigin =
    obj.byOrigin && typeof obj.byOrigin === 'object' && !Array.isArray(obj.byOrigin)
      ? (obj.byOrigin as Record<string, unknown>)
      : {};
  for (const origin of ['ih', 'wmo-pt', 'wmo-es'] as const) {
    byOrigin[origin] = sanitizeStats(rawByOrigin[origin]);
  }

  const buoys: ForecastSkillBuoy[] = [];
  for (const [id, value] of Object.entries(byBuoy)) {
    if (!value || typeof value !== 'object') continue;
    const e = value as ByBuoyEntry;
    const n = Number(e.n);
    const me = Number(e.me);
    if (!Number.isInteger(n) || n < MIN_PAIRS || !Number.isFinite(me)) continue;
    const buoy: ForecastSkillBuoy = {
      id,
      name:
        typeof e.buoyName === 'string' && e.buoyName
          ? e.buoyName
          : `Buoy ${id}`,
      n,
      me: round2(me),
      origin:
        e.origin === 'ih' || e.origin === 'wmo-pt' || e.origin === 'wmo-es'
          ? e.origin
          : undefined,
    };
    // Guard null/undefined explícito: Number(null) === 0 corroeria o valor.
    for (const [k, to] of [
      ['mae', round2],
      ['rmse', round2],
    ] as const) {
      if (e[k] == null) continue;
      const v = Number(e[k]);
      if (Number.isFinite(v)) (buoy as unknown as Record<string, unknown>)[k] = to(v);
    }
    if (e.corr != null) {
      const corr = Number(e.corr);
      if (Number.isFinite(corr)) buoy.corr = round2(corr);
    }
    if (e.meanLeadHours != null) {
      const lead = Number(e.meanLeadHours);
      if (Number.isFinite(lead)) buoy.meanLeadHours = round2(lead);
    }
    buoys.push(buoy);
  }
  buoys.sort((a, b) => a.name.localeCompare(b.name));

  // Contadores por plataforma (IH vs WMO-ES) e por calibração — defaults a 0
  // quando o ficheiro antigo não os tem, para o dashboard nunca quebrar.
  const pairCountByOrigin: Record<ForecastSkillOrigin, number> = {
    ih: 0,
    'wmo-pt': 0,
    'wmo-es': 0,
  };
  const rawCounts =
    obj.pairCountByOrigin && typeof obj.pairCountByOrigin === 'object' && !Array.isArray(obj.pairCountByOrigin)
      ? (obj.pairCountByOrigin as Record<string, unknown>)
      : {};
  for (const origin of ['ih', 'wmo-pt', 'wmo-es'] as const) {
    const v = Number(rawCounts[origin]);
    pairCountByOrigin[origin] = Number.isInteger(v) && v >= 0 ? v : 0;
  }
  const calibratedRaw = Number(obj.calibratedPairCount);
  const calibratedPairCount =
    Number.isInteger(calibratedRaw) && calibratedRaw >= 0 ? calibratedRaw : 0;

  return {
    fetchedAt: typeof obj.fetchedAt === 'string' ? obj.fetchedAt : null,
    pairCount: Number.isInteger(Number(obj.pairCount)) ? Number(obj.pairCount) : 0,
    buoys,
    byOrigin,
    pairCountByOrigin,
    calibratedPairCount,
    hasData: buoys.length > 0,
  };
}

/** Test hook: inspect the min-pairs gate (shared with tests). */
export const FORECAST_SKILL_MIN_PAIRS = MIN_PAIRS;

let cached: ForecastSkillData | null = null;

/**
 * Read public/data/forecast-skill.json at build time (SSG, About page).
 * Missing/corrupt → empty result (the section simply hides).
 * Module-level cache — the page is statically generated, so it runs once.
 */
export function loadForecastSkillBuoys(): ForecastSkillData {
  if (cached) return cached;
  if (typeof window !== 'undefined') return parseForecastSkillBuoys(null);
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public/data/forecast-skill.json');
    if (fs.existsSync(filePath)) {
      cached = parseForecastSkillBuoys(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
      return cached;
    }
  } catch (e) {
    console.warn('Failed to load forecast-skill.json:', e);
  }
  cached = parseForecastSkillBuoys(null);
  return cached;
}

/** Test hook: clear the module cache. */
export function clearForecastSkillCache(): void {
  cached = null;
}

interface SpotBuoyMapping {
  /** IH idEst (ih-buoys.json) or WMO platform code (wmo-buoys.json). */
  idEst?: string | number | null;
  code?: string | number | null;
}

/**
 * Pure: find the spot's buoy skill in the forecast-skill byBuoy.
 * - IH mapping first (ih-buoys.json spotMapping → idEst);
 * - WMO/Copernicus fallback (wmo-buoys.json spotMapping → code).
 * Returns null when the spot has no mapped buoy or the buoy has no skill yet.
 */
export function resolveSpotBuoySkill(
  spotId: string,
  ihBuoys: Record<string, unknown> | null | undefined,
  wmoBuoys: Record<string, unknown> | null | undefined,
  skill: ForecastSkillData,
): ForecastSkillBuoy | null {
  if (!skill.hasData) return null;

  const ihMapping = (ihBuoys?.spotMapping as Record<string, SpotBuoyMapping> | undefined)?.[spotId];
  const ihId = ihMapping?.idEst != null ? String(ihMapping.idEst) : null;
  if (ihId != null) {
    const found = skill.buoys.find((b) => b.id === ihId);
    if (found) return found;
  }

  const wmoMapping = (wmoBuoys?.spotMapping as Record<string, SpotBuoyMapping> | undefined)?.[spotId];
  const wmoCode = wmoMapping?.code != null ? String(wmoMapping.code) : null;
  if (wmoCode != null) {
    const found = skill.buoys.find((b) => b.id === wmoCode);
    if (found) return found;
  }

  return null;
}

/* ── Client side (spot page) ─────────────────────────────────────────────── */

/**
 * Result of the client-side skill resolver: the spot's own buoy stats plus the
 * GLOBAL pair counters per platform. The card shows both the discreet
 * «skill desta boia» line and the IH vs WMO-ES split that the About row
 * displays, so the two surfaces never diverge on where the pairs come from.
 */
export interface ForecastSkillSpotResult {
  /** The spot's own buoy skill (null = no mapped buoy / no stats yet). */
  buoy: ForecastSkillBuoy | null;
  /** Global pair counters per platform (IH vs WMO-PT vs WMO-ES). */
  pairCountByOrigin: Record<ForecastSkillOrigin, number>;
  /** Pairs whose reading is from a Spanish buoy (ES→PT calibrated layer). */
  calibratedPairCount: number;
}

let clientCache: { ih: Record<string, unknown> | null; wmo: Record<string, unknown> | null; skill: ForecastSkillData } | null =
  null;
let clientInflight: Promise<{
  ih: Record<string, unknown> | null;
  wmo: Record<string, unknown> | null;
  skill: ForecastSkillData;
}> | null = null;

async function fetchJson(
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(path);
  if (!res.ok) throw new Error(`fetch ${path} ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function forecastSkillSpotResult(
  spotId: string,
  cache: { ih: Record<string, unknown> | null; wmo: Record<string, unknown> | null; skill: ForecastSkillData },
): ForecastSkillSpotResult {
  const counts = cache.skill.pairCountByOrigin ?? { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 };
  return {
    buoy: resolveSpotBuoySkill(spotId, cache.ih, cache.wmo, cache.skill),
    pairCountByOrigin: {
      ih: counts.ih ?? 0,
      'wmo-pt': counts['wmo-pt'] ?? 0,
      'wmo-es': counts['wmo-es'] ?? 0,
    },
    calibratedPairCount: cache.skill.calibratedPairCount ?? 0,
  };
}

/**
 * Fetch forecast-skill.json + ih-buoys.json (+ wmo-buoys.json fallback) once
 * per session. Any failure degrades to an empty result (never throws) — the
 * discreet lines simply do not render.
 */
export async function loadForecastSkillForSpot(
  spotId: string,
  fetchImpl: typeof fetch = fetch,
  getPath: (p: string) => string = (p) => p,
): Promise<ForecastSkillSpotResult> {
  if (!clientCache) {
    if (clientInflight) {
      return clientInflight.then(() => forecastSkillSpotResult(spotId, clientCache!));
    }
    clientInflight = (async () => {
      let ih: Record<string, unknown> | null = null;
      let wmo: Record<string, unknown> | null = null;
      let skill: ForecastSkillData = parseForecastSkillBuoys(null);
      try {
        const [skillRaw, ihRaw] = await Promise.all([
          fetchJson(getPath('/data/forecast-skill.json'), fetchImpl).catch(() => null),
          fetchJson(getPath('/data/ih-buoys.json'), fetchImpl).catch(() => null),
        ]);
        skill = parseForecastSkillBuoys(skillRaw);
        ih = ihRaw as Record<string, unknown> | null;
      } catch {
        /* degrade */
      }
      if (!ih || !ih.spotMapping) {
        try {
          wmo = (await fetchJson(getPath('/data/wmo-buoys.json'), fetchImpl).catch(() => null)) as Record<string, unknown> | null;
        } catch {
          /* degrade */
        }
      }
      clientCache = { ih, wmo, skill };
      return clientCache;
    })().finally(() => {
      clientInflight = null;
    });
  }
  await clientInflight;
  return forecastSkillSpotResult(spotId, clientCache!);
}

/** Test hook: clear the client cache. */
export function clearForecastSkillClientCache(): void {
  clientCache = null;
  clientInflight = null;
}
