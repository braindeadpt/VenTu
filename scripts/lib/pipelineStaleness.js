/**
 * Pipeline-meta staleness evaluation — the heartbeat for the data pipeline
 * (workflow staleness-alert.yml).
 *
 * Why this exists: the pipeline's own TTL validator only runs WHEN the
 * pipeline runs, so a dead pipeline (missed GitHub schedule delivery,
 * failed job) is invisible to every check it owns. This heartbeat runs on
 * its own schedule and alerts when public/data/pipeline-meta.json stops
 * being refreshed, catching a missed slot between scheduled runs.
 *
 * Thresholds are deliberately ABOVE the keep-alive resurrection margins
 * (needsFullCatchUp: 2.5h day / 4.5h night; needsObsCatchUp: 3h day /
 * 5h night): a successful silent resurrection (external ping) is not an
 * incident, so it must not trip the alert — the alert is for gaps that
 * outlived the resurrection margin (resurrection failed, or no keep-alive
 * configured). Normal max gaps: 2h daytime / 4h night between full runs,
 * so 3h/5h only fire when a scheduled slot was definitively missed.
 */

const { getLisbonParts } = require('./updateSchedule');

const STALE_ALERT_HOURS_DAY = 3;
const STALE_ALERT_HOURS_NIGHT = 5;

/** @param {string | null | undefined} ts @param {number} nowMs @returns {number | null} */
function ageHours(ts, nowMs) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (nowMs - t) / 3600000);
}

/**
 * @param {object | null | undefined} meta pipeline-meta.json content
 * @param {number} [nowMs]
 * @param {{ dayHours?: number; nightHours?: number }} [opts]
 * @returns {{
 *   stale: boolean;
 *   isDaytime: boolean;
 *   thresholdHours: number;
 *   fullAgeHours: number | null;
 *   obsAgeHours: number | null;
 *   staleLayer: 'full' | 'observations' | null;
 * }}
 */
function evaluatePipelineStaleness(meta, nowMs = Date.now(), opts = {}) {
  const dayHours = opts.dayHours ?? STALE_ALERT_HOURS_DAY;
  const nightHours = opts.nightHours ?? STALE_ALERT_HOURS_NIGHT;
  const { hour } = getLisbonParts(new Date(nowMs));
  const isDaytime = hour >= 6 && hour <= 20;
  const thresholdHours = isDaytime ? dayHours : nightHours;

  const fullAgeHours = ageHours(meta?.fullUpdatedAt, nowMs);
  const obsAgeHours = ageHours(meta?.observationsUpdatedAt, nowMs);

  // A missing timestamp is the deadest signal of all — treat as stale.
  const fullStale = fullAgeHours === null || fullAgeHours > thresholdHours;
  const obsStale = obsAgeHours === null || obsAgeHours > thresholdHours;
  const stale = fullStale || obsStale;

  return {
    stale,
    isDaytime,
    thresholdHours,
    fullAgeHours,
    obsAgeHours,
    staleLayer: stale ? (fullStale ? 'full' : 'observations') : null,
  };
}

module.exports = {
  STALE_ALERT_HOURS_DAY,
  STALE_ALERT_HOURS_NIGHT,
  ageHours,
  evaluatePipelineStaleness,
};