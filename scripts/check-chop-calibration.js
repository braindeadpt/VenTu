'use strict';
/**
 * Revisão mensal da calibração do «mar batido» (P2.4) — corre no CI
 * (chop-calibration.yml) e abre/atualiza a issue de tracking quando há ação.
 *
 * Verifica:
 *  1. Frequência de disparo do chop por spot (>30 % num spot = sinal de ajuste).
 *  2. Pares forecast↔boia com `forecastWw` no arquivo do forecast-skill:
 *     quando ≥60 pares/boia com ww, divide a skill do hm0 em horas chop/sem-chop
 *     — se o erro piorar nas chop, os limiares justificam-se; se for uniforme,
 *     o chop é só qualidade de forma (vale na mesma, mas não é correção).
 *
 * Exit 0 sempre (report-only); o workflow lê o output e decide a issue.
 */
const fs = require('fs');
const path = require('path');
const { readArchive, crossPairs, computeSkillStats } = require('./lib/forecastSkill');

const CHOP_MIN_HS_M = 0.4;
const CHOP_MIN_WW_M = 0.5;
const CHOP_MIN_RATIO = 0.35;
const SPOT_ALARM_PCT = 30;
const MIN_WW_PAIRS = 60;

const isChopRow = (hs, ww) => hs >= CHOP_MIN_HS_M && ww != null && ww >= CHOP_MIN_WW_M && ww / hs >= CHOP_MIN_RATIO;

// ── 1. Frequência de chop por spot ─────────────────────────────────────────
const dir = path.join(__dirname, '../public/data/forecasts');
const spots = [];
let totOnda = 0;
let totChop = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  let series;
  try {
    series = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch {
    continue;
  }
  let onda = 0;
  let chop = 0;
  for (const l of Array.isArray(series) ? series : []) {
    const hs = typeof l.waveHeight === 'number' ? Math.round(l.waveHeight * 10) / 10 : 0;
    if (hs < CHOP_MIN_HS_M) continue;
    onda += 1;
    if (isChopRow(hs, l.windWaveHeight ?? null)) chop += 1;
  }
  totOnda += onda;
  totChop += chop;
  spots.push({ id: f.replace(/\.json$/, ''), onda, chop, pct: onda ? (100 * chop) / onda : 0 });
}
const alarms = spots.filter((s) => s.pct > SPOT_ALARM_PCT).sort((a, b) => b.pct - a.pct);

// ── 2. Pares com forecastWw: skill do hm0 em horas chop vs sem-chop ─────────
let pairReport = null;
try {
  const archive = readArchive();
  const pairs = crossPairs(archive).filter((p) => Number.isFinite(p.forecastWw));
  const chopPairs = pairs.filter((p) => p.forecastWw >= CHOP_MIN_WW_M && p.forecastWw / p.forecastHm0 >= CHOP_MIN_RATIO && p.forecastHm0 >= CHOP_MIN_HS_M);
  const calmPairs = pairs.filter((p) => !chopPairs.includes(p));
  const toStats = (arr) =>
    computeSkillStats(arr.map((p) => ({ observedHm0: p.observedHm0, forecastHm0: p.forecastHm0 })));
  if (pairs.length) {
    pairReport = {
      wwPairs: pairs.length,
      chop: chopPairs.length ? { n: chopPairs.length, ...toStats(chopPairs) } : null,
      calm: calmPairs.length ? { n: calmPairs.length, ...toStats(calmPairs) } : null,
    };
  }
} catch {
  /* sem arquivo — report só com a frequência */
}

// ── Relatório ──────────────────────────────────────────────────────────────
const lines = [];
const actions = [];
lines.push(`### 📊 Chop calibration — ${new Date().toISOString().slice(0, 10)}`);
lines.push('');
lines.push(`**Frequência global:** ${totChop}/${totOnda} horas com onda (${totOnda ? ((100 * totChop) / totOnda).toFixed(1) : 0} %)`);
lines.push('');
if (alarms.length) {
  actions.push(`⚠️ ${alarms.length} spot(s) com chop >${SPOT_ALARM_PCT}% das horas com onda:`);
  for (const s of alarms.slice(0, 10)) actions.push(`- \`${s.id}\` — ${s.chop}/${s.onda} (${s.pct.toFixed(1)} %)`);
} else {
  lines.push(`✅ Nenhum spot acima de ${SPOT_ALARM_PCT}% (top: ${spots.sort((a, b) => b.pct - a.pct).slice(0, 3).map((s) => `${s.id} ${s.pct.toFixed(0)}%`).join(', ')})`);
}
lines.push('');
if (!pairReport) {
  lines.push('⏳ Pares `forecastWw`↔boia ainda indisponíveis (o arquivo começou a acumular com a Fase 3 — revisitar quando houver ≥60/boia).');
} else {
  lines.push(`**Pares com forecastWw:** ${pairReport.wwPairs}`);
  if (pairReport.chop) lines.push(`- Horas chop (ww≥${CHOP_MIN_WW_M} e ≥${CHOP_MIN_RATIO}·hs): n=${pairReport.chop.n}, ME=${pairReport.chop.me}, MAE=${pairReport.chop.mae}, corr=${pairReport.chop.corr}`);
  if (pairReport.calm) lines.push(`- Horas sem chop: n=${pairReport.calm.n}, ME=${pairReport.calm.me}, MAE=${pairReport.calm.mae}, corr=${pairReport.calm.corr}`);
  if (pairReport.wwPairs >= MIN_WW_PAIRS && pairReport.chop && pairReport.calm) {
    const maeDelta = Math.abs(pairReport.chop.mae - pairReport.calm.mae);
    if (maeDelta >= 0.15) {
      actions.push(`🎯 **${pairReport.wwPairs} pares com ww** — MAE chop ${pairReport.chop.mae} vs sem-chop ${pairReport.calm.mae} (Δ${maeDelta.toFixed(2)} m) → rever \`CHOP_MIN_*\` em \`src/lib/modalidades/avalia.ts\`.`);
    } else {
      lines.push(`✅ ${pairReport.wwPairs} pares com ww e erro uniforme (ΔMAE ${maeDelta.toFixed(2)} m) — limiares sem necessidade de ajuste.`);
    }
  } else {
    lines.push(`⏳ ${pairReport.wwPairs} pares com ww — revisitar quando ≥${MIN_WW_PAIRS} e ambos os lados tiverem amostra.`);
  }
}
lines.push('');
if (actions.length) {
  lines.push('### ⚡ Ação sugerida');
  lines.push(...actions);
} else {
  lines.push('✅ Sem ação — manter limiares.');
}
lines.push('');
lines.push('_Gerado por `scripts/check-chop-calibration.js` (workflow `chop-calibration.yml`)._');
console.log(lines.join('\n'));
