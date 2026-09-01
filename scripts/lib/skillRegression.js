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
/**
 * Plataforma: fracção da baseline abaixo da qual o n diário colapsou
 * (recent < baseline × isto → colapso). Deteta quando o fluxo de uma
 * plataforma quebrou (ex: IH_API_KEY expirou, Copernicus deixou de publicar).
 */
const N_COLLAPSE_FACTOR = 0.5;
/** Baseline diária mínima (n) para o colapso ser significativo — uma plataforma
 *  que mal começou não está a “colapsar”. */
const MIN_BASELINE_PLATFORM_N = 10;
/** Días recentes mínimos da plataforma antes de avaliar. */
const MIN_RECENT_PLATFORM_DAYS = 1;
/** Días baseline mínimos antes de comparar. */
const MIN_BASELINE_PLATFORM_DAYS = 3;
/** Rótulos por plataforma para o report/aviso. */
const PLATFORM_LABELS = { ih: 'IH (Datawell)', 'wmo-es': 'WMO-ES (Copernicus)' };

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
 *
 * Deals with both key types from forecast-skill.json byBuoy: numeric IH idEst
 * (4, 19 …) and string WMO platform codes (6200084 Cabo Silleiro …). The WMO-ES
 * buoys come from the keyless Copernicus route, so the NW regression warning
 * fires without depending on IH_API_KEY. The `origin` ('ih' | 'wmo-es') is
 * carried through so the audit/snapshot can tell the platforms apart.
 * @param {object} archive
 * @param {Record<string, { buoyName?: string, n?: number, me?: number, mae?: number, rmse?: number, corr?: number, meanLeadHours?: number, origin?: string }>} byBuoy from forecast-skill.json
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
      // Preserva a origem (ih | wmo-es) quando presente — as boias ES (string)
      // são o caminho keyless que cobre o NW sem IH_API_KEY.
      ...(e.origin === 'ih' || e.origin === 'wmo-es' ? { origin: e.origin } : {}),
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
  const nCollapseFactor = opts.nCollapseFactor ?? N_COLLAPSE_FACTOR;
  const minBaselinePlatformN = opts.minBaselinePlatformN ?? MIN_BASELINE_PLATFORM_N;
  const minRecentDays = opts.minRecentPlatformDays ?? MIN_RECENT_PLATFORM_DAYS;
  const minBaselineDays = opts.minBaselinePlatformDays ?? MIN_BASELINE_PLATFORM_DAYS;

  const byBuoy = {};
  const byId = new Map();
  for (const s of archive.snapshots) {
    if (!byId.has(s.buoyId)) byId.set(s.buoyId, { buoyId: s.buoyId, name: s.name, snaps: [] });
    // A origem (ih/wmo-es) pode variar entre snapshots legacy/posteriores —
    // apo médio mais recente vence para o report expor fins de auditoria.
    if (s.origin === 'ih' || s.origin === 'wmo-es') byId.get(s.buoyId).origin = s.origin;
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
        ...(entry.origin ? { origin: entry.origin } : {}),
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
      ...(entry.origin ? { origin: entry.origin } : {}),
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
        ...(entry.origin ? { origin: entry.origin } : {}),
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

  const platformHealth = buildPlatformHealth(archive, opts);

  return {
    source: 'forecast-skill-regression',
    checkedAt: new Date(nowMs).toISOString(),
    windowDays: ARCHIVE_WINDOW_DAYS,
    recentDays,
    baselineDays,
    thresholds: { rmseWorseM, meAbsWorseM },
    platformThresholds: {
      nCollapseFactor,
      minBaselinePlatformN,
      minRecentPlatformDays: minRecentDays,
      minBaselinePlatformDays: minBaselineDays,
    },
    minRecentSnapshots: minRecent,
    minBaselineSnapshots: minBaseline,
    byBuoy,
    regressions,
    // Health por plataforma (IH vs WMO-ES agregado) — separado do total misto
    // para apanhar degradações difusas e quebras de fluxo que o per-buoy perde.
    platforms: platformHealth.platforms,
    platformAlerts: platformHealth.alerts,
  };
}

/**
 * Origem de um snapshot — explícita quando presente, senão derivada do tipo de
 * buoyId (numérico IH idEst vs string WMO platform code) para os legacy. As
 * boias ES (string) são o caminho keyless que cobre o NW sem IH_API_KEY.
 */
function originOfSnapshot(s) {
  if (s && (s.origin === 'ih' || s.origin === 'wmo-es')) return s.origin;
  return s && typeof s.buoyId === 'number' ? 'ih' : 'wmo-es';
}

/**
 * Health por PLATAFORMA (IH vs WMO-ES agregado) — não só a regressão por boia
 * nem o total misto. Agrega os snapshots diários das boias de cada plataforma
 * por dia (n = soma das boias; ME ponderado por n) e avisa quando:
 *   1. o n diário da plataforma COLAPSA: recente < baseline × N_COLLAPSE_FACTOR
 *      (o fluxo da plataforma quebrou — menos leituras a chegarem);
 *   2. o ME da plataforma PIORA: |recent ME| ≥ |baseline ME| + ME_ABS_WORSE_M
 *      (o viés sistemático da plataforma a crescer, mesmo sem boia individual
 *      a saltar o limiar).
 * A nível de plataforma isto apanha degradações difusas que o per-buoy perde
 * (ex: todas as boias pioram 0.25 m — nenhuma regista, mas a plataforma sim).
 * @returns {{ platforms: object, alerts: Array<object> }} platforms keyed by
 *   'ih'|'wmo-es' (null quando sem snapshots); alerts = plataformas afetadas.
 */
function buildPlatformHealth(archive, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const recentDays = opts.recentDays ?? RECENT_WINDOW_DAYS;
  const baselineDays = opts.baselineDays ?? BASELINE_WINDOW_DAYS;
  const collapseFactor = opts.nCollapseFactor ?? N_COLLAPSE_FACTOR;
  const minBaselineN = opts.minBaselinePlatformN ?? MIN_BASELINE_PLATFORM_N;
  const minRecentDays = opts.minRecentPlatformDays ?? MIN_RECENT_PLATFORM_DAYS;
  const minBaselineDays = opts.minBaselinePlatformDays ?? MIN_BASELINE_PLATFORM_DAYS;
  const meAbsWorseM = opts.meAbsWorseM ?? ME_ABS_WORSE_M;

  const platforms = { ih: null, 'wmo-es': null };
  const alerts = [];

  for (const origin of ['ih', 'wmo-es']) {
    const snaps = archive.snapshots.filter((s) => originOfSnapshot(s) === origin);
    if (snaps.length === 0) {
      platforms[origin] = null;
      continue;
    }

    // Agrega por dia: n = soma das boias da plataforma; me ponderado por n.
    const byDay = new Map();
    for (const s of snaps) {
      const n = Number(s.n);
      if (!Number.isFinite(n) || n <= 0) continue;
      const d = byDay.get(s.day) ?? { day: s.day, n: 0, meSum: 0 };
      d.n += n;
      d.meSum += (Number(s.me) || 0) * n;
      byDay.set(s.day, d);
    }
    const days = [...byDay.values()];
    const recent = days.filter((d) => daysAgo(d.day, nowMs) < recentDays);
    const baseline = days.filter(
      (d) =>
        daysAgo(d.day, nowMs) >= recentDays &&
        daysAgo(d.day, nowMs) < recentDays + baselineDays,
    );

    const recentN = meanStat(recent, 'n');
    const baselineN = meanStat(baseline, 'n');
    const weightedMe = (list) => {
      if (list.length === 0) return null;
      const sumN = list.reduce((a, d) => a + d.n, 0);
      if (sumN <= 0) return null;
      return list.reduce((a, d) => a + d.meSum, 0) / sumN;
    };
    const recentMe = weightedMe(recent);
    const baselineMe = weightedMe(baseline);

    const entry = {
      platform: origin,
      name: PLATFORM_LABELS[origin],
      recent: { days: recent.length, n: round2(recentN ?? 0), me: recentMe },
      baseline: { days: baseline.length, n: round2(baselineN ?? 0), me: baselineMe },
    };

    if (recent.length < minRecentDays || baseline.length < minBaselineDays) {
      entry.verdict = 'insufficient';
      platforms[origin] = entry;
      continue;
    }

    const meAbsDelta =
      recentMe != null && baselineMe != null
        ? round2(Math.abs(recentMe) - Math.abs(baselineMe))
        : null;
    entry.meAbsDelta = meAbsDelta;

    // n colapso: recente abaixo de fracção da baseline (com baseline não trivial,
    // para não soar alarme quando a plataforma acabou de arrancar).
    const collapsed =
      baselineN != null &&
      baselineN >= minBaselineN &&
      recentN != null &&
      recentN < baselineN * collapseFactor;
    const nDeltaFraction =
      collapsed && baselineN != null && recentN != null
        ? round2(recentN / baselineN)
        : null;
    entry.nDeltaFraction = nDeltaFraction;

    const meWorsened = meAbsDelta != null && meAbsDelta >= meAbsWorseM;

    // O colapso de n é mais grave que a piora de ME — tem prioridade no verdict,
    // mas ambos entram nos reasons/alerts.
    entry.verdict = collapsed
      ? 'n-collapse'
      : meWorsened
        ? 'me-worsened'
        : 'ok';
    entry.reasons = [
      ...(collapsed
        ? [`n da plataforma colapsou (recente ${recentN} vs baseline ${baselineN}/dia, ×${nDeltaFraction})`]
        : []),
      ...(meWorsened
        ? [`|ME| piorou +${meAbsDelta} m (limiar +${meAbsWorseM})`]
        : []),
    ];

    if (collapsed || meWorsened) alerts.push(entry);
    platforms[origin] = entry;
  }

  return { platforms, alerts };
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
  // Plataforma (IH/WMO-ES agregado) — avisos de n colapsado ou ME a piorar.
  const platformAlerts = Array.isArray(report.platformAlerts) ? report.platformAlerts : [];
  if (regressions.length === 0 && platformAlerts.length === 0) {
    return { notified: false, newlyRegressed: [], reason: 'no-regressions' };
  }
  const prev = readReport(opts.reportPath) ?? {};
  const prevSet = new Set(
    (Array.isArray(prev.regressions) ? prev.regressions : []).map((r) => String(r.buoyId)),
  );
  const newly = regressions.filter((r) => !prevSet.has(String(r.buoyId)));

  // Transição por plataforma: chave <platform>:<verdict>, para só avisar quando
  // o estado da plataforma MUDOU (ex: voltou a ok no dia seguinte = sem alarme).
  const prevPlat = new Set(
    (Array.isArray(prev.platformAlerts) ? prev.platformAlerts : []).map(
      (a) => `${a.platform}:${a.verdict}`,
    ),
  );
  const newPlat = platformAlerts.filter((a) => !prevPlat.has(`${a.platform}:${a.verdict}`));

  if (newly.length === 0 && newPlat.length === 0) {
    return { notified: false, newlyRegressed: [], newPlatformAlerts: [], reason: 'already-reported' };
  }

  const list = newly
    .map((r) => {
      const origin = r.origin === 'wmo-es' ? ' (WMO-ES, keyless)' : r.origin === 'ih' ? ' (IH)' : '';
      return `${r.name} (${r.buoyId}${origin}): ${r.reasons.join('; ')}`;
    })
    .join('\n');
  const platList = newPlat
    .map((a) => {
      const flag = a.platform === 'wmo-es' ? ' 🇪🇸 WMO-ES' : a.platform === 'ih' ? ' IH' : '';
      return `Plataforma ${a.name}${flag}: ${a.reasons.join('; ')}`;
    })
    .join('\n');
  const text = [
    ...(list ? [`⚠️ VenTu — regressão do forecast de onda por boia:\n${list}`] : []),
    ...(platList ? [`⚠️ VenTu — health do forecast por plataforma:\n${platList}`] : []),
    `(skill real, forecast-skill.json · verificado em ${report.checkedAt})`,
  ].join('\n');

  const chatId = opts.chatId ?? process.env.OPS_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    log(
      `  ⚠️ ${newly.length > 0 ? `Boia(s) com regressão nova: ${newly.map((r) => `${r.name}${r.origin === 'wmo-es' ? ' (WMO-ES)' : r.origin === 'ih' ? ' (IH)' : ''}`).join(', ')}; ` : ''}${
        newPlat.length > 0
          ? `Plataforma(s): ${newPlat.map((a) => `${a.name} (${a.verdict})`).join(', ')}; `
          : ''
      }OPS_TELEGRAM_CHAT_ID não definido (dry-run).`,
    );
    return {
      notified: false,
      newlyRegressed: newly.map((r) => r.name),
      newPlatformAlerts: newPlat.map((a) => ({ platform: a.platform, verdict: a.verdict })),
      reason: 'no-chat-id',
    };
  }

  const send = opts.send ?? require('./telegram').sendTelegramMessage;
  await send(chatId, text);
  return {
    notified: true,
    newlyRegressed: newly.map((r) => r.name),
    newPlatformAlerts: newPlat.map((a) => ({ platform: a.platform, verdict: a.verdict })),
  };
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
  buildPlatformHealth,
  originOfSnapshot,
  meanStat,
  daysAgo,
  N_COLLAPSE_FACTOR,
  MIN_BASELINE_PLATFORM_N,
  MIN_RECENT_PLATFORM_DAYS,
  MIN_BASELINE_PLATFORM_DAYS,
  PLATFORM_LABELS,
};
