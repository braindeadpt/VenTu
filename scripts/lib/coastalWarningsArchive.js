/**
 * IH coastal navigation warnings archive — daily snapshots accumulated day
 * after day, so the About/archive can show WHEN a warning was in force.
 *
 * The fetch (fetch-ih-coastal-warnings.js) bakes only the warnings in force
 * TODAY (nav_warning_coastal) — they expire and the file forgets them. This
 * archive keeps one snapshot per Lisbon calendar day ({ date, warnings[] })
 * and derives a per-ref timeline (firstSeen/lastSeen/daysInForce), the same
 * pattern as wind-bias.json / buoy-coherence-archive.json: read → merge →
 * prune → write atomically, committed to public/data so the SSG About page
 * can render the history without a network call.
 *
 * Shape of an archived warning (compact — no polygons, the geometry is only
 * needed by the live map overlay):
 *   { id, ref, category, source: 'ih' | 'es', url }
 *
 * Shape of the file:
 *   { fetchedAt, windowDays, dayCount, days: [{ date, warnings[] }],
 *     refs: [{ ref, category, source, url, firstSeen, lastSeen,
 *              daysInForce: string[], nDays }] }
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '../../public/data/ih-coastal-warnings-archive.json');

/** Keep the archive trimmed to this many days of daily snapshots. */
const ARCHIVE_WINDOW_DAYS = 90;

/** YYYY-MM-DD in Europe/Lisbon — the calendar day a snapshot belongs to. */
function lisbonDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(date);
}

function emptyArchive() {
  return { fetchedAt: null, windowDays: ARCHIVE_WINDOW_DAYS, dayCount: 0, days: [], refs: [] };
}

/** Read the archive (missing/corrupt → empty). */
function readArchive(outputPath = DEFAULT_OUTPUT_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyArchive(),
        ...raw,
        days: Array.isArray(raw.days) ? raw.days : [],
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

/** Compact a live warning into its archived form (no polygons). */
function toArchivedWarning(w) {
  return {
    id: Number(w?.id),
    ref: String(w?.ref ?? ''),
    category: String(w?.category ?? ''),
    source: w?.source === 'es' ? 'es' : 'ih',
    url: String(w?.url ?? ''),
  };
}

/**
 * Merge today's snapshot into the archive — one entry per date, the LATEST
 * run of the same day replaces the previous (a re-fetch corrects the day).
 * @param {object} archive
 * @param {Array<{ id: number, ref: string, category: string, source: string, url: string }>} warnings
 * @param {string} [dateStr] Lisbon YYYY-MM-DD (defaults to today)
 * @returns {{ replaced: boolean, dayCount: number }}
 */
function mergeDaySnapshot(archive, warnings, dateStr = lisbonDateStr()) {
  const byDate = new Map(archive.days.map((d) => [d.date, d]));
  const replaced = byDate.has(dateStr);
  byDate.set(dateStr, {
    date: dateStr,
    warnings: (Array.isArray(warnings) ? warnings : []).map(toArchivedWarning),
  });
  archive.days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  archive.dayCount = archive.days.length;
  archive.fetchedAt = new Date().toISOString();
  return { replaced, dayCount: archive.days.length };
}

/** Drop snapshots outside the rolling window (by date). */
function pruneArchive(archive, nowMs = Date.now(), windowDays = ARCHIVE_WINDOW_DAYS) {
  const cutoff = new Date(nowMs - windowDays * 86_400_000).toISOString().slice(0, 10);
  archive.days = archive.days.filter((d) => d.date >= cutoff);
  archive.dayCount = archive.days.length;
}

/**
 * Derive the per-ref timeline from the daily snapshots: when each warning was
 * first/last seen and on which days. Keyed by ref (the human ANAV label) —
 * stable across fetches; id/category/source/url come from the latest sighting.
 * Sorted by lastSeen desc (most recent activity first).
 * @param {object} archive
 * @returns {Array<{ ref: string, category: string, source: string, url: string,
 *   firstSeen: string, lastSeen: string, daysInForce: string[], nDays: number }>}
 */
function buildRefTimeline(archive) {
  const byRef = new Map();
  for (const day of archive.days) {
    for (const w of day.warnings ?? []) {
      if (!w.ref) continue;
      const cur = byRef.get(w.ref) ?? {
        ref: w.ref,
        category: '',
        source: 'ih',
        url: '',
        firstSeen: day.date,
        lastSeen: day.date,
        daysInForce: [],
      };
      if (day.date < cur.firstSeen) cur.firstSeen = day.date;
      if (day.date > cur.lastSeen) cur.lastSeen = day.date;
      if (!cur.daysInForce.includes(day.date)) cur.daysInForce.push(day.date);
      if (w.category) cur.category = w.category;
      if (w.url) cur.url = w.url;
      if (w.source === 'es') cur.source = 'es';
      byRef.set(w.ref, cur);
    }
  }
  const out = [...byRef.values()];
  for (const r of out) {
    r.daysInForce.sort();
    r.nDays = r.daysInForce.length;
  }
  out.sort((a, b) =>
    b.lastSeen.localeCompare(a.lastSeen) || a.ref.localeCompare(b.ref),
  );
  return out;
}

/** Rebuild refs + metadata after merges/prunes and return the final report. */
function buildReport(archive) {
  archive.refs = buildRefTimeline(archive);
  archive.dayCount = archive.days.length;
  return archive;
}

module.exports = {
  ARCHIVE_WINDOW_DAYS,
  DEFAULT_OUTPUT_PATH,
  lisbonDateStr,
  emptyArchive,
  readArchive,
  writeArchive,
  toArchivedWarning,
  mergeDaySnapshot,
  pruneArchive,
  buildRefTimeline,
  buildReport,
};
