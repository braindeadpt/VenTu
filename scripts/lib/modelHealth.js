/**
 * Open-Meteo ensemble model health — detect "dead" models (return only null).
 *
 * Motivating case: `ecmwf_wam025` was configured in the wave ensemble but the
 * Open-Meteo marine API started returning only nulls for it, silently reducing
 * the ensemble to 3 models (confidence flagged `degraded` but nothing named
 * the culprit). This module counts non-null values per configured model across
 * every multimodel response of a run and classifies each model:
 *
 *   - ok    → at least one non-null value was returned
 *   - dead  → zero non-null values despite the API returning the key
 *             (or the key being absent entirely — same symptom)
 *
 * The report is written to public/data/model-health.json and a Telegram
 * notification (OPS_TELEGRAM_CHAT_ID, opt-in) fires only when a model
 * TRANSITIONS to dead — so a permanently dead model is warned once, not
 * every run.
 */

const fs = require('fs');
const path = require('path');
const { WAVE_MODELS, WIND_MODELS } = require('./forecastConfidence');

/** Model families → the hourly key prefix + configured models. */
const HEALTH_FAMILIES = {
  wave: { baseKey: 'wave_height', models: WAVE_MODELS },
  wind: { baseKey: 'wind_speed_10m', models: WIND_MODELS },
};

const DEFAULT_REPORT_PATH = path.join(__dirname, '../../public/data/model-health.json');

/**
 * Count non-null values per model in ONE multimodel response.
 * @param {object} hourly the response's `hourly` object
 * @param {string} baseKey e.g. 'wave_height'
 * @param {string[]} models configured models
 * @returns {Record<string, { ok: number, total: number, absentCount: number }>}
 */
function countModelSlots(hourly, baseKey, models) {
  const out = {};
  for (const model of models) {
    const key = `${baseKey}_${model}`;
    const arr = hourly?.[key];
    if (!Array.isArray(arr) || arr.length === 0) {
      // Key absent from the response — same as all-null for our purposes.
      out[model] = { ok: 0, total: 0, absentCount: 1 };
      continue;
    }
    let ok = 0;
    for (const v of arr) {
      if (v != null && Number.isFinite(v)) ok += 1;
    }
    out[model] = { ok, total: arr.length, absentCount: 0 };
  }
  return out;
}

/**
 * Merge per-response counts into a run-level accumulator.
 * @param {Record<string, { ok: number, total: number, absentCount: number }>} acc
 * @param {Record<string, { ok: number, total: number, absentCount: number }>} counts
 */
function mergeCounts(acc, counts) {
  for (const [model, c] of Object.entries(counts)) {
    const cur = acc[model] ?? { ok: 0, total: 0, absentCount: 0 };
    cur.ok += c.ok;
    cur.total += c.total;
    cur.absentCount += c.absentCount;
    acc[model] = cur;
  }
  return acc;
}

/**
 * Classify each model from run-level counts.
 * dead = 0 non-null values while the key existed (total>0) or was absent.
 * @param {Record<string, { ok: number, total: number, absentCount: number }>} counts
 * @returns {Record<string, { ok: number, total: number, absentCount: number, status: 'ok' | 'dead' }>}
 */
function classifyModelCounts(counts) {
  const out = {};
  for (const [model, c] of Object.entries(counts)) {
    const status = c.ok > 0 ? 'ok' : c.total > 0 || c.absentCount > 0 ? 'dead' : 'ok';
    out[model] = { ...c, status };
  }
  return out;
}

/**
 * Build the model-health report for a run.
 * @param {{ waveCounts: object, windCounts: object, sampledSpots: number }} run
 * @param {number} [nowMs]
 * @returns {object} report payload
 */
function buildHealthReport(run, nowMs = Date.now()) {
  const wave = classifyModelCounts(run.waveCounts);
  const wind = classifyModelCounts(run.windCounts);
  const dead = [
    ...Object.entries(wave)
      .filter(([, c]) => c.status === 'dead')
      .map(([model]) => ({ family: 'wave', model })),
    ...Object.entries(wind)
      .filter(([, c]) => c.status === 'dead')
      .map(([model]) => ({ family: 'wind', model })),
  ];
  return {
    source: 'open-meteo-model-health',
    checkedAt: new Date(nowMs).toISOString(),
    sampledSpots: run.sampledSpots,
    wave,
    wind,
    dead,
  };
}

/**
 * Read the previous report (for transition detection).
 * @param {string} [reportPath]
 * @returns {object | null}
 */
function readModelHealth(reportPath = DEFAULT_REPORT_PATH) {
  if (!fs.existsSync(reportPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Atomically write the report.
 * @param {object} report
 * @param {string} [reportPath]
 */
function writeModelHealth(report, reportPath = DEFAULT_REPORT_PATH) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tmpPath = `${reportPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.renameSync(tmpPath, reportPath);
}

function deadModelKey(d) {
  return `${d.family}:${d.model}`;
}

/**
 * Notify when models TRANSITION to dead (warn once per model, not every run).
 * Telegram opt-in via OPS_TELEGRAM_CHAT_ID; without it → dry-run log.
 * @param {object} report current report
 * @param {{ send?: (chatId: string, text: string) => Promise<boolean>, chatId?: string, reportPath?: string, log?: (msg: string) => void }} [opts]
 * @returns {Promise<{ notified: boolean, newlyDead: Array<{ family: string, model: string }>, reason?: string }>}
 */
async function notifyDeadModels(report, opts = {}) {
  const log = opts.log ?? ((m) => console.log(m));
  const dead = Array.isArray(report.dead) ? report.dead : [];
  if (dead.length === 0) {
    return { notified: false, newlyDead: [], reason: 'no-dead-models' };
  }
  const prev = readModelHealth(opts.reportPath) ?? {};
  const prevDead = new Set((Array.isArray(prev.dead) ? prev.dead : []).map(deadModelKey));
  const newlyDead = dead.filter((d) => !prevDead.has(deadModelKey(d)));

  if (newlyDead.length === 0) {
    return { notified: false, newlyDead, reason: 'already-reported' };
  }

  const list = newlyDead.map((d) => `${d.family}/${d.model}`).join(', ');
  const text =
    `🚨 VenTu — modelo(s) do ensemble Open-Meteo a devolver só null:\n` +
    `${list}\n` +
    `(verificado em ${report.checkedAt} · ${report.sampledSpots ?? '?'} spots amostrados)\n` +
    `Corrige removendo o modelo do ensemble ou contacta a Open-Meteo.`;

  const chatId = opts.chatId ?? process.env.OPS_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    log(`  ⚠️ Modelo(s) morto(s) novo(s): ${list} — OPS_TELEGRAM_CHAT_ID não definido (dry-run).`);
    return { notified: false, newlyDead, reason: 'no-chat-id' };
  }

  const send = opts.send ?? require('./telegram').sendTelegramMessage;
  await send(chatId, text);
  return { notified: true, newlyDead };
}

module.exports = {
  HEALTH_FAMILIES,
  DEFAULT_REPORT_PATH,
  countModelSlots,
  mergeCounts,
  classifyModelCounts,
  buildHealthReport,
  readModelHealth,
  writeModelHealth,
  notifyDeadModels,
  deadModelKey,
};
