#!/usr/bin/env node
/**
 * Gate for update-data.yml.
 * Writes mode=full|observations|skip to GITHUB_OUTPUT when set.
 */
const fs = require('fs');
const { getUpdateMode, getLisbonParts, describeSchedule, isMultiModelEnabled } = require('./lib/updateSchedule');
const { printAuditSummary } = require('./lib/dataPipelineAudit');

if (process.argv.includes('--print-audit')) {
  printAuditSummary();
  process.exit(0);
}

const force = process.env.VENTU_FORCE_MODE?.trim();
const mode = force === 'full' || force === 'observations' ? force : getUpdateMode();
const multimodel = mode === 'full' && isMultiModelEnabled();
const { hour, minute } = getLisbonParts();

console.log(`Lisbon ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} → mode: ${mode}`);
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
