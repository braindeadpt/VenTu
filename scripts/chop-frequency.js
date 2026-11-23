'use strict';
/**
 * Frequência de disparo do «mar batido» (P2.4) por spot.
 *
 * Lê public/data/forecasts/*.json e conta as horas em que a penalização de
 * chop do motor v6 dispararia (mesma condição de modalidades/avalia.ts:
 * ww ≥ CHOP_MIN_WW_M dentro de hs ≥ CHOP_MIN_HS_M e ≥ CHOP_MIN_RATIO de hs).
 *
 * Uso: node scripts/chop-frequency.js [--top N]
 * Regra de bolso: >30–40 % das horas com onda num spot de qualidade → duro de mais.
 */
const fs = require('fs');
const path = require('path');

const CHOP_MIN_HS_M = 0.4;
const CHOP_MIN_WW_M = 0.5;
const CHOP_MIN_RATIO = 0.35;

const dir = path.join(__dirname, '../public/data/forecasts');
const topN = (() => {
  const i = process.argv.indexOf('--top');
  return i > 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

const rows = [];
let files = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '');
  let series;
  try {
    series = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch {
    continue;
  }
  files += 1;
  let total = 0;
  let onda = 0; // horas com hs ≥ limiar — o universo que interessa
  let chop = 0;
  let semWw = 0;
  for (const l of Array.isArray(series) ? series : []) {
    const hs = typeof l.waveHeight === 'number' ? Math.round(l.waveHeight * 10) / 10 : 0;
    const ww = typeof l.windWaveHeight === 'number' ? l.windWaveHeight : null;
    total += 1;
    if (ww == null) semWw += 1;
    if (hs < CHOP_MIN_HS_M) continue;
    onda += 1;
    if (ww != null && ww >= CHOP_MIN_WW_M && ww / hs >= CHOP_MIN_RATIO) chop += 1;
  }
  rows.push({ id, total, onda, chop, pct: onda ? (100 * chop) / onda : 0, semWw });
}

rows.sort((a, b) => b.pct - a.pct);
const show = topN ? rows.slice(0, topN) : rows;
console.log(`Mar batido (hs≥${CHOP_MIN_HS_M} m, ww≥${CHOP_MIN_WW_M} m, ww/hs≥${CHOP_MIN_RATIO}) — ${files} ficheiros\n`);
console.log(`${'spot'.padEnd(26)} ${'chop'.padStart(6)} ${'onda'.padStart(6)} ${'%'.padStart(6)} ${'semWW'.padStart(6)}`);
for (const r of show) {
  console.log(`${r.id.padEnd(26)} ${String(r.chop).padStart(6)} ${String(r.onda).padStart(6)} ${r.pct.toFixed(1).padStart(6)} ${String(r.semWw).padStart(6)}`);
}
const tot = rows.reduce((a, r) => ({ onda: a.onda + r.onda, chop: a.chop + r.chop, semWw: a.semWw + r.semWw }), { onda: 0, chop: 0, semWw: 0 });
console.log(`\nTOTAL: ${tot.chop}/${tot.onda} horas com onda (${tot.onda ? ((100 * tot.chop) / tot.onda).toFixed(1) : 0} %) · ${tot.semWw} horas sem ww`);
