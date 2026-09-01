#!/usr/bin/env node
/**
 * Gate for dawn-patrol.yml — the sequential trigger after update-data.yml.
 *
 * The dawn patrol recalibrates scores from the freshest merged readings, so it
 * must never race the morning update: it runs only AFTER the last pre-dawn
 * update-data run of the same day completes successfully. On the update
 * schedule (scripts/lib/updateSchedule.js) the last merge before 06:00 Lisbon
 * is the **04:00** run (05:00 is 'skip'), so this gate fires on the
 * workflow_run completion in the 04:00 Lisbon window:
 *
 *   gate = run  — Lisbon hour == 4 (the pre-dawn update-data run just finished)
 *                 OR manual workflow_dispatch (always runs, regardless of hour)
 *   gate = skip — any other update-data completion (00h, 06h, 08h, … diurnos)
 *
 * Writes gate=run|skip to GITHUB_OUTPUT when set.
 */
const fs = require('fs');
const { getLisbonParts } = require('./lib/updateSchedule');

/** The update-data run whose merge feeds the dawn patrol (Lisbon hour). */
const DAWN_RUN_LISBON_HOUR = 4;

/**
 * Pure decision — exported for unit tests.
 * @param {{ hour: number, eventName?: string | null }} opts
 * @returns {'run' | 'skip'}
 */
function resolveDawnGate({ hour, eventName = process.env.GITHUB_EVENT_NAME }) {
  const isDispatch = eventName === 'workflow_dispatch';
  const isDawnRun = hour === DAWN_RUN_LISBON_HOUR;
  return isDispatch || isDawnRun ? 'run' : 'skip';
}

if (require.main === module) {
  const { hour, minute } = getLisbonParts();
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'local';
  const gate = resolveDawnGate({ hour, eventName });

  console.log(`Lisbon ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · event=${eventName} → gate: ${gate}`);
  if (gate === 'run' && eventName !== 'workflow_dispatch') {
    console.log('→ 04:00 Lisbon update-data run complete — sequential dawn-patrol trigger (freshest pre-dawn merge).');
  } else if (gate === 'run') {
    console.log('→ manual dispatch — running regardless of the window.');
  } else {
    console.log('→ not the pre-dawn run — skipping (the 04:00 Lisbon run is the last merge before 06:00).');
  }

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(out, `gate=${gate}\n`);
  }
  process.exit(0);
}

module.exports = { resolveDawnGate, DAWN_RUN_LISBON_HOUR };
