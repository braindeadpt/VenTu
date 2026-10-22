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
  resolveScheduledMode,
  needsFullCatchUp,
  resolveKeepaliveMode,
} = require('./lib/updateSchedule');
const { readPipelineMeta } = require('./lib/pipelineMeta');
const { printAuditSummary } = require('./lib/dataPipelineAudit');

if (process.argv.includes('--print-audit')) {
  printAuditSummary();
  process.exit(0);
}

const force = process.env.VENTU_FORCE_MODE?.trim();
const keepalive = process.env.VENTU_KEEPALIVE === '1';
/**
 * Keep-alive e schedule: o checkout (fetch-depth 1) é o commit do evento. Se o ping ficou
 * em fila atrás de um run (concurrency update-ventu-data), esse run já
 * empurrou um pipeline-meta.json mais novo para a main — lê-lo de lá evita
 * correr outra vez o mesmo slot. Falha (sem rede/git) → meta local.
 */
function readFreshestMeta() {
  const local = readPipelineMeta();
  if (!keepalive && process.env.VENTU_SCHEDULED !== '1') return local;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['fetch', '--quiet', '--depth=1', 'origin', 'main'], { stdio: 'ignore', timeout: 60000 });
    const raw = execFileSync('git', ['show', 'FETCH_HEAD:public/data/pipeline-meta.json'], { encoding: 'utf-8' });
    const remote = JSON.parse(raw);
    const newer = (a, b) => (Date.parse(a || '') || 0) >= (Date.parse(b || '') || 0);
    return newer(remote?.lastRunAt, local?.lastRunAt) ? remote : local;
  } catch {
    return local;
  }
}
const meta = readFreshestMeta();
const scheduled = getUpdateMode();
let mode;
if (force === 'full' || force === 'observations') {
  mode = force;
} else if (keepalive) {
  // External keep-alive ping (cron-job.org / serverless -> repository_dispatch):
  // a safety net, NEVER a second scheduler. Runs this hour's slot (full/obs)
  // only when the last run of that kind is > 90 min old (the GitHub cron for
  // the slot never arrived); a slot that already ran leaves the data < 90 min
  // and the ping skips — never a double run. Overdue catch-up as before.
  const k = resolveKeepaliveMode(new Date(), meta);
  mode = k.mode;
  console.log(`Keep-alive: ${k.reason}`);
} else if (process.env.VENTU_SCHEDULED === '1') {
  // Schedule (:17 e :47): o slot corre uma vez por hora — se o outro cron ou o
  // ping já o serviu nesta hora de Lisboa, salta.
  mode = resolveScheduledMode(new Date(), meta);
} else {
  // workflow_dispatch auto: comportamento de sempre (nunca deduplica).
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
    ? 'Keep-alive ping — slot já corrido (dados \u2264 90 min) e sem catch-up, skipping.'
    : 'Skipping — not on schedule this hour (or this hour\'s slot already ran).');
}

process.exit(0);
