#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const checks = [
  { id: 'ih', label: 'IH Datawell', env: ['IH_API_KEY'], script: 'buoys:test-key' },
  { id: 'meteoalarm', label: 'MeteoAlarm', env: ['METEOGATE_API_KEY', 'METEOALARM_API_KEY'], script: 'alerts:test-key' },
  { id: 'ecowitt', label: 'Ecowitt', env: ['ECOWITT_APPLICATION_KEY', 'ECOWITT_API_KEY', 'ECOWITT_MAC'], script: 'ecowitt:test-key' },
  { id: 'resend', label: 'Resend', env: ['RESEND_API_KEY'], script: 'resend:test-key' },
];

function classifyConfigured(envNames, env = process.env) {
  const present = envNames.filter((name) => Boolean(env[name]));
  if (present.length === 0) return 'missing';
  if (present.length !== envNames.length) return 'degraded';
  return 'healthy';
}

function buildChecklist(env = process.env) {
  return checks.map((check) => ({
    ...check,
    status: classifyConfigured(check.env, env),
    configured: check.env.filter((name) => Boolean(env[name])).length,
    required: check.env.length,
  }));
}

function main() {
  const result = buildChecklist();
  for (const item of result) {
    console.log(`${item.status.toUpperCase()} ${item.label} (${item.configured}/${item.required}) — ${item.script}`);
  }
  const degraded = result.filter((item) => item.status === 'degraded');
  const missing = result.filter((item) => item.status === 'missing');
  console.log(`\nSummary: ${result.filter((item) => item.status === 'healthy').length} healthy, ${missing.length} missing, ${degraded.length} degraded`);
  if (degraded.length > 0) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { checks, classifyConfigured, buildChecklist };
