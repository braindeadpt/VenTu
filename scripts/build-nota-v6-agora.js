#!/usr/bin/env node
/**
 * Motor único (#218), PR 3: grava em cada linha de public/data/conditions.json
 * a nota v6 «agora» — `notaV6: { t, kite, surf, seg, … }` — com a linha
 * «agora» de D4 (a dos alertas: hora coberta do forecast + observações
 * frescas por cima). O bake do /mapa e das listagens e o refresh do cliente só
 * a lêem (`src/lib/notaV6Agora.ts`): o motor v6 não corre no browser.
 *
 * Corre DEPOIS do último passo que escreve o conditions.json — o merge das
 * observações (`npm run obs:update` = build-station-map → merge-observations →
 * este script), nos runs full e só de observações. Também é chamado no fim do
 * update-conditions.js (antes do map-hours, cuja frame 0 usa a mesma linha).
 *
 * No run full o map-hours.json é gerado antes do merge das observações: se a
 * frame 0 do map-hours for a hora corrente, kitesurf e surf dessa frame passam
 * a ser este `notaV6` (× 10, `best` recalculado), para o «agora» da régua e o
 * dos marcadores serem o mesmo número.
 *
 * Uso: node scripts/build-nota-v6-agora.js  (VENTU_DATA_DIR para outra pasta;
 * VENTU_NOW_ISO para fixar o instante, ex. ao regenerar a fixture e2e).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { register } = require('tsx/cjs/api');
register();

const { spots } = require('../src/lib/spots.ts');
const { escreverNotasV6Agora, remendarFrame0 } = require('../src/lib/notaV6AgoraBuild.ts');
const { listForecastIds } = require('./lib/forecastsIndex');

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Escreve no mesmo formato que encontrou (o merge das observações grava indentado a 2). */
function writeJsonLike(file, original, data) {
  const indented = /^\{\s*\n\s+"/.test(original);
  const body = indented ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, original.endsWith('\n') ? `${body}\n` : body, 'utf8');
  fs.renameSync(tmp, file);
}

/** Leitor (com cache) das séries por spot: forecasts/<id>.json, ou o agregado antigo (fixtures sem pasta). */
function makeReader(dataDir) {
  const ids = new Set(listForecastIds(dataDir) ?? []);
  const cache = new Map();
  let agg;
  return (id) => {
    if (cache.has(id)) return cache.get(id);
    let rows = null;
    if (ids.has(id)) {
      rows = JSON.parse(fs.readFileSync(path.join(dataDir, 'forecasts', `${id}.json`), 'utf8'));
    } else if (ids.size === 0) {
      if (agg === undefined) agg = readJson(path.join(dataDir, 'forecasts.json'));
      rows = agg && Array.isArray(agg[id]) ? agg[id] : null;
    }
    if (!Array.isArray(rows)) rows = null;
    cache.set(id, rows);
    return rows;
  };
}

function buildNotaV6Agora(dataDir = path.join(__dirname, '../public/data'), nowMs = Date.now()) {
  const condPath = path.join(dataDir, 'conditions.json');
  if (!fs.existsSync(condPath)) {
    console.warn('⚠️ build-nota-v6-agora: conditions.json ausente — skip');
    return null;
  }
  const original = fs.readFileSync(condPath, 'utf8');
  const conditions = JSON.parse(original);
  const r = escreverNotasV6Agora(spots, conditions, makeReader(dataDir), nowMs);
  writeJsonLike(condPath, original, conditions);

  let patched = 0;
  const mhPath = path.join(dataDir, 'map-hours.json');
  if (fs.existsSync(mhPath)) {
    const mhOriginal = fs.readFileSync(mhPath, 'utf8');
    const mh = JSON.parse(mhOriginal);
    const notas = {};
    for (const [id, row] of Object.entries(conditions)) if (row && row.notaV6) notas[id] = row.notaV6;
    patched = remendarFrame0(mh, notas, nowMs);
    if (patched > 0) writeJsonLike(mhPath, mhOriginal, mh);
  }
  console.log(
    `🎯 notaV6 «agora» (D4): ${r.escritos} spots (${r.noite} de noite${r.semLinha ? `, ${r.semLinha} sem linha` : ''})`
      + (patched ? ` · frame 0 do map-hours alinhada em ${patched} spots` : ''),
  );
  return r;
}

function dropNotaV6(dataDir) {
  const condPath = path.join(dataDir, 'conditions.json');
  const original = fs.readFileSync(condPath, 'utf8');
  const conditions = JSON.parse(original);
  for (const row of Object.values(conditions)) if (row && typeof row === 'object') delete row.notaV6;
  writeJsonLike(condPath, original, conditions);
}

if (require.main === module) {
  const dataDir = process.env.VENTU_DATA_DIR || path.join(__dirname, '../public/data');
  try {
    const nowMs = process.env.VENTU_NOW_ISO ? Date.parse(process.env.VENTU_NOW_ISO) : Date.now();
    if (!Number.isFinite(nowMs)) throw new Error(`VENTU_NOW_ISO inválido: ${process.env.VENTU_NOW_ISO}`);
    buildNotaV6Agora(dataDir, nowMs);
  } catch (err) {
    // Nunca parte o pipeline: sem `notaV6` o bake e o refresh caem no motor
    // antigo (como antes do PR 3). Uma nota de um run anterior não fica a
    // passar por actual: tira-se de todas as linhas.
    console.error(err);
    console.log(`::warning title=notaV6 agora::build-nota-v6-agora falhou (${err && err.message}) — kite/surf no motor antigo neste run`);
    try {
      dropNotaV6(dataDir);
    } catch {
      /* sem conditions.json legível: nada a limpar */
    }
  }
}

module.exports = { buildNotaV6Agora };
