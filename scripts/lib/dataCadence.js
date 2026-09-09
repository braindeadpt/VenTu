/**
 * Data-cadence evaluation — the commit-based heartbeat for the data
 * pipeline (workflow data-cadence-alert.yml).
 *
 * Complements pipelineStaleness.js (meta-file age) with the signal the
 * user actually sees: has a commit touching public/data/** landed recently?
 * The two checks share the SAME thresholds (STALE_ALERT_HOURS_DAY/NIGHT,
 * 3h day / 5h night) so they can never disagree about what "stale" means —
 * but they fail independently:
 *   - meta-file age (staleness-alert.yml): trusts pipeline-meta.json's
 *     internal timestamps, which a push that landed late (or a meta file
 *     written but never committed) can mask;
 *   - commit landing (this module): measures the last DATA COMMIT's
 *     committer date via the GitHub commits API — a failed push, a push
 *     without fresh meta, or a scheduler that stopped firing all show up
 *     here immediately, with no file content to trust.
 *
 * Thresholds are deliberately ABOVE the keep-alive resurrection margins
 * (2.5h/4.5h): a silent successful resurrection is not an incident. A
 * missing/invalid commit time is the deadest signal of all — stale.
 */

const { getLisbonParts } = require('./updateSchedule');
const { STALE_ALERT_HOURS_DAY, STALE_ALERT_HOURS_NIGHT } = require('./pipelineStaleness');

/**
 * @param {number | null | undefined} lastCommitAtMs last public/data commit time (ms)
 * @param {number} [nowMs]
 * @param {{ dayHours?: number; nightHours?: number }} [opts]
 * @returns {{
 *   stale: boolean;
 *   isDaytime: boolean;
 *   thresholdHours: number;
 *   ageHours: number | null;
 *   unknown: boolean;
 * }}
 */
function evaluateDataCadence(lastCommitAtMs, nowMs = Date.now(), opts = {}) {
  const dayHours = opts.dayHours ?? STALE_ALERT_HOURS_DAY;
  const nightHours = opts.nightHours ?? STALE_ALERT_HOURS_NIGHT;
  const { hour } = getLisbonParts(new Date(nowMs));
  const isDaytime = hour >= 6 && hour <= 20;
  const thresholdHours = isDaytime ? dayHours : nightHours;

  if (!Number.isFinite(lastCommitAtMs)) {
    return { stale: true, ageHours: null, thresholdHours, isDaytime, unknown: true };
  }
  const ageHours = Math.max(0, (nowMs - lastCommitAtMs) / 3600000);
  return {
    stale: ageHours > thresholdHours,
    ageHours,
    thresholdHours,
    isDaytime,
    unknown: false,
  };
}

module.exports = { evaluateDataCadence };