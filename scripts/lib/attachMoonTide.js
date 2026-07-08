'use strict';

/** Attach moonTideLine (pt/en) to dawn-patrol advice using shared TS libs. */
function attachMoonTideLines(advice, spotsData) {
  const { register } = require('tsx/cjs/api');
  register();
  const { buildDawnPatrolMoonLine } = require('../../src/lib/moonTideCopy.ts');
  const { findFirstLowTide } = require('../../src/lib/tideAmplitude.ts');

  const best =
    spotsData.length > 0
      ? [...spotsData].sort((a, b) => b.bestWindow.score - a.bestWindow.score)[0]
      : null;

  let firstLow = null;
  if (best?.hourly?.time?.length) {
    const points = best.hourly.time.map((t, i) => ({
      time: t,
      tideHeight: best.hourly.sea_level_height_msl?.[i],
    }));
    firstLow = findFirstLowTide(points);
  }

  const now = new Date();
  advice.pt.moonTideLine = buildDawnPatrolMoonLine('pt', now, firstLow);
  advice.en.moonTideLine = buildDawnPatrolMoonLine('en', now, firstLow);
  return advice;
}

module.exports = { attachMoonTideLines };
