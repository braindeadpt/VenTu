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
} = require('./lib/updateSchedule');
const { readPipelineMeta } = require('./lib/pipelineMeta');
const { printAuditSummary } = require('./lib/dataPipelineAudit');

if (process.argv.includes('--print-audit')) {
  printAuditSummary();
  process.exit(0);
}

const force = process.env.VENTU_FORCE_MODE?.trim();
const meta = readPipelineMeta();
const scheduled = getUpdateMode();
const mode =
  force === 'full' || force === 'observations'
    ? force
    : resolveUpdateMode(new Date(), meta?.fullUpdatedAt);
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
  console.log('Skipping — not on schedule this hour.');
}

process.exit(0);
