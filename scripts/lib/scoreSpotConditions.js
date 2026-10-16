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
  const { posicaoSol } = require('../../src/lib/sol.ts');
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
  cached = {
    byId,
    getSportScore,
    rawToScoreInput,
    resolveScoreWaveSource,
    notaV6DeCondicoes,
    posicaoSol,
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

// ── Alertas: hora corrente da previsão + observações frescas ──────────────
//
// O conditions.json é a fotografia da hora do último run do pipeline (até 2 h
// antes, 4 h de noite). Avaliado às 15h, um alerta via o vento das 13h. Os
// alertas passam a avaliar a HORA CORRENTE de forecasts/<id>.json com as
// observações frescas da linha do conditions.json por cima (boia, vento
// observado — `rawToScoreInput` só as aplica se frescas), e a nota é a do v6
// para essa hora (`computeScore(…, { nowMs, t })`).
// De noite (sol < −0,8°: o disco já abaixo do horizonte com a refracção) não
// há avaliação de condições — os avisos oficiais seguem pelo caminho próprio.

const NIGHT_SUN_ELEVATION_DEG = -0.8;

/** Campos que não passam da hora da previsão para a linha avaliada. */
const FORECAST_SKIP_KEYS = new Set(['time', 'ens']);

/** Chave de hora de Lisboa (AAAA-MM-DDTHH) de um instante. */
function lisbonHourKey(ms) {
  const { lisbonHourKeyFromDate } = require('./openMeteoTime');
  return lisbonHourKeyFromDate(new Date(ms));
}

/**
 * Pure: linha a avaliar — a hora da previsão que coincide com a hora de
 * Lisboa de `nowMs` sobre a linha do conditions.json (as chaves de
 * observação desta ficam). Sem previsão para a hora → a própria linha.
 * @param {Record<string, unknown> | null | undefined} condRow
 * @param {Array<Record<string, unknown>> | null | undefined} hours
 * @param {number} nowMs
 * @returns {{ row: Record<string, unknown> | null; t: string | undefined; fromForecast: boolean }}
 */
function alertRowAt(condRow, hours, nowMs) {
  const key = lisbonHourKey(nowMs);
  const h = Array.isArray(hours)
    ? hours.find((x) => x && typeof x.time === 'string' && x.time.slice(0, 13) === key)
    : null;
  if (!h) return { row: condRow && typeof condRow === 'object' ? condRow : null, t: undefined, fromForecast: false };
  const row = { ...(condRow && typeof condRow === 'object' ? condRow : {}) };
  for (const [k, v] of Object.entries(h)) {
    if (FORECAST_SKIP_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    row[k] = v;
  }
  return { row, t: h.time.slice(0, 16), fromForecast: true };
}

/** Elevação do sol no spot em `nowMs` (graus) — null se o spot não existe. */
function sunElevationAtSpot(spotId, nowMs) {
  const { byId, posicaoSol } = loadScoring();
  const spot = byId[spotId];
  if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) return null;
  return posicaoSol(nowMs, spot.lat, spot.lon).el;
}

function isNightAtSpot(spotId, nowMs) {
  const el = sunElevationAtSpot(spotId, nowMs);
  return el !== null && el < NIGHT_SUN_ELEVATION_DEG;
}

/**
 * Nota de um alerta: hora corrente da previsão + observações frescas.
 * @param {string} spotId
 * @param {string} sport
 * @param {Record<string, unknown>} conditionsJson
 * @param {{ nowMs?: number; forecastFor?: (spotId: string) => Array<object> | null }} [opc]
 * @returns {{ night: true } | (ReturnType<typeof computeScore> & { t?: string; fromForecast: boolean }) | null}
 */
function computeAlertScore(spotId, sport, conditionsJson, opc = {}) {
  const nowMs = opc.nowMs ?? Date.now();
  if (isNightAtSpot(spotId, nowMs)) return { night: true };
  const { byId } = loadScoring();
  const spot = byId[spotId];
  if (!spot) return null;
  const condRow = conditionsJson[spotId] ?? (spot.conditionsSource ? conditionsJson[spot.conditionsSource] : null);
  const hours = opc.forecastFor
    ? opc.forecastFor(spotId) ?? (spot.conditionsSource ? opc.forecastFor(spot.conditionsSource) : null)
    : null;
  const { row, t, fromForecast } = alertRowAt(condRow, hours, nowMs);
  if (!row) return null;
  const scored = computeScore(spotId, sport, { [spotId]: row }, { nowMs, t });
  return scored ? { ...scored, t, fromForecast } : null;
}

/**
 * Leitor (com cache) de public/data/forecasts/<id>.json; cai no forecasts.json
 * agregado quando o ficheiro por spot não existe.
 * @param {string} dataDir
 */
function makeForecastReader(dataDir) {
  const fs = require('fs');
  const path = require('path');
  const cache = new Map();
  let agg;
  return (spotId) => {
    if (cache.has(spotId)) return cache.get(spotId);
    let hours = null;
    try {
      hours = JSON.parse(fs.readFileSync(path.join(dataDir, 'forecasts', `${spotId}.json`), 'utf-8'));
    } catch {
      if (agg === undefined) {
        try {
          agg = JSON.parse(fs.readFileSync(path.join(dataDir, 'forecasts.json'), 'utf-8'));
        } catch {
          agg = null;
        }
      }
      hours = agg && Array.isArray(agg[spotId]) ? agg[spotId] : null;
    }
    if (!Array.isArray(hours)) hours = null;
    cache.set(spotId, hours);
    return hours;
  };
}

module.exports = {
  computeScore,
  computeAlertScore,
  alertRowAt,
  isNightAtSpot,
  sunElevationAtSpot,
  makeForecastReader,
  NIGHT_SUN_ELEVATION_DEG,
  scoreToNota,
};
