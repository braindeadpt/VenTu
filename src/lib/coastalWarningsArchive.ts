/**
 * IH coastal navigation warnings archive — build-time reader for the About
 * page (same pattern as forecastSkill.ts / ihKeyStatus.ts).
 *
 * scripts/fetch-ih-coastal-warnings.js accumulates one snapshot per Lisbon
 * day into public/data/ih-coastal-warnings-archive.json and derives a
 * per-ref timeline (firstSeen/lastSeen/daysInForce). This module parses that
 * file (server-side, SSG) so the About can show WHEN each warning was in
 * force — missing/corrupt file degrades to an empty result (section hides).
 */

export interface ArchivedCoastalRef {
  ref: string;
  category: string;
  source: 'ih' | 'es';
  url: string;
  firstSeen: string;
  lastSeen: string;
  daysInForce: string[];
  nDays: number;
}

export interface CoastalWarningsArchiveData {
  fetchedAt: string | null;
  windowDays: number;
  dayCount: number;
  refs: ArchivedCoastalRef[];
  /** Avisos em vigor por dia, do primeiro ao último dia observado (janela). */
  dailyActive: { date: string; count: number }[];
  hasData: boolean;
}

const isDateKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** YYYY-MM-DD para o dia seguinte (fixed-offset UTC das 12:00, sem fuso). */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure: deriva a série diária «avisos em vigor por dia» a partir do array
 * `days` do arquivo (snapshots diários, `{ date, warnings[] }`). Normaliza em
 * dias contíguos de min→max com contagens (0 onde não houve snapshot/sem
 * avisos) — devolve [] quando não há dias válidos.
 */
function buildDailyActive(rawDays: unknown): { date: string; count: number }[] {
  if (!Array.isArray(rawDays)) return [];
  const countByDay = new Map<string, number>();
  let min = '';
  let max = '';
  for (const entry of rawDays) {
    if (!entry || typeof entry !== 'object') continue;
    const d = (entry as { date?: unknown }).date;
    if (!isDateKey(d)) continue;
    const warnings = (entry as { warnings?: unknown }).warnings;
    const ids = new Set<string>();
    if (Array.isArray(warnings)) {
      for (const w of warnings) {
        if (w && typeof w === 'object') {
          const id = (w as { id?: unknown }).id;
          if (id != null) ids.add(String(id));
        }
      }
    }
    countByDay.set(d, ids.size);
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) return [];
  const out: { date: string; count: number }[] = [];
  let cur = min;
  while (cur <= max) {
    out.push({ date: cur, count: countByDay.get(cur) ?? 0 });
    if (cur === max) break;
    cur = nextDay(cur);
  }
  return out;
}

function sanitizeRef(raw: unknown): ArchivedCoastalRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    ref?: unknown;
    category?: unknown;
    source?: unknown;
    url?: unknown;
    firstSeen?: unknown;
    lastSeen?: unknown;
    daysInForce?: unknown;
    nDays?: unknown;
  };
  const ref = typeof r.ref === 'string' && r.ref ? r.ref : null;
  const firstSeen = isDateKey(r.firstSeen) ? r.firstSeen : null;
  const lastSeen = isDateKey(r.lastSeen) ? r.lastSeen : null;
  if (!ref || !firstSeen || !lastSeen) return null;
  const daysInForce = Array.isArray(r.daysInForce)
    ? r.daysInForce.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
  const n = Number(r.nDays);
  return {
    ref,
    category: typeof r.category === 'string' ? r.category : '',
    source: r.source === 'es' ? 'es' : 'ih',
    url: typeof r.url === 'string' ? r.url : '',
    firstSeen,
    lastSeen,
    daysInForce: [...new Set(daysInForce)].sort(),
    nDays: Number.isInteger(n) && n >= 0 ? n : daysInForce.length,
  };
}

/**
 * Pure: parse a raw archive object into the typed shape. Never throws —
 * invalid entries are dropped, and hasData reflects whether any ref survived.
 */
export function parseCoastalWarningsArchive(raw: unknown): CoastalWarningsArchiveData {
  const empty: CoastalWarningsArchiveData = {
    fetchedAt: null,
    windowDays: 90,
    dayCount: 0,
    refs: [],
    dailyActive: [],
    hasData: false,
  };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as {
    fetchedAt?: unknown;
    windowDays?: unknown;
    dayCount?: unknown;
    refs?: unknown;
    days?: unknown;
  };
  const refs = Array.isArray(obj.refs)
    ? obj.refs.map(sanitizeRef).filter((r): r is ArchivedCoastalRef => r !== null)
    : [];
  refs.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.ref.localeCompare(b.ref));
  const dayCount = Number(obj.dayCount);
  const windowDays = Number(obj.windowDays);
  return {
    fetchedAt: typeof obj.fetchedAt === 'string' ? obj.fetchedAt : null,
    windowDays: Number.isInteger(windowDays) && windowDays > 0 ? windowDays : 90,
    dayCount: Number.isInteger(dayCount) && dayCount >= 0 ? dayCount : 0,
    refs,
    dailyActive: buildDailyActive(obj.days),
    hasData: refs.length > 0,
  };
}

let cached: CoastalWarningsArchiveData | null = null;

/**
 * Read public/data/ih-coastal-warnings-archive.json at build time (SSG,
 * About page). Missing/corrupt → empty result (the section simply hides).
 * Module-level cache — the page is statically generated, so it runs once.
 */
export function loadCoastalWarningsArchive(): CoastalWarningsArchiveData {
  if (cached) return cached;
  if (typeof window !== 'undefined') return parseCoastalWarningsArchive(null);
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public/data/ih-coastal-warnings-archive.json');
    if (fs.existsSync(filePath)) {
      cached = parseCoastalWarningsArchive(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
      return cached;
    }
  } catch (e) {
    console.warn('Failed to load ih-coastal-warnings-archive.json:', e);
  }
  cached = parseCoastalWarningsArchive(null);
  return cached;
}

/** Test hook: clear the module cache. */
export function clearCoastalWarningsArchiveCache(): void {
  cached = null;
}
