'use strict';

/**
 * Shared sport score for Node scripts (alerts, etc.).
 * Uses the same TypeScript path as the web app (incl. observed wind).
 */

let cached = null;

function loadScoring() {
  if (cached) return cached;
  const { register } = require('tsx/cjs/api');
  register();
  const { spots } = require('../../src/lib/spots.ts');
  const { getSportScore } = require('../../src/lib/sportScore.ts');
  const { rawToScoreInput, resolveScoreWaveSource } = require('../../src/lib/scoreConditions.ts');
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
  cached = { byId, getSportScore, rawToScoreInput, resolveScoreWaveSource };
  return cached;
}

/**
 * Compute the spot score the way the web app does (rawToScoreInput applies the
 * fresh buoy reading / regional bias when present) and report which wave input
 * the score used — so the morning digest can say «corrigido pela boia».
 *
 * @param {string} spotId
 * @param {string} sport
 * @param {Record<string, unknown>} conditionsJson
 * @returns {{ score: number, source: 'observed' | 'bias-corrected' | 'forecast' } | null}
 */
function computeScore(spotId, sport, conditionsJson) {
  const { byId, getSportScore, rawToScoreInput, resolveScoreWaveSource } = loadScoring();
  const spot = byId[spotId];
  const raw = conditionsJson[spotId] ?? (spot?.conditionsSource ? conditionsJson[spot.conditionsSource] : null);
  if (!spot || !raw || typeof raw !== 'object') return null;

  const allowed = new Set(['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'foil', 'wakeboard']);
  const sportKey = allowed.has(sport) ? sport : 'surf';
  const scoreInput = rawToScoreInput(raw);
  const score = getSportScore(spot, sportKey, scoreInput).score;
  const source = resolveScoreWaveSource(raw);
  return { score, source };
}

module.exports = { computeScore };
