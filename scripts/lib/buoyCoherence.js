/**
 * Cross-border buoy coherence — validate that the Spanish (Puertos del
 * Estado) and Portuguese (Datawell WMO) wave buoys agree on overlapping
 * hours, so the observedWave layer stays trustworthy when it attaches a
 * Spanish reading to NW Portugal spots (or vice-versa).
 *
 * Pure functions: input is reading series of { date, hs }, output is a report
 * with aligned pairs + stats + a verdict. Network happens in
 * scripts/check-buoy-coherence.js.
 *
 * Verdict gates (first-pass defaults, overridable per call):
 * - coherent:   n ≥ minPairs and mean|Δhs| ≤ okM — the buoys track each other;
 * - review:     n ≥ minPairs but mean|Δhs| between okM and badM;
 * - incoherent: n ≥ minPairs and mean|Δhs| ≥ badM — one buoy is reading a
 *               different wave field; the observedWave cross-border attach
 *               should not be trusted;
 * - insufficient: n < minPairs — no meaningful comparison today.
 */

const { haversineKm } = require('./copernicusBuoys.js');

/** Minimum overlapping hours for a verdict (single points prove nothing). */
const MIN_PAIRS = 3;
/**
 * Minimum accumulated hours before a veredicto over the WINDOW is taken
 * seriously. The report's verdict is computed over the accumulated archive
 * (often many days), so requiring only MIN_PAIRS=3 there would declare
 * coherent/incoherent às 3 leituras esparsas — ruído a passar por sinal.
 * Raising the window floor to 10 keeps the verdict honest (n suficiente
 * existe quase sempre depois de alguns runs). Per-day verdicts (daily archive)
 * keep their own lower MIN_DAILY_PAIRS, because a single day rarely has much.
 */
const MIN_ACCUMULATED_PAIRS = 10;
/** Mean |Δhs| (m) below this → coherent (deep-water swell, ~100 km apart). */
const MEAN_DELTA_OK_M = 0.8;
/** Mean |Δhs| (m) at or above this → incoherent. */
const MEAN_DELTA_BAD_M = 1.5;

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Latest reading per UTC hour bucket ('YYYY-MM-DDTHH'). PT Datawell buoys
 * report at odd times (e.g. 08:02, 08:31) while the ES series is hourly —
 * bucketing both to the UTC hour is what makes them comparable.
 * @param {Array<{ date: string, hs: number }>} rows
 * @returns {Map<string, { date: string, hs: number }>}
 */
function bucketByUtcHour(rows) {
  const byHour = new Map();
  for (const r of rows) {
    if (!r || typeof r.date !== 'string') continue;
    const hour = r.date.slice(0, 13);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hour)) continue;
    const prev = byHour.get(hour);
    if (!prev || new Date(r.date) > new Date(prev.date)) byHour.set(hour, r);
  }
  return byHour;
}

/**
 * Align two buoys on common UTC hours → one pair per shared hour.
 * @param {Array<{ date: string, hs: number }>} aRows
 * @param {Array<{ date: string, hs: number }>} bRows
 * @returns {Array<{ hour: string, a: number, b: number }>}
 */
function alignOnHours(aRows, bRows) {
  const a = bucketByUtcHour(aRows);
  const b = bucketByUtcHour(bRows);
  const hours = [...a.keys()].filter((h) => b.has(h)).sort();
  return hours.map((h) => ({ hour: h, a: a.get(h).hs, b: b.get(h).hs }));
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx;
    const y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? null : num / denom;
}

/**
 * n / mean Δ / mean |Δ| / max |Δ| / Pearson over aligned pairs.
 * ME = mean(b − a) — positive means the b buoy reads HIGHER than a.
 * @param {Array<{ a: number, b: number }>} pairs
 * @returns {{ n: number, meanDeltaM: number, meanAbsDeltaM: number, maxAbsDeltaM: number, corr: number | null } | null}
 */
function pairStats(pairs) {
  if (!pairs || pairs.length === 0) return null;
  const n = pairs.length;
  const deltas = pairs.map((p) => p.b - p.a);
  const meanDelta = deltas.reduce((s, d) => s + d, 0) / n;
  const meanAbs = deltas.reduce((s, d) => s + Math.abs(d), 0) / n;
  const maxAbs = Math.max(...deltas.map((d) => Math.abs(d)));
  const corr = pearson(
    pairs.map((p) => p.a),
    pairs.map((p) => p.b),
  );
  return {
    n,
    meanDeltaM: round1(meanDelta),
    meanAbsDeltaM: round1(meanAbs),
    maxAbsDeltaM: round1(maxAbs),
    corr: corr == null ? null : round2(corr),
  };
}

/**
 * Verdict for a pair's stats.
 * @param {ReturnType<typeof pairStats> | null} stats
 * @param {{ minPairs?: number, okM?: number, badM?: number }} [opts]
 * @returns {'coherent' | 'review' | 'incoherent' | 'insufficient'}
 */
function verdictFor(stats, opts = {}) {
  const { minPairs = MIN_PAIRS, okM = MEAN_DELTA_OK_M, badM = MEAN_DELTA_BAD_M } = opts;
  if (!stats || stats.n < minPairs) return 'insufficient';
  if (stats.meanAbsDeltaM <= okM) return 'coherent';
  if (stats.meanAbsDeltaM >= badM) return 'incoherent';
  return 'review';
}

/**
 * Per-region audit of the observedWave attachment: which source the merge
 * attached (IH vs WMO) and whether it is the CLOSEST buoy. Reads the
 * post-merge conditions (observedWave winner + observedWaveMeta with both
 * distances), so an operator can audit whether the attached source is the
 * closest to each region — anomalies land in `notClosest`.
 * @param {Record<string, {
 *   observedWave?: { source?: string, distanceKm?: number },
 *   observedWaveMeta?: { reason?: string, ihDistanceKm?: number, wmoDistanceKm?: number },
 * }>} conditions conditions.json keyed by spot id
 * @param {Array<{ id: string, region?: string }>} spots spots with region
 * @param {Map<string, {
 *   esCode: string,
 *   esName?: string | null,
 *   ptRefCode: string,
 *   ptRefName?: string | null,
 *   ptRefArea?: string | null,
 *   pair?: string | null,
 *   me: number,
 *   n: number,
 *   ptRefKm?: number | null,
 *   nearestPtCode?: string | null,
 *   nearestPtName?: string | null,
 *   nearestPtKm?: number | null,
 * }>} [calibrationRefs] spot id → PT reference used for the cross-border
 *   ES→PT calibration (collected by merge-observations when it recalibrates
 *   a Spanish reading). Lets the regions report audit that the calibration
 *   chose the right PT reference buoy per region. ptRefKm/nearestPt* are the
 *   suboptimal-pair audit: the calibration can only use a WMO-PT ref (the
 *   ES×PT coherence pairs live there), but an IH station may be closer to the
 *   spot — refs where ptRefCode !== nearestPtCode are flagged per spot.
 * @returns {Record<string, {
 *   spotCount: number,
 *   withObservedWave: number,
 *   bySource: Record<string, number>,
 *   audited: number,
 *   attachedIsClosest: number,
 *   attachedNotClosest: number,
 *   onlySource: number,
 *   notClosest: Array<{ spot: string, winner: string, reason: string | null, attachedKm: number, altKm: number }>,
 *   calibrated: number,
 *   calibrationRefs: Record<string, {
 *     esCode: string,
 *     esName?: string | null,
 *     ptRefCode: string,
 *     ptRefName?: string | null,
 *     ptRefArea?: string | null,
 *     pair?: string | null,
 *     me: number,
 *     n: number,
 *     spots: string[],
 *   }>,
 *   suboptimalRefs: number,
 *   suboptimal: Array<{
 *     spot: string,
 *     esCode: string,
 *     ptRefCode: string,
 *     ptRefKm: number | null,
 *     nearestPtCode: string | null,
 *     nearestPtName: string | null,
 *     nearestPtKm: number | null,
 *   }>,
 * }>}
 */
function buildRegionSourceAudit(conditions, spots, calibrationRefs = null) {
  const regionBySpot = new Map();
  for (const s of spots) {
    if (s?.region) regionBySpot.set(s.id, s.region);
  }

  const regions = {};
  const ensure = (region) => {
    if (!regions[region]) {
      regions[region] = {
        spotCount: 0,
        withObservedWave: 0,
        bySource: {},
        audited: 0,
        attachedIsClosest: 0,
        attachedNotClosest: 0,
        onlySource: 0,
        notClosest: [],
        calibrated: 0,
        calibrationRefs: {},
        suboptimalRefs: 0,
        suboptimal: [],
      };
    }
    return regions[region];
  };

  for (const [spotId, row] of Object.entries(conditions ?? {})) {
    const region = regionBySpot.get(spotId);
    if (!region) continue;
    const r = ensure(region);
    r.spotCount += 1;
    const w = row?.observedWave;
    if (!w?.source) continue;
    r.withObservedWave += 1;
    r.bySource[w.source] = (r.bySource[w.source] ?? 0) + 1;

    // Referência PT usada na calibração deste spot (só existe quando o merge
    // recalibrou uma leitura ES): agrega por par ES→PT dentro da região, com
    // os spots servidos e o ME/n do par que recalibrou a altura.
    const ref = calibrationRefs?.get(spotId);
    if (ref?.ptRefCode) {
      r.calibrated += 1;
      const key = `${ref.esCode}→${ref.ptRefCode}`;
      const entry = (r.calibrationRefs[key] ??= {
        esCode: ref.esCode,
        esName: ref.esName ?? null,
        ptRefCode: ref.ptRefCode,
        ptRefName: ref.ptRefName ?? null,
        ptRefArea: ref.ptRefArea ?? null,
        pair: ref.pair ?? null,
        me: ref.me,
        n: ref.n,
        spots: [],
      });
      entry.spots.push(spotId);
      // Par subóptimo: a ref escolhida não é a boia PT MAIS PRÓXIMA do spot
      // (a calibração só usa WMO-PT; uma estação IH pode estar mais perto).
      // Auditoria informativa — o par pode ser o único com dados de coerência.
      if (ref.ptRefCode !== ref.nearestPtCode && ref.nearestPtCode != null) {
        r.suboptimalRefs += 1;
        r.suboptimal.push({
          spot: spotId,
          esCode: ref.esCode,
          ptRefCode: ref.ptRefCode,
          ptRefKm: Number.isFinite(ref.ptRefKm) ? ref.ptRefKm : null,
          nearestPtCode: ref.nearestPtCode,
          nearestPtName: ref.nearestPtName ?? null,
          nearestPtKm: Number.isFinite(ref.nearestPtKm) ? ref.nearestPtKm : null,
        });
      }
    }

    const attachedKm = Number(w.distanceKm);
    const meta = row?.observedWaveMeta;
    const altKm =
      w.source === 'ih-buoy' ? Number(meta?.wmoDistanceKm) : Number(meta?.ihDistanceKm);
    if (!Number.isFinite(attachedKm) || !Number.isFinite(altKm)) {
      r.onlySource += 1;
      continue;
    }
    r.audited += 1;
    if (attachedKm <= altKm) {
      r.attachedIsClosest += 1;
    } else {
      r.attachedNotClosest += 1;
      r.notClosest.push({
        spot: spotId,
        winner: w.source,
        reason: meta?.reason ?? null,
        attachedKm: Math.round(attachedKm),
        altKm: Math.round(altKm),
      });
    }
  }
  return regions;
}

/**
 * ES buoy codes whose cross-border pair (vs a PT buoy) is incoherent in the
 * coherence report. Their per-buoy bias may still be computed, but it must
 * NOT be attributed to PT regions — the buoy is likely reading a different
 * wave field (see fetch-wave-bias.js gate).
 * @param {object | null} report buoy-coherence.json shape ({ pairs: Array<{ codes: string[], verdict: string }> })
 * @param {Array<string>} esCodes route codes to filter to (e.g. the ES WMO codes)
 * @returns {Array<string>} deduped, sorted
 */
function incoherentEsCodes(report, esCodes) {
  if (!report?.pairs) return [];
  const wanted = new Set(esCodes);
  const gated = new Set();
  for (const p of report.pairs) {
    if (p?.verdict !== 'incoherent') continue;
    for (const code of p.codes ?? []) {
      if (wanted.has(code)) gated.add(code);
    }
  }
  return [...gated].sort();
}

/**
 * Pure per-spot gate predicate: is a specific ES route code gated today by the
 * cross-border coherence report (any incoherent ES×PT pair involving it)? This
 * is the helper the merge uses to null the WMO reading for a spot — unit-testable
 * without running the whole pipeline. Built on incoherentEsCodes so the set and
 * the predicate always agree on thresholds/route filtering.
 * @param {object | null} report buoy-coherence.json shape ({ pairs: Array<{ codes: string[], verdict: string }> })
 * @param {Array<string>} esCodes route codes to filter to
 * @param {string | number | null | undefined} code the spot's mapped WMO code
 * @returns {boolean}
 */
function isEsCodeGated(report, esCodes, code) {
  if (code == null) return false;
  return incoherentEsCodes(report, esCodes).includes(String(code));
}

/**
 * Min n for a cross-border ES→PT calibration to be applied. Below this the
 * pair ME is noise (a single point proves nothing about a systematic bias).
 */
const MIN_CALIBRATION_N = 3;

/**
 * Cross-border calibration for an ES (Puertos del Estado) reading attached to
 * a PT spot: the systematic ME of the ES×PT pair from buoy-coherence.json.
 *
 * Sign convention (pairStats): ME = mean(PT − ES). Positive means the PT buoy
 * reads HIGHER than the ES one on the same hours. Adding ME to the ES reading
 * therefore estimates what the local PT buoy would read — the calibration.
 *
 * Only pairs with a meaningful sample (n ≥ minN) and a non-incoherent verdict
 * are usable: 'incoherent' is gated upstream anyway (incoherentEsCodes) and
 * 'insufficient' has n below the floor.
 *
 * @param {object | null} report buoy-coherence.json ({ pairs: Array<{ codes: string[], n: number, meanDeltaM: number, verdict: string, pair?: string }> })
 * @param {string} esCode ES WMO platform code (e.g. '6200084' Silleiro)
 * @param {string} ptCode PT WMO platform code (e.g. '6201079' Faro)
 * @param {{ minN?: number }} [opts]
 * @returns {{ me: number, n: number, verdict: string, pair: string } | null}
 */
function crossBorderCalibration(report, esCode, ptCode, opts = {}) {
  const { minN = MIN_CALIBRATION_N } = opts;
  if (!report?.pairs || !esCode || !ptCode) return null;
  const es = String(esCode);
  const pt = String(ptCode);
  for (const p of report.pairs) {
    if (!Array.isArray(p?.codes) || p.codes.length !== 2) continue;
    if (!p.codes.includes(es) || !p.codes.includes(pt)) continue;
    if (!Number.isFinite(p.n) || p.n < minN) return null;
    if (p.verdict === 'incoherent') return null;
    if (!Number.isFinite(p.meanDeltaM)) return null;
    return {
      me: p.meanDeltaM,
      n: p.n,
      verdict: p.verdict,
      pair: typeof p.pair === 'string' && p.pair ? p.pair : `${es}×${pt}`,
    };
  }
  return null;
}

/**
 * Apply the ES→PT calibration to an attached cross-border reading (returns a
 * new payload; the input is never mutated). The calibrated height estimates
 * the local PT value: raw + ME, clamped to ≥0.1 m. Tags the payload with the
 * calibration (raw + delta) so the UI can show the correction transparently
 * instead of hiding that a Spanish buoy reading was shifted.
 * @param {object | null} wave observedWave payload (wmo-buoy)
 * @param {{ me: number, n: number, verdict: string, pair: string } | null} calibration crossBorderCalibration result
 * @returns {object} new payload with waveHeight calibrated (+ calibration tag), or the input unchanged
 */
function applyCrossBorderCalibration(wave, calibration) {
  if (!wave || !calibration || !Number.isFinite(calibration.me)) return wave;
  const raw = Number(wave.waveHeight);
  if (!Number.isFinite(raw)) return wave;
  const calibrated = Math.max(0.1, Math.round((raw + calibration.me) * 10) / 10);
  const deltaM = Math.round((calibrated - raw) * 10) / 10;
  if (Math.abs(deltaM) < 0.05) return wave;
  return {
    ...wave,
    waveHeight: calibrated,
    calibration: {
      me: calibration.me,
      n: calibration.n,
      verdict: calibration.verdict,
      from: calibration.pair,
      rawHeight: Math.round(raw * 10) / 10,
      deltaM,
    },
  };
}

/** Gate-refusal history is kept for a season+ — long enough to audit how a buoy
 * has been bouncing on/off the cross-border gate over months. */
const GATE_HISTORY_WINDOW_DAYS = 180;

/**
 * Empty gate-history block (buoy-coherence.json.gateHistory). Lists, per ES
 * buoy, every day the merge refused to attach its reading, so ops can audit
 * HOW OFTEN and WHY the gate fired — not just today's binary state.
 */
function emptyGateHistory() {
  return { windowDays: GATE_HISTORY_WINDOW_DAYS, lastUpdated: null, byCode: {} };
}

/**
 * Merge one run's refusals into the accumulated gate history. Each refused ES
 * code records { code, name, spots, reason, verdict } for that day; same-day
 * re-runs overwrite the previous entry (dedup por dia). Events age out of
 * the window. Pure — the input object is never mutated.
 *
 * @param {object | null} history existing gateHistory ({ byCode: Record<string, object> })
 * @param {Array<{ code: string, name?: string, spots: number, reason?: string, verdict?: string }>} refusals this run
 * @param {string} day 'YYYY-MM-DD'
 * @param {{ windowDays?: number, nowMs?: number }} [opts]
 * @returns {object} new gateHistory
 */
function mergeGateRun(history, refusals, day, opts = {}) {
  const windowDays = opts.windowDays ?? GATE_HISTORY_WINDOW_DAYS;
  const nowMs = opts.nowMs ?? Date.now();
  const cutoffDay = new Date(nowMs - windowDays * 86_400_000).toISOString().slice(0, 10);
  const byCode = { ...(history?.byCode ?? {}) };

  for (const r of refusals) {
    if (!r?.code) continue;
    const code = String(r.code);
    const rec = {
      ...(byCode[code] ?? {
        code,
        name: r.name ?? code,
        totalSpots: 0,
        dayCount: 0,
        firstDay: null,
        lastDay: null,
        events: [],
      }),
    };
    const name = r.name ?? rec.name ?? code;
    const reason = r.reason ?? '';
    const verdict = r.verdict ?? 'incoherent';

    // Prune existing events outside the window for this code.
    rec.events = rec.events.filter((e) => e && e.day >= cutoffDay);

    const existing = rec.events.find((e) => e && e.day === day);
    if (existing) {
      existing.spots = r.spots;
      existing.reason = reason || existing.reason;
      existing.verdict = verdict || existing.verdict;
    } else {
      rec.events.push({ day, spots: r.spots, reason, verdict });
    }

    // totalSpots é derivado dos eventos sobreviventes (após o prune), nunca
    // acumulado incrementalmente — senão um dia que saia da janela deixaria
    // um total inflacionado.
    rec.totalSpots = rec.events.reduce((s, e) => s + (e.spots ?? 0), 0);
    rec.dayCount = rec.events.length;
    rec.firstDay = rec.events.length > 0 ? rec.events[0].day : null;
    rec.lastDay =
      rec.events.length > 0 ? rec.events[rec.events.length - 1].day : null;
    if (name) rec.name = name;
    byCode[code] = rec;
  }

  return {
    windowDays,
    lastUpdated: new Date(nowMs).toISOString(),
    byCode,
  };
}

/**
 * Overall verdict across pairs: any incoherent wins, then review, then all
 * coherent, else insufficient (mix of coherent/insufficient → insufficient).
 * @param {Array<string>} verdicts
 * @returns {'coherent' | 'review' | 'incoherent' | 'insufficient'}
 */
function overallVerdict(verdicts) {
  if (verdicts.includes('incoherent')) return 'incoherent';
  if (verdicts.includes('review')) return 'review';
  if (verdicts.every((v) => v === 'coherent')) return 'coherent';
  return 'insufficient';
}

/**
 * Build the full coherence report for a set of ES×PT pairs.
 * @param {Array<{ a: { code: string, name: string, lat: number, lon: number, rows: Array }, b: { code: string, name: string, lat: number, lon: number, rows: Array } }>} config
 * @param {{ minPairs?: number, okM?: number, badM?: number }} [opts]
 * @returns {{ pairs: Array<object>, overall: string }}
 */
function buildCoherenceReport(config, opts = {}) {
  const pairs = config.map(({ a, b }) => {
    const aligned = alignOnHours(a.rows, b.rows);
    const stats = pairStats(aligned);
    const distanceKm = Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * 10) / 10;
    return {
      pair: `${a.name} × ${b.name}`,
      codes: [a.code, b.code],
      distanceKm,
      n: stats?.n ?? 0,
      ...(stats ?? { meanDeltaM: null, meanAbsDeltaM: null, maxAbsDeltaM: null, corr: null }),
      verdict: verdictFor(stats, opts),
      hours: aligned.map((p) => ({ hour: p.hour, [a.code]: p.a, [b.code]: p.b })),
    };
  });

  return { pairs, overall: overallVerdict(pairs.map((p) => p.verdict)) };
}

/**
 * Human-readable reason a run refused an ES buoy: the labels of every pair
 * involving that code with an 'incoherent' verdict (e.g. «Cabo Silleiro ×
 * Porto»). Empty string when the code has no incoherent pair (it should not
 * be refused then, but the audit tolerates it).
 * @param {object | null} report buoy-coherence.json ({ pairs: Array<{ codes: string[], verdict: string, pair?: string }> })
 * @param {string} esCode ES WMO platform code
 * @returns {string}
 */
function gateRefusalReason(report, esCode) {
  const want = String(esCode);
  const labels = (report?.pairs ?? [])
    .filter(
      (p) =>
        p?.verdict === 'incoherent' &&
        Array.isArray(p?.codes) &&
        p.codes.map(String).includes(want),
    )
    .map((p) => p.pair || p.codes.join(' × '));
  return labels.join('; ');
}

module.exports = {
  MIN_PAIRS,
  MIN_ACCUMULATED_PAIRS,
  MEAN_DELTA_OK_M,
  MEAN_DELTA_BAD_M,
  bucketByUtcHour,
  alignOnHours,
  pairStats,
  verdictFor,
  buildCoherenceReport,
  overallVerdict,
  incoherentEsCodes,
  isEsCodeGated,
  buildRegionSourceAudit,
  MIN_CALIBRATION_N,
  crossBorderCalibration,
  applyCrossBorderCalibration,
  GATE_HISTORY_WINDOW_DAYS,
  emptyGateHistory,
  mergeGateRun,
  gateRefusalReason,
};
