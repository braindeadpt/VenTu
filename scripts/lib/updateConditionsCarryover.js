/**
 * Carry-over de previsão (incidente 2026-11-19, run update-data 44426138146):
 * quando o Open-Meteo falha para um spot que AINDA existe no catálogo, o run
 * anterior pode substituí-lo — desde que fresco (fetch ≤3h) e a previsão
 * ainda cubra horas futuras. Sem isto, um outage de algumas horas apagava o
 * forecasts/<id>.json do spot (bloco «espelha o directório ao índice») e um
 * deploy no intervalo publicava-o sem previsão.
 *
 * O spot reaproveitado fica auditável na entrada de conditions.json via
 * `carriedOver: true` + `carriedFromFetchedAt` (o `updatedAt` original mantém-
 * se — os dados são mesmo daquele instante). No gate de coverage o carry-over
 * conta como FALHA do fetch, nunca como sucesso.
 */

/** Idade máxima do fetch anterior reutilizável (horas). */
const MAX_CARRYOVER_AGE_HOURS = 3;

/**
 * Decide se os artefactos do run anterior podem substituir um fetch falhado.
 *
 * @param {object|null|undefined} previousConditionsEntry — entrada anterior
 *   do spot em conditions.json (`updatedAt` = instante do fetch anterior).
 * @param {Array<{time: string}>|null|undefined} forecastJson — conteúdo do
 *   forecasts/<id>.json já commitado (array de horas).
 * @param {number} nowMs — instante da run actual (epoch ms).
 * @param {number} maxAgeHours — limite de frescura do fetch anterior.
 * @returns {{conditions: object, forecast: Array, carriedFromFetchedAt: string}|null}
 */
function carryOverForecast({ previousConditionsEntry, forecastJson, nowMs, maxAgeHours = MAX_CARRYOVER_AGE_HOURS }) {
  const fetchedAt = previousConditionsEntry?.updatedAt;
  const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(fetchedMs)) return null;
  if (nowMs - fetchedMs > maxAgeHours * 3_600_000) return null;
  if (!Array.isArray(forecastJson) || forecastJson.length === 0) return null;
  // A previsão tem de chegar a horas futuras — sem isso servíamos maré passada.
  const lastTimeMs = Date.parse(forecastJson[forecastJson.length - 1]?.time);
  if (!Number.isFinite(lastTimeMs) || lastTimeMs <= nowMs) return null;
  return {
    conditions: { ...previousConditionsEntry, carriedOver: true, carriedFromFetchedAt: fetchedAt },
    forecast: forecastJson,
    carriedFromFetchedAt: fetchedAt,
  };
}

/**
 * Reaproveita, para cada spot primário cujo fetch falhou nesta run, os dados
 * do run anterior — muta `allConditions`/`allForecasts` ANTES da escrita dos
 * ficheiros, para o validador `forecasts.splitFiles` (chaves ⇔ ficheiros)
 * continuar consistente.
 *
 * @param {Array<{id: string, conditionsSource?: string}>} spots — catálogo.
 * @param {object} allConditions — índice conditions desta run (mutado).
 * @param {object} allForecasts — índice forecasts desta run (mutado).
 * @param {object} previousConditions — conditions.json do run anterior.
 * @param {(id: string) => Array|null} readForecast — lê forecasts/<id>.json.
 * @returns {Set<string>} ids reaproveitados (para o gate de coverage).
 */
function applyCarryOver({
  spots,
  allConditions,
  allForecasts,
  previousConditions,
  readForecast,
  nowMs = Date.now(),
  maxAgeHours = MAX_CARRYOVER_AGE_HOURS,
  log = console,
}) {
  const carriedIds = new Set();
  for (const spot of spots) {
    if (spot.conditionsSource || allForecasts[spot.id]) continue;
    const carried = carryOverForecast({
      previousConditionsEntry: previousConditions?.[spot.id],
      forecastJson: readForecast(spot.id),
      nowMs,
      maxAgeHours,
    });
    if (!carried) continue;
    allConditions[spot.id] = carried.conditions;
    allForecasts[spot.id] = carried.forecast;
    carriedIds.add(spot.id);
    log.warn(`  ♻️ carry-over ${spot.id} — fetch falhou nesta run, reaproveitado o anterior (${carried.carriedFromFetchedAt})`);
  }
  if (carriedIds.size > 0) {
    log.warn(`⚠️ ${carriedIds.size} spot(s) com carry-over do run anterior (≤${maxAgeHours}h) — o gate de coverage conta-os como falha`);
  }
  return carriedIds;
}

module.exports = { carryOverForecast, applyCarryOver, MAX_CARRYOVER_AGE_HOURS };
