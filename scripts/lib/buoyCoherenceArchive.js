/**
 * Cross-border buoy coherence archive — ES×PT hourly pairs accumulated day
 * after day (same pattern as forecast-skill.json).
 *
 * The PT Datawell buoys report sparsely (a handful of readings per day at odd
 * minutes), so a single run rarely has n ≥ 3 overlapping hours → the daily
 * verdict is 'insufficient' even when the buoys track each other. This archive
 * merges each run's aligned hourly pairs (dedupe by pair + UTC hour, keep the
 * latest), prunes to a rolling window and lets check-buoy-coherence.js compute
 * the verdict over the accumulated sample — enough n even with sparse PT.
 *
 * Shape of an archived pair:
 *   { pair: 'Cabo Silleiro × Porto', codes: ['6200084', '6201077'],
 *     hour: '2026-08-14T08', esHs: 1.6, ptHs: 1.5, date: '2026-08-14T08:00:00Z' }
 * `date` is the UTC hour start (pruning anchor — the real readings are within
 * that hour, so age is accurate to within an hour).
 */

const fs = require('fs');
const path = require('path');
const { pairStats, verdictFor, MIN_ACCUMULATED_PAIRS } = require('./buoyCoherence.js');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '../../public/data/buoy-coherence-archive.json');

/** Keep the archive trimmed to this many days of pair history. */
const ARCHIVE_WINDOW_DAYS = 30;

function emptyArchive() {
  return { fetchedAt: null, windowDays: ARCHIVE_WINDOW_DAYS, pairs: [] };
}

/** Read the archive (missing/corrupt → empty). */
function readArchive(outputPath = DEFAULT_OUTPUT_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyArchive(),
        ...raw,
        pairs: Array.isArray(raw.pairs) ? raw.pairs : [],
      };
    }
  } catch {
    /* corrupt archive — start fresh */
  }
  return emptyArchive();
}

/** Write the archive atomically. */
function writeArchive(archive, outputPath = DEFAULT_OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(archive, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, outputPath);
}

/** Dedupe key: one hourly pair per ES×PT pair per UTC hour. */
function pairHourKey(p) {
  return `${p.codes.join('|')}|${p.hour}`;
}

/**
 * Merge new hourly aligned pairs into the archive — one entry per pair+hour,
 * the LATEST `date` wins (a re-fetch of the same hour replaces the reading).
 * @param {object} archive
 * @param {Array<{ pair: string, codes: Array<string>, hour: string, esHs: number, ptHs: number, date: string }>} newPairs
 * @returns {number} pairs added/updated
 */
function mergeDayPairs(archive, newPairs) {
  if (!Array.isArray(newPairs) || newPairs.length === 0) return 0;
  const seen = new Map();
  for (const p of archive.pairs) {
    const k = pairHourKey(p);
    const cur = seen.get(k);
    if (!cur || new Date(p.date) > new Date(cur.date)) seen.set(k, p);
  }
  let touched = 0;
  for (const p of newPairs) {
    const k = pairHourKey(p);
    const cur = seen.get(k);
    if (!cur || new Date(p.date) > new Date(cur.date)) {
      seen.set(k, p);
      touched += 1;
    }
  }
  archive.pairs = [...seen.values()].sort((a, b) =>
    `${a.codes.join('|')}${a.hour}`.localeCompare(`${b.codes.join('|')}${b.hour}`),
  );
  return touched;
}

/** Drop pairs outside the rolling window (by the hour-start `date`). */
function pruneArchive(archive, nowMs = Date.now(), windowDays = ARCHIVE_WINDOW_DAYS) {
  const cutoff = nowMs - windowDays * 86_400_000;
  archive.pairs = archive.pairs.filter((p) => {
    const t = new Date(p.date).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * Accumulated stats + verdict for one ES×PT pair over the archived window.
 * @param {object} archive
 * @param {Array<string>} codes e.g. ['6200084', '6201077']
 * @param {{ minPairs?: number, okM?: number, badM?: number }} [opts]
 * @returns {{
 *   n: number,
 *   meanDeltaM: number,
 *   meanAbsDeltaM: number,
 *   maxAbsDeltaM: number,
 *   corr: number | null,
 *   verdict: 'coherent' | 'review' | 'incoherent' | 'insufficient',
 *   firstHour: string,
 *   lastHour: string,
 * } | null} null when the pair has no archived hours
 */
function pairStatsFromArchive(archive, codes, opts = {}) {
  const key = codes.join('|');
  const rows = (archive.pairs ?? []).filter((p) => p.codes.join('|') === key);
  if (rows.length === 0) return null;
  const pairs = rows.map((p) => ({ a: p.esHs, b: p.ptHs }));
  const stats = pairStats(pairs);
  if (!stats) return null;
  return {
    ...stats,
    // O veredicto sobre a JANELA acumulada exige amostra maior (não 3 horas
    // esparsas): o gate é MIN_ACCUMULATED_PAIRS a não ser que o chamador o
    // sobreponha (per-day verdicts, por exemplo, usam um floor menor).
    verdict: verdictFor(stats, { minPairs: MIN_ACCUMULATED_PAIRS, ...opts }),
    firstHour: rows[0].hour,
    lastHour: rows[rows.length - 1].hour,
  };
}

module.exports = {
  ARCHIVE_WINDOW_DAYS,
  DEFAULT_OUTPUT_PATH,
  emptyArchive,
  readArchive,
  writeArchive,
  mergeDayPairs,
  pruneArchive,
  pairStatsFromArchive,
};
