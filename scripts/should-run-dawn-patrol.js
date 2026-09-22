#!/usr/bin/env node
/**
 * Gate for dawn-patrol.yml — the sequential trigger after update-data.yml.
 *
 * The dawn patrol recalibrates scores from the freshest merged readings, so it
 * must never race the morning update: it runs only AFTER an update-data run of
 * the same day completes successfully. On the update schedule
 * (scripts/lib/updateSchedule.js) the last merge before 06:00 Lisbon is the
 * **04:00** run (05:00 is 'skip'), so the preferred window is that completion:
 *
 *   gate = run  — Lisbon hour == 4 (the pre-dawn update-data run just finished)
 *                 OR manual workflow_dispatch (always runs, regardless of hour)
 *                 OR catch-up: public/data/dawn-patrol.json is from a PREVIOUS
 *                    Lisbon day and the 04:00 window already passed (hour > 4)
 *                    — a late patrol beats a stale one (the 2026-09-01 freeze:
 *                    GitHub schedule starvation kept missing the 04:00 window
 *                    and the file went 3 weeks without regenerating)
 *   gate = skip — any other update-data completion with a same-day patrol
 *                 (00h, 06h, 08h, … diurnos; before 04:00 we still wait for
 *                 the freshest pre-dawn merge)
 *
 * Writes gate=run|skip to GITHUB_OUTPUT when set.
 */
const fs = require('fs');
const path = require('path');
const { getLisbonParts } = require('./lib/updateSchedule');

/** The update-data run whose merge feeds the dawn patrol (Lisbon hour). */
const DAWN_RUN_LISBON_HOUR = 4;

/** Current Lisbon calendar date as YYYY-MM-DD (en-CA ISO ordering). */
function lisbonDateStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(now);
}

/** Date of the last generated patrol, or null when unreadable/missing. */
function readPatrolDate(file = path.join(__dirname, '../public/data/dawn-patrol.json')) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed.date === 'string' ? parsed.date : null;
  } catch {
    return null;
  }
}

/**
 * Pure decision — exported for unit tests.
 * @param {{ hour: number, eventName?: string | null,
 *           dataDate?: string | null, todayDate?: string | null }} opts
 *   dataDate/todayDate: 'YYYY-MM-DD' (Lisbon). When either is unknown the
 *   catch-up branch is disabled and the gate falls back to the 04:00 window.
 * @returns {'run' | 'skip'}
 */
function resolveDawnGate({
  hour,
  eventName = process.env.GITHUB_EVENT_NAME,
  dataDate = null,
  todayDate = null,
}) {
  if (eventName === 'workflow_dispatch') return 'run';
  if (hour === DAWN_RUN_LISBON_HOUR) return 'run';
  // Catch-up: yesterday's (or older) patrol + dawn window already passed.
  // String compare is safe: both are zero-padded ISO dates (en-CA).
  if (dataDate && todayDate && dataDate < todayDate && hour > DAWN_RUN_LISBON_HOUR) {
    return 'run';
  }
  return 'skip';
}

if (require.main === module) {
  const { hour, minute } = getLisbonParts();
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'local';
  const dataDate = readPatrolDate();
  const todayDate = lisbonDateStr();
  const gate = resolveDawnGate({ hour, eventName, dataDate, todayDate });

  console.log(
    `Lisbon ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · event=${eventName} · patrol=${dataDate ?? 'missing'} · today=${todayDate} → gate: ${gate}`
  );
  if (gate === 'run' && eventName !== 'workflow_dispatch') {
    if (hour === DAWN_RUN_LISBON_HOUR) {
      console.log('→ 04:00 Lisbon update-data run complete — sequential dawn-patrol trigger (freshest pre-dawn merge).');
    } else {
      console.log(`→ catch-up: patrol is stale (${dataDate} < ${todayDate}) and the 04:00 window passed — regenerating.`);
    }
  } else if (gate === 'run') {
    console.log('→ manual dispatch — running regardless of the window.');
  } else if (hour < DAWN_RUN_LISBON_HOUR && dataDate && todayDate && dataDate < todayDate) {
    console.log('→ before the 04:00 window — waiting for the freshest pre-dawn merge.');
  } else {
    console.log('→ patrol already generated today (or not the pre-dawn run) — skipping.');
  }

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(out, `gate=${gate}\n`);
  }
  process.exit(0);
}

module.exports = { resolveDawnGate, DAWN_RUN_LISBON_HOUR, lisbonDateStr, readPatrolDate };
