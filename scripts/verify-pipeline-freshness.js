#!/usr/bin/env node
/**
 * Fail CI when a full run completes but pipeline-meta is still stale (safety net).
 */
const { readPipelineMeta } = require('./lib/pipelineMeta');
const { getLisbonParts, STALE_FULL_HOURS_DAY } = require('./lib/updateSchedule');

const meta = readPipelineMeta();
const fullAt = meta?.fullUpdatedAt;

if (!fullAt) {
  console.error('::error::pipeline-meta.json missing fullUpdatedAt after update');
  process.exit(1);
}

const ageHours = (Date.now() - new Date(fullAt).getTime()) / 3600000;
const { hour } = getLisbonParts();
const isDaytime = hour >= 6 && hour <= 20;
const maxAge = isDaytime ? 0.75 : 1.5; // full run should have just finished

if (ageHours > maxAge) {
  console.error(
    `::error::fullUpdatedAt is ${ageHours.toFixed(1)}h old (expected <${maxAge}h after full run)`,
  );
  process.exit(1);
}

console.log(`✅ Pipeline fresh — fullUpdatedAt ${ageHours.toFixed(2)}h ago`);
