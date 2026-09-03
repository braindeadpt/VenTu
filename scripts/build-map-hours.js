#!/usr/bin/env node
/**
 * Gera public/data/map-hours.json — 16 passos de 3 h × score por spot/desporto.
 * Chamado no fim de update-conditions.js (run full). Também: node scripts/build-map-hours.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { register } = require('tsx/cjs/api');
register();

const { spots } = require('../src/lib/spots.ts');
const { buildMapHoursFile } = require('../src/lib/mapHours.ts');

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildMapHours(dataDir = path.join(__dirname, '../public/data')) {
  const forecasts = readJson(path.join(dataDir, 'forecasts.json'));
  const conditions = readJson(path.join(dataDir, 'conditions.json')) ?? {};
  if (!forecasts || typeof forecasts !== 'object') {
    console.warn('⚠️ build-map-hours: forecasts.json ausente — skip');
    return null;
  }
  const file = buildMapHoursFile({
    forecasts,
    conditions,
    spots,
    generatedAt: new Date().toISOString(),
  });
  const out = path.join(dataDir, 'map-hours.json');
  fs.writeFileSync(out, `${JSON.stringify(file)}\n`);
  const bytes = fs.statSync(out).size;
  const nTides = file.tides ? Object.keys(file.tides).length : 0;
  console.log(
    `⏱ map-hours.json: ${file.times.length} passos × ${Object.keys(file.spots).length} spots`
      + (nTides ? ` + ${nTides} regiões de maré` : '')
      + ` (${(bytes / 1024).toFixed(0)} KB)`,
  );
  return file;
}

if (require.main === module) {
  try {
    const dataDir = process.env.VENTU_DATA_DIR || path.join(__dirname, '../public/data');
    const file = buildMapHours(dataDir);
    if (!file) process.exit(1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

module.exports = { buildMapHours };
