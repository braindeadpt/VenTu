/**
 * Coherence trend — derive a per-pair, per-day verdict trend from the HOURLY
 * archive (buoy-coherence-archive.json) so the data dashboard can show "how
 * often did each ES×PT pair drift apart over the window" as a compact stacked
 * bar chart (one segment per day, coloured by verdict).
 *
 * The archive stores one row per ES×PT pair per UTC hour: { pair, codes,
 * hour, esHs, ptHs }. We group by (day, codes), compute n / mean|Δ| per day
 * and bucket a daily verdict with the SAME thresholds the pipeline uses
 * (mirrors scripts/lib/buoyCoherence.js + buoyCoherenceDaily.js), so the
 * client chart matches what the validator/merge decisions see.
 *
 * Pure and testable — no fetch, no React.
 */

export type CoherenceVerdict = 'coherent' | 'review' | 'incoherent' | 'insufficient';

export interface CoherenceDayPoint {
  day: string;
  /** UTC hour of the latest reading in that day's bucket (for tooltip). */
  lastHour: string;
  n: number;
  meanAbsDeltaM: number;
  meanDeltaM: number;
  verdict: CoherenceVerdict;
}

export interface CoherencePairTrend {
  /** Display key: codes.join('|'). */
  key: string;
  /** Pair label from the archive (e.g. 'Cabo Silleiro × Porto'). */
  pair: string;
  codes: string[];
  days: CoherenceDayPoint[];
  /** Rollup over the window (non-insufficient days). */
  coherent: number;
  review: number;
  incoherent: number;
  insufficient: number;
  incoherentRatio: number;
}

export interface CoherenceTrendData {
  fetchedAt: string | null;
  windowDays: number;
  pairs: CoherencePairTrend[];
  hasData: boolean;
}

/** Mirror the producer (buoyCoherenceDaily.js MIN_DAILY_PAIRS). */
const MIN_DAILY_PAIRS = 3;
/** Mirror the producer (buoyCoherence.js gates). */
const MEAN_DELTA_OK_M = 0.8;
const MEAN_DELTA_BAD_M = 1.5;

const round2 = (n: number) => Math.round(n * 100) / 100;

function dailyVerdict(n: number, meanAbsDeltaM: number): CoherenceVerdict {
  if (n < MIN_DAILY_PAIRS) return 'insufficient';
  if (meanAbsDeltaM <= MEAN_DELTA_OK_M) return 'coherent';
  if (meanAbsDeltaM >= MEAN_DELTA_BAD_M) return 'incoherent';
  return 'review';
}

/** Pure: group hourly archive rows into a per-pair, per-day verdict trend. */
export function parseCoherenceTrend(raw: unknown): CoherenceTrendData {
  const empty: CoherenceTrendData = {
    fetchedAt: null,
    windowDays: 0,
    pairs: [],
    hasData: false,
  };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as { fetchedAt?: unknown; windowDays?: unknown; pairs?: unknown };
  const rows = Array.isArray(obj.pairs) ? obj.pairs : [];

  // dayKey = `${day}|${codesKey}` → { codes, pair, perHour: Map<hour,{esHs,ptHs,date}> }
  const buckets = new Map<string, { codes: string[]; pair: string; rowsPerHour: Map<string, { esHs: number; ptHs: number; date: string }> }>();

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const codes = Array.isArray((r as { codes?: unknown }).codes) ? (r as { codes: unknown[] }).codes.map(String) : null;
    const hour = typeof (r as { hour?: unknown }).hour === 'string' ? (r as { hour: string }).hour : null;
    if (!codes || codes.length < 2 || !hour || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hour)) continue;
    const day = hour.slice(0, 10);
    const key = `${day}|${codes.join('|')}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        codes,
        pair: typeof (r as { pair?: unknown }).pair === 'string' ? (r as { pair: string }).pair : codes.join(' × '),
        rowsPerHour: new Map(),
      });
    }
    const esHs = Number((r as { esHs?: unknown }).esHs);
    const ptHs = Number((r as { ptHs?: unknown }).ptHs);
    const date = typeof (r as { date?: unknown }).date === 'string' ? (r as { date: string }).date : `${hour}:00:00Z`;
    if (!Number.isFinite(esHs) || !Number.isFinite(ptHs)) continue;
    const bucket = buckets.get(key)!;
    // keep latest date per hour (mirrors mergeDayPairs dedup)
    const prev = bucket.rowsPerHour.get(hour);
    if (!prev || new Date(date) > new Date(prev.date)) {
      bucket.rowsPerHour.set(hour, { esHs, ptHs, date });
    }
  }

  if (buckets.size === 0) return empty;

  // Assemble per-pair trends.
  const pairData = new Map<string, CoherencePairTrend>();
  for (const b of buckets.values()) {
    const key = b.codes.join('|');
    if (!pairData.has(key)) {
      pairData.set(key, {
        key,
        pair: b.pair,
        codes: b.codes,
        days: [],
        coherent: 0,
        review: 0,
        incoherent: 0,
        insufficient: 0,
        incoherentRatio: 0,
      });
    }
  }

  // Group rows by pair then day.
  const byPairDay = new Map<string, Map<string, Array<{ esHs: number; ptHs: number; date: string }>>>();
  for (const b of buckets.values()) {
    const key = b.codes.join('|');
    if (!byPairDay.has(key)) byPairDay.set(key, new Map());
    const dayMap = byPairDay.get(key)!;
    for (const [hour, row] of b.rowsPerHour) {
      const day = hour.slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(row);
    }
  }

  for (const [key, dayMap] of byPairDay) {
    const trend = pairData.get(key)!;
    for (const [day, rows] of dayMap) {
      let lastHour = '';
      let lastTs = 0;
      for (const r of rows) {
        const t = new Date(r.date).getTime();
        if (Number.isFinite(t) && t >= lastTs) {
          lastTs = t;
          lastHour = new Date(t).toISOString();
        }
      }
      const n = rows.length;
      const deltas = rows.map((r) => r.ptHs - r.esHs);
      const meanAbs = round2(deltas.reduce((s, d) => s + Math.abs(d), 0) / n);
      const mean = round2(deltas.reduce((s, d) => s + d, 0) / n);
      trend.days.push({
        day,
        lastHour,
        n,
        meanAbsDeltaM: meanAbs,
        meanDeltaM: mean,
        verdict: dailyVerdict(n, meanAbs),
      });
    }
    trend.days.sort((a, b) => a.day.localeCompare(b.day));
    for (const d of trend.days) {
      if (d.verdict === 'coherent') trend.coherent += 1;
      else if (d.verdict === 'review') trend.review += 1;
      else if (d.verdict === 'incoherent') trend.incoherent += 1;
      else trend.insufficient += 1;
    }
    const nonInsufficient = trend.coherent + trend.review + trend.incoherent;
    trend.incoherentRatio =
      nonInsufficient > 0 ? round2(trend.incoherent / nonInsufficient) : 0;
  }

  const pairs = [...pairData.values()].sort((a, b) => a.pair.localeCompare(b.pair));

  return {
    fetchedAt: typeof obj.fetchedAt === 'string' ? obj.fetchedAt : null,
    windowDays: Number.isFinite(Number(obj.windowDays)) ? Number(obj.windowDays) : 0,
    pairs,
    hasData: pairs.length > 0,
  };
}