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
  const { rawToScoreInput } = require('../../src/lib/scoreConditions.ts');
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
  cached = { byId, getSportScore, rawToScoreInput };
  return cached;
}

/**
 * @param {string} spotId
 * @param {string} sport
 * @param {Record<string, unknown>} conditionsJson
 * @returns {number | null}
 */
function computeScore(spotId, sport, conditionsJson) {
  const { byId, getSportScore, rawToScoreInput } = loadScoring();
  const spot = byId[spotId];
  const raw = conditionsJson[spotId] ?? (spot?.conditionsSource ? conditionsJson[spot.conditionsSource] : null);
  if (!spot || !raw || typeof raw !== 'object') return null;

  const allowed = new Set(['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'foil', 'wakeboard']);
  const sportKey = allowed.has(sport) ? sport : 'surf';
  const scoreInput = rawToScoreInput(raw);
  return getSportScore(spot, sportKey, scoreInput).score;
}

module.exports = { computeScore };
