'use strict';

/**
 * Shared sport score for Node scripts (alerts, etc.).
 *
 * Desde a auditoria de dados de 16/10 (C1, #218) a nota é a do motor v6 — a
 * mesma da home e da página de spot (`src/lib/notaV6Condicoes.ts`): vento
 * MÉDIO (sem *gust proxy*), tecto de segurança do vento e `null` de noite.
 * Só os desportos sem definição v6 (sup) caem no `sportScore` antigo, também
 * sem *gust proxy*.
 */

let cached = null;

function loadScoring() {
  if (cached) return cached;
  const { register } = require('tsx/cjs/api');
  register();
  const { spots } = require('../../src/lib/spots.ts');
  const { getSportScore } = require('../../src/lib/sportScore.ts');
  const { rawToScoreInput, resolveScoreWaveSource } = require('../../src/lib/scoreConditions.ts');
  const nota = require('../../src/lib/nota.ts');
  const { notaV6DeCondicoes } = require('../../src/lib/notaV6Condicoes.ts');
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
  cached = {
    byId,
    getSportScore,
    rawToScoreInput,
    resolveScoreWaveSource,
    notaV6DeCondicoes,
    notaToScore: nota.notaToScore,
    scoreToNota: nota.scoreToNota,
  };
  return cached;
}

/**
 * Compute the spot score the way the web app does and report which wave input
 * the score used — so the morning digest can say «corrigido pela boia».
 *
 * Motor v6 (home/spot): `score` = nota v6 × 10 (0–100, para comparar com o
 * `min_score` das subscrições; `scoreToNota(score)` devolve a nota inteira).
 * De noite não há nota: devolve `null` e o alerta não dispara.
 *
 * @param {string} spotId
 * @param {string} sport
 * @param {Record<string, unknown>} conditionsJson
 * @param {{ nowMs?: number, t?: string }} [opc] hora a avaliar (omissão: agora)
 * @returns {{ score: number, nota: number, engine: 'v6' | 'legacy', source: 'observed' | 'bias-corrected' | 'forecast' } | null}
 */
function computeScore(spotId, sport, conditionsJson, opc = {}) {
  const { byId, getSportScore, rawToScoreInput, resolveScoreWaveSource, notaV6DeCondicoes, notaToScore, scoreToNota } =
    loadScoring();
  const spot = byId[spotId];
  const raw = conditionsJson[spotId] ?? (spot?.conditionsSource ? conditionsJson[spot.conditionsSource] : null);
  if (!spot || !raw || typeof raw !== 'object') return null;

  const source = resolveScoreWaveSource(raw, opc.nowMs);
  const v6 = notaV6DeCondicoes(spot, sport, raw, opc);
  if (v6) {
    if (v6.n == null) return null; // noite
    return { score: notaToScore(v6.n), nota: v6.n, engine: 'v6', source };
  }
  const allowed = new Set(['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'foil', 'wakeboard']);
  const sportKey = allowed.has(sport) ? sport : 'surf';
  const score = getSportScore(spot, sportKey, rawToScoreInput(raw)).score;
  return { score, nota: scoreToNota(score), engine: 'legacy', source };
}

/** Score 0–100 → nota inteira /10 que o site mostra (`src/lib/nota.ts`, #210). */
function scoreToNota(score) {
  return loadScoring().scoreToNota(score);
}

module.exports = { computeScore, scoreToNota };
