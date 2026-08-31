/**
 * Forecast-skill regression detection — warn when a buoy's ME/RMSE worsens
 * beyond a threshold (model regression), using per-day snapshots.
 *
 * forecast-skill.json byBuoy is a 30-day rolling window recomputed every run:
 * its values drift slowly as new pairs land. To detect a REGRESSION (the
 * model got worse at this buoy, not just noise), we keep per-buoy daily
 * snapshots and compare the RECENT window (last N days) against a BASELINE
 * window (the days before that — the buoy's established skill). When recent
 * RMSE (or |ME|) is worse than baseline by the threshold, the buoy is flagged.
 *
 * The archive lives in public/data/skill-regression-archive.json; the report
 * in public/data/skill-regression.json (both gitignored, optional artifacts —
 * never block the pipeline).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_ARCHIVE_PATH = path.join(__dirname, '../../public/data/skill-regression-archive.json');
const DEFAULT_REPORT_PATH = path.join(__dirname, '../../public/data/skill-regression.json');

/** Keep snapshots for this many days (forecast-skill window is 30d — 60d of history gives a solid baseline). */
const ARCHIVE_WINDOW_DAYS = 60;
/** Recent window: the last N days compared against the baseline. */
const RECENT_WINDOW_DAYS = 7;
/** Baseline window: days [RECENT..RECENT+BASELINE) before today. */
const BASELINE_WINDOW_DAYS = 21;
/** Min recent snapshots before a buoy is evaluated (avoid 1-day noise). */
const MIN_RECENT_SNAPSHOTS = 2;
/** Min baseline snapshots before a comparison is meaningful. */
const MIN_BASELINE_SNAPSHOTS = 3;
/** RMSE worsening threshold (m). */
const RMSE_WORSE_M = 0.3;
/** |ME| worsening threshold (m) — |recent ME| ≥ |baseline ME| + this. */
const ME_ABS_WORSE_M = 0.3;

const round2 = (n) => Math.round(n * 100) / 100;

/** Day key (Europe/Lisbon wall day) for a snapshot. */
function dayKeyOf(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(t));
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function emptyArchive() {
  return { fetchedAt: null, snapshots: [] };
}

/** Read the archive (missing/corrupt → empty). */
function readArchive(outputPath = DEFAULT_ARCHIVE_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyArchive(),
        ...raw,
        snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
      };
    }
  } catch {
    /* corrupt — start fresh */
  }
  return emptyArchive();
}

/** Write the archive atomically. */
function writeArchive(archive, outputPath = DEFAULT_ARCHIVE_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(archive, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, outputPath);
}

/**
 * Add today's byBuoy snapshot to the archive (dedupe per buoy+day — the
 * recomputed rolling stats for a given day, keep the latest fetchedAt).
 * @param {object} archive
 * @param {Record<string, { buoyName?: string, n?: number, me?: number, mae?: number, rmse?: number, corr?: number, meanLeadHours?: number }>} byBuoy from forecast-skill.json
 * @param {string} fetchedAt ISO of the skill report
 */
function mergeSnapshot(archive, byBuoy, fetchedAt) {
  const day = dayKeyOf(fetchedAt);
  if (!day) return 0;
  const prev = archive.snapshots.filter((s) => !(s.day === day && s.buoyId in (byBuoy ?? {})));
  const added = [];
  for (const [buoyId, e] of Object.entries(byBuoy ?? {})) {
    if (!e || typeof e !== 'object') continue;
    const n = Number(e.n);
    const me = Number(e.me);
    const rmse = Number(e.rmse);
    if (!Number.isInteger(n) || n < 10 || !Number.isFinite(me)) continue;
    const snap = {
      day,
      buoyId,
      name: typeof e.buoyName === 'string' && e.buoyName ? e.buoyName : `Buoy ${buoyId}`,
      n,
      me: round2(me),
      ...(Number.isFinite(rmse) ? { rmse: round2(rmse) } : {}),
    };
    // Dedupe by buoy+day: keep the latest (a re-run of the same day replaces).
    const existingIdx = archive.snapshots.findIndex((s) => s.day === day && s.buoyId === buoyId);
    if (existingIdx >= 0) archive.snapshots[existingIdx] = snap;
    else added.push(snap);
  }
  if (added.length > 0) archive.snapshots = [...archive.snapshots, ...added];
  archive.fetchedAt = fetchedAt;
  return added.length;
}

/** Trim snapshots outside the archive window. */
function pruneArchive(archive, nowMs = Date.now(), windowDays = ARCHIVE_WINDOW_DAYS) {
  const cutoff = nowMs - windowDays * 86_400_000;
  archive.snapshots = archive.snapshots.filter((s) => {
    const t = new Date(`${s.day}T12:00:00Z`).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * Mean of a stat over a set of snapshots (finite values only).
 * @returns {number | null}
 */
function meanStat(snaps, key) {
  const vals = snaps.map((s) => s[key]).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Days between a day key and now (>= 0). */
function daysAgo(day, nowMs) {
  const t = new Date(`${day}T12:00:00Z`).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (nowMs - t) / 86_400_000;
}

/**
 * Detect regressions per buoy: recent window (last RECENT_WINDOW_DAYS) vs
 * baseline window (the BASELINE_WINDOW_DAYS before that). A buoy regressed
 * when its recent RMSE is ≥ baseline RMSE + RMSE_WORSE_M OR its |ME| is
 * ≥ baseline |ME| + ME_ABS_WORSE_M, with enough snapshots on both sides.
 * @param {object} archive
 * @param {{ nowMs?: number, recentDays?: number, baselineDays?: number, minRecentSnapshots?: number, minBaselineSnapshots?: number, rmseWorseM?: number, meAbsWorseM?: number }} [opts]
 * @returns {{ checkedAt: string, windowDays: number, recentDays: number, baselineDays: number, thresholds: { rmseWorseM: number, meAbsWorseM: number }, byBuoy: object, regressions: Array<object> }}
 */
function buildRegressionReport(archive, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const recentDays = opts.recentDays ?? RECENT_WINDOW_DAYS;
  const baselineDays = opts.baselineDays ?? BASELINE_WINDOW_DAYS;
  const minRecent = opts.minRecentSnapshots ?? MIN_RECENT_SNAPSHOTS;
  const minBaseline = opts.minBaselineSnapshots ?? MIN_BASELINE_SNAPSHOTS;
  const rmseWorseM = opts.rmseWorseM ?? RMSE_WORSE_M;
  const meAbsWorseM = opts.meAbsWorseM ?? ME_ABS_WORSE_M;

  const byBuoy = {};
  const byId = new Map();
  for (const s of archive.snapshots) {
    if (!byId.has(s.buoyId)) byId.set(s.buoyId, { buoyId: s.buoyId, name: s.name, snaps: [] });
    byId.get(s.buoyId).snaps.push(s);
  }

  const regressions = [];
  for (const entry of byId.values()) {
    const recent = entry.snaps.filter((s) => daysAgo(s.day, nowMs) < recentDays);
    const baseline = entry.snaps.filter(
      (s) => daysAgo(s.day, nowMs) >= recentDays && daysAgo(s.day, nowMs) < recentDays + baselineDays,
    );
    if (recent.length < minRecent || baseline.length < minBaseline) {
      byBuoy[entry.buoyId] = {
        name: entry.name,
        recentSnapshots: recent.length,
        baselineSnapshots: baseline.length,
        verdict: 'insufficient',
      };
      continue;
    }
    const rRmse = meanStat(recent, 'rmse');
    const bRmse = meanStat(baseline, 'rmse');
    const rMe = meanStat(recent, 'me');
    const bMe = meanStat(baseline, 'me');
    const entryOut = {
      name: entry.name,
      recent: {
        snapshots: recent.length,
        rmse: rRmse,
        me: rMe,
        n: meanStat(recent, 'n'),
      },
      baseline: {
        snapshots: baseline.length,
        rmse: bRmse,
        me: bMe,
        n: meanStat(baseline, 'n'),
      },
    };
    const rmseDelta = rRmse != null && bRmse != null ? round2(rRmse - bRmse) : null;
    const meAbsDelta = rMe != null && bMe != null ? round2(Math.abs(rMe) - Math.abs(bMe)) : null;
    entryOut.rmseDelta = rmseDelta;
    entryOut.meAbsDelta = meAbsDelta;

    const rmseRegressed = rmseDelta != null && rmseDelta >= rmseWorseM;
    const meRegressed = meAbsDelta != null && meAbsDelta >= meAbsWorseM;
    entryOut.verdict = rmseRegressed || meRegressed ? 'regressed' : 'ok';
    if (entryOut.verdict === 'regressed') {
      regressions.push({
        buoyId: entry.buoyId,
        name: entry.name,
        ...entryOut,
        reasons: [
          ...(rmseRegressed ? [`RMSE +${round2(rmseDelta)} m (limiar +${rmseWorseM})`] : []),
          ...(meRegressed ? [`|ME| +${round2(meAbsDelta)} m (limiar +${meAbsWorseM})`] : []),
        ],
      });
    }
    byBuoy[entry.buoyId] = entryOut;
  }

  regressions.sort((a, b) => b.rmseDelta - a.rmseDelta || b.meAbsDelta - a.meAbsDelta);

  return {
    source: 'forecast-skill-regression',
    checkedAt: new Date(nowMs).toISOString(),
    windowDays: ARCHIVE_WINDOW_DAYS,
    recentDays,
    baselineDays,
    thresholds: { rmseWorseM, meAbsWorseM },
    minRecentSnapshots: minRecent,
    minBaselineSnapshots: minBaseline,
    byBuoy,
    regressions,
  };
}

/** Read the previous report (for transition detection). */
function readReport(outputPath = DEFAULT_REPORT_PATH) {
  if (!fs.existsSync(outputPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Atomically write the report. */
function writeReport(report, outputPath = DEFAULT_REPORT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.renameSync(tmpPath, outputPath);
}

/**
 * Notify when buoys TRANSITION to regressed (warn once per buoy, not every
 * run). Telegram opt-in via OPS_TELEGRAM_CHAT_ID; without it → dry-run log.
 * @param {object} report current report
 * @param {{ send?: (chatId: string, text: string) => Promise<boolean>, chatId?: string, reportPath?: string, log?: (msg: string) => void }} [opts]
 * @returns {Promise<{ notified: boolean, newlyRegressed: Array<string>, reason?: string }>}
 */
async function notifyRegressions(report, opts = {}) {
  const log = opts.log ?? ((m) => console.log(m));
  const regressions = Array.isArray(report.regressions) ? report.regressions : [];
  if (regressions.length === 0) {
    return { notified: false, newlyRegressed: [], reason: 'no-regressions' };
  }
  const prev = readReport(opts.reportPath) ?? {};
  const prevSet = new Set(
    (Array.isArray(prev.regressions) ? prev.regressions : []).map((r) => String(r.buoyId)),
  );
  const newly = regressions.filter((r) => !prevSet.has(String(r.buoyId)));

  if (newly.length === 0) {
    return { notified: false, newlyRegressed: [], reason: 'already-reported' };
  }

  const list = newly
    .map((r) => `${r.name} (${r.buoyId}): ${r.reasons.join('; ')}`)
    .join('\n');
  const text =
    `⚠️ VenTu — regressão do forecast de onda por boia:\n${list}\n` +
    `(skill real, forecast-skill.json · verificado em ${report.checkedAt})`;

  const chatId = opts.chatId ?? process.env.OPS_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    log(`  ⚠️ Boia(s) com regressão nova: ${newly.map((r) => r.name).join(', ')} — OPS_TELEGRAM_CHAT_ID não definido (dry-run).`);
    return { notified: false, newlyRegressed: newly.map((r) => r.name), reason: 'no-chat-id' };
  }

  const send = opts.send ?? require('./telegram').sendTelegramMessage;
  await send(chatId, text);
  return { notified: true, newlyRegressed: newly.map((r) => r.name) };
}

module.exports = {
  DEFAULT_ARCHIVE_PATH,
  DEFAULT_REPORT_PATH,
  ARCHIVE_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  BASELINE_WINDOW_DAYS,
  MIN_RECENT_SNAPSHOTS,
  MIN_BASELINE_SNAPSHOTS,
  RMSE_WORSE_M,
  ME_ABS_WORSE_M,
  dayKeyOf,
  emptyArchive,
  readArchive,
  writeArchive,
  mergeSnapshot,
  pruneArchive,
  buildRegressionReport,
  readReport,
  writeReport,
  notifyRegressions,
  meanStat,
  daysAgo,
};
