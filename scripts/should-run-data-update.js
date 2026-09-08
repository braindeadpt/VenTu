#!/usr/bin/env node
/**
 * Gate for update-data.yml.
 * Writes mode=full|observations|skip to GITHUB_OUTPUT when set.
 */
const fs = require('fs');
const {
  getUpdateMode,
  getLisbonParts,
  describeSchedule,
  isMultiModelEnabled,
  resolveUpdateMode,
  needsFullCatchUp,
  needsObsCatchUp,
} = require('./lib/updateSchedule');
const { readPipelineMeta } = require('./lib/pipelineMeta');
const { printAuditSummary } = require('./lib/dataPipelineAudit');

if (process.argv.includes('--print-audit')) {
  printAuditSummary();
  process.exit(0);
}

const force = process.env.VENTU_FORCE_MODE?.trim();
const keepalive = process.env.VENTU_KEEPALIVE === '1';
const meta = readPipelineMeta();
const scheduled = getUpdateMode();
let mode;
if (force === 'full' || force === 'observations') {
  mode = force;
} else if (keepalive) {
  // External keep-alive ping (cron-job.org / serverless -> repository_dispatch):
  // a safety net, NEVER a second scheduler. The GitHub schedule (or a manual
  // dispatch) owns normal cadence; this branch only resurrects the pipeline
  // when it is actually overdue (missed schedule delivery / failed job). When
  // the data is fresh the ping skips, so it can never double-run a healthy
  // cadence — the ping is what makes cadence independent of GitHub's schedule
  // reliability, at the cost of one cheap no-op runner per ping.
  if (needsFullCatchUp(new Date(), meta?.fullUpdatedAt)) {
    mode = 'full';
  } else if (needsObsCatchUp(new Date(), meta?.observationsUpdatedAt)) {
    mode = 'observations';
  } else {
    mode = 'skip';
  }
} else {
  mode = resolveUpdateMode(new Date(), meta?.fullUpdatedAt);
}
const multimodel = mode === 'full' && isMultiModelEnabled();
const { hour, minute } = getLisbonParts();

console.log(`Lisbon ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} → mode: ${mode}`);
if (mode === 'full' && scheduled !== 'full' && needsFullCatchUp(new Date(), meta?.fullUpdatedAt)) {
  console.log('⚠️ Catch-up full run — last Open-Meteo update is overdue');
}
if (mode === 'full') {
  console.log(multimodel ? '☀️ Multi-modelo: ON (confiança por spread)' : '🌙 Multi-modelo: OFF (best_match apenas)');
}
console.log(describeSchedule('pt'));

const out = process.env.GITHUB_OUTPUT;
if (out) {
  fs.appendFileSync(out, `mode=${mode}\n`);
  fs.appendFileSync(out, `multimodel=${multimodel}\n`);
}

if (mode === 'skip') {
  console.log(keepalive
    ? 'Keep-alive ping — pipeline fresh (full \u2264 2.5h / obs \u2264 3h daytime), skipping.'
    : 'Skipping — not on schedule this hour.');
}

process.exit(0);
