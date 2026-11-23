'use strict';
/**
 * Revisão mensal da calibração do «mar batido» (P2.4) — corre no CI
 * (chop-calibration.yml) e abre/atualiza a issue de tracking quando há ação.
 *
 * Verifica:
 *  1. Frequência de disparo do chop por spot (>30 % num spot = sinal de ajuste).
 *  2. Pares forecast↔boia com `forecastWw` no arquivo do forecast-skill
 *     (janela móvel de 30 dias, não o mês de calendário): quando UMA boia tem
 *     ≥60 pares com ww e os dois lados (chop/sem-chop) têm amostra, divide a
 *     skill do hm0 em horas chop/sem-chop — se o erro piorar nas chop, os
 *     limiares justificam-se; se for uniforme, o chop é só qualidade de forma
 *     (vale na mesma, mas não é correção). A avaliação é por boia: somar
 *     pares de boias diferentes atingiria 60 sem amostra própria de nenhuma.
 *
 * Exit 0 sempre (report-only); o workflow lê o output e decide a issue.
 */
const fs = require('fs');
const path = require('path');
// Os limiares do chop vivem no motor (src/lib/modalidades/avalia.ts) —
// importar via tsx (mesmo padrão do build-map-hours.js) para o relatório
// medir sempre a regra em produção e não uma cópia desactualizada.
const { register } = require('tsx/cjs/api');
register();

const { readArchive, crossPairs, computeSkillStats } = require('./lib/forecastSkill');
const { CHOP_MIN_HS_M, CHOP_MIN_WW_M, CHOP_MIN_RATIO } = require('../src/lib/modalidades/avalia.ts');

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
// O mínimo de pares aplica-se POR BOIA — somar pares de boias diferentes
// atingia 60 sem que nenhuma tivesse amostra própria. E a classificação chop
// usa o hm0 arredondado a 1 casa, a mesma leitura que o motor faz junto do
// limiar de 35 % (horaSpot r1); o erro/MAE fica com o forecastHm0 original.
let pairReport = null;
try {
  // FORECAST_SKILL_ARCHIVE_PATH: override hermético (mesmo env do
  // fetch-forecast-skill.js) — testes apontam para um arquivo sintético.
  const archive = readArchive(process.env.FORECAST_SKILL_ARCHIVE_PATH || undefined);
  const pairs = crossPairs(archive).filter((p) => Number.isFinite(p.forecastWw));
  const toStats = (arr) =>
    computeSkillStats(arr.map((p) => ({ observedHm0: p.observedHm0, forecastHm0: p.forecastHm0 })));
  const byBuoy = new Map();
  for (const p of pairs) {
    const key = String(p.buoyId);
    if (!byBuoy.has(key)) byBuoy.set(key, { buoyId: p.buoyId, buoyName: p.buoyName, pairs: [] });
    byBuoy.get(key).pairs.push(p);
  }
  const perBuoy = [];
  for (const b of byBuoy.values()) {
    const chopPairs = [];
    const calmPairs = [];
    for (const p of b.pairs) {
      (isChopRow(Math.round(p.forecastHm0 * 10) / 10, p.forecastWw) ? chopPairs : calmPairs).push(p);
    }
    perBuoy.push({
      buoyId: b.buoyId,
      buoyName: b.buoyName,
      n: b.pairs.length,
      chop: chopPairs.length ? { n: chopPairs.length, ...toStats(chopPairs) } : null,
      calm: calmPairs.length ? { n: calmPairs.length, ...toStats(calmPairs) } : null,
    });
  }
  perBuoy.sort((a, b) => b.n - a.n);
  if (pairs.length) pairReport = { wwPairs: pairs.length, perBuoy };
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
  // Resumo global só como contexto — a «Ação sugerida» decide por boia.
  lines.push(`**Pares com forecastWw:** ${pairReport.wwPairs} em ${pairReport.perBuoy.length} boia(s) — avaliação por boia (≥${MIN_WW_PAIRS} pares + amostra nos dois lados).`);
  let avaliadas = 0;
  for (const b of pairReport.perBuoy) {
    const nome = b.buoyName ?? `boia ${b.buoyId}`;
    lines.push(`- \`${nome}\` (${b.buoyId}): ${b.n} pares com ww`);
    if (b.chop) lines.push(`  - Horas chop (ww≥${CHOP_MIN_WW_M} e ≥${CHOP_MIN_RATIO}·hs): n=${b.chop.n}, ME=${b.chop.me}, MAE=${b.chop.mae}, corr=${b.chop.corr}`);
    if (b.calm) lines.push(`  - Horas sem chop: n=${b.calm.n}, ME=${b.calm.me}, MAE=${b.calm.mae}, corr=${b.calm.corr}`);
    if (b.n >= MIN_WW_PAIRS && b.chop && b.calm) {
      avaliadas += 1;
      const maeDelta = Math.abs(b.chop.mae - b.calm.mae);
      if (maeDelta >= 0.15) {
        actions.push(`🎯 **${nome}** (${b.n} pares com ww) — MAE chop ${b.chop.mae} vs sem-chop ${b.calm.mae} (Δ${maeDelta.toFixed(2)} m) → rever \`CHOP_MIN_*\` em \`src/lib/modalidades/avalia.ts\`.`);
      } else {
        lines.push(`  - ✅ Erro uniforme (ΔMAE ${maeDelta.toFixed(2)} m) — limiares sem necessidade de ajuste.`);
      }
    } else {
      const falta = b.n < MIN_WW_PAIRS ? `≥${MIN_WW_PAIRS} pares com ww (tem ${b.n})` : 'amostra nos dois lados (chop e sem-chop)';
      lines.push(`  - ⏳ Sem avaliação ainda — falta ${falta}.`);
    }
  }
  if (!avaliadas) {
    lines.push(`⏳ Nenhuma boia avaliável ainda — o sinal para afinar \`CHOP_MIN_*\` chega quando uma boia tiver ≥${MIN_WW_PAIRS} pares com ww e os dois lados tiverem amostra.`);
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
