'use strict';

/**
 * Anomalia de maré (maré meteorológica / storm surge).
 *
 * Problema de datum: o maregrafo IH reporta SSH vs ZH (zero hidrográfico,
 * ~2–4 m abaixo do MSL conforme o porto) e a previsão do produto é
 * `sea_level_height_msl` do Open-Meteo (vs MSL). Subtrair directo mistura
 * o offset de datum com a anomalia real.
 *
 * Segundo problema (medido a 2026-09-29): o resíduo cru `obsZh − predMsl`
 * não é constante — oscila ±0.5 m com a fase da maré porque a amplitude de
 * maré real (IH) difere da do modelo. Uma mediana global mistura fases e
 * enviesa a anomalia em ±0.3–0.5 m (falsos «maré meteorológica»).
 *
 * Solução: baseline por fase. Guardam-se amostras `[t, resíduo]`; a
 * anomalia compara o resíduo actual com resíduos da MESMA fase de maré —
 * a janela 10–15 h atrás (≈ um ciclo M2 de 12.42 h). O offset de datum e
 * o viés de amplitude cancelam na subtracção. Sem amostras da mesma fase,
 * omite — nunca inventa.
 *
 * O baseline vive em data-state/tide-anomaly-baseline.json (git, como os
 * outros archives) e é semeado por scripts/calibrate-tide-baseline.js
 * (24 h de série EDR vs sea_level passado do OM, amostras horárias).
 */

/** Amostras mínimas na janela de mesma fase antes de emitir (abaixo, omite). */
const MIN_SAME_PHASE = 1;
/** Janela «mesma fase M2»: resíduos com idade neste intervalo (horas). */
const SAME_PHASE_MIN_H = 10;
const SAME_PHASE_MAX_H = 15;
/** Amostras mínimas totais — protege contra baseline quase vazio. */
const MIN_BASELINE_PAIRS = 8;
/** Janela rolling (~30 dias à cadência de 3 h). */
const MAX_SAMPLES = 240;
/** |anomalia| acima disto = lixo de sensor/leitura — omitir, não reportar. */
const MAX_ANOMALY_M = 1.5;
/** |resíduo cru| acima disto não entra no baseline (salto de datum/corrupto). */
const MAX_RAW_RESIDUAL_M = 6;
/** |anomalia| a partir da qual a UI assinala «maré meteorológica». */
const SIGNIFICANT_ANOMALY_M = 0.3;
/** Amostras duplicadas no mesmo minuto (N spots → mesma estação) ignoram-se. */
const DEDUPE_WINDOW_MS = 120_000;

const round3 = (n) => Math.round(n * 1000) / 1000;

function median(values) {
  if (!values || values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Amostras da entrada — tolera o formato legado `residuals: number[]`. */
function samplesOf(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.samples)) return entry.samples;
  // Legado: resíduos sem timestamp — contam para n mas não para mesma fase.
  if (Array.isArray(entry.residuals)) return entry.residuals.map((v) => [null, v]);
  return [];
}

/**
 * Regista um resíduo cru (obsZh − predMsl) na entrada da estação.
 * `atIso` é o instante da observação IH (não o da run) — a comparação por
 * fase depende dele. Muta `stations[codp]` e devolve a entrada.
 * Resíduos implausíveis ou duplicados no mesmo minuto são descartados.
 */
function recordResidual(stations, codp, residual, atIso, maxN = MAX_SAMPLES) {
  if (!stations || codp == null) return null;
  const r = Number(residual);
  if (!Number.isFinite(r) || Math.abs(r) > MAX_RAW_RESIDUAL_M) return null;
  const t = atIso ? new Date(atIso).getTime() : Date.now();
  if (!Number.isFinite(t)) return null;
  const key = String(codp);
  const entry = stations[key] || (stations[key] = { samples: [] });
  if (!Array.isArray(entry.samples)) entry.samples = [];
  const iso = new Date(t).toISOString();
  if (entry.samples.some(([ts]) => ts && Math.abs(new Date(ts).getTime() - t) < DEDUPE_WINDOW_MS)) {
    return entry;
  }
  entry.samples.push([iso, round3(r)]);
  if (entry.samples.length > maxN) {
    entry.samples = entry.samples.slice(-maxN);
  }
  const values = entry.samples.map(([, v]) => v);
  entry.n = entry.samples.length;
  entry.median = round3(median(values));
  entry.updatedAt = new Date().toISOString();
  return entry;
}

/**
 * Anomalia em metros: resíduo actual − mediana dos resíduos na mesma fase
 * de maré (10–15 h atrás ≈ ciclo M2 anterior). null quando o baseline não
 * tem cobertura de fase ou a anomalia não é plausível — a UI omite em vez
 * de mostrar um número enviesado pelo mismatch de amplitude.
 */
function tideAnomalyM({ obsZh, predMsl, entry, nowMs }) {
  if (!entry) return null;
  const samples = samplesOf(entry);
  if (samples.length < MIN_BASELINE_PAIRS) return null;
  // Guard null/undefined explícito: Number(null) === 0 mentiria o datum.
  if (obsZh == null || predMsl == null) return null;
  const obs = Number(obsZh);
  const pred = Number(predMsl);
  if (!Number.isFinite(obs) || !Number.isFinite(pred)) return null;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const samePhase = samples
    .filter(([ts]) => {
      if (!ts) return false;
      const ageH = (now - new Date(ts).getTime()) / 3_600_000;
      return ageH >= SAME_PHASE_MIN_H && ageH <= SAME_PHASE_MAX_H;
    })
    .map(([, v]) => v);
  if (samePhase.length < MIN_SAME_PHASE) return null;
  const baseline = median(samePhase);
  const a = obs - pred - baseline;
  if (!Number.isFinite(a) || Math.abs(a) > MAX_ANOMALY_M) return null;
  return round3(a);
}

module.exports = {
  MIN_BASELINE_PAIRS,
  MIN_SAME_PHASE,
  SAME_PHASE_MIN_H,
  SAME_PHASE_MAX_H,
  MAX_SAMPLES,
  MAX_RESIDUALS: MAX_SAMPLES,
  MAX_ANOMALY_M,
  MAX_RAW_RESIDUAL_M,
  SIGNIFICANT_ANOMALY_M,
  median,
  recordResidual,
  tideAnomalyM,
};
