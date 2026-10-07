#!/usr/bin/env node
'use strict';

/**
 * build-sea-grid.js — grelha regular 0.25° de vento + ondulação sobre Portugal
 * continental, para o protótipo «Mar vivo» (src/app/[locale]/lab/mar-vivo).
 *
 * NÃO está ligado ao CI nem ao update-data. É o passo seguinte ao IDW a partir
 * dos spots: correr à mão e comparar visualmente antes de decidir ligá-lo.
 *
 * Fontes (Open-Meteo, mesmas que o pipeline já usa):
 *   - https://api.open-meteo.com/v1/forecast         wind_speed_10m, wind_direction_10m (m/s)
 *   - https://marine-api.open-meteo.com/v1/marine    wave_height, swell_wave_direction, swell_wave_period
 * Ambas aceitam várias coordenadas separadas por vírgula numa só chamada
 * (`latitude=a,b&longitude=c,d`); a resposta passa a ser uma lista, pela mesma
 * ordem (docs: https://open-meteo.com/en/docs/marine-weather-api, parâmetro
 * «latitude, longitude»). O Open-Meteo conta cada localização como uma chamada
 * para o limite por minuto, por isso os lotes são espaçados.
 *
 * Saída (compacta, inteiros; null = sem dado, p.ex. célula de terra no marine):
 * {
 *   generatedAt, source, bbox: [w, s, e, n], step: 0.25, nx, ny,
 *   times: ["2026-10-07T18:00", ...]         // hora local Lisboa, de 3 em 3 h
 *   // arrays [t][j*nx+i], j=0 é a linha mais a NORTE
 *   windSpd10: dm/s, windDir: °, hs10: dm, swellDir: °, swellPer10: ds
 * }
 *
 * Uso: node scripts/build-sea-grid.js [--out public/data/sea-grid.json] [--hours 48]
 */

const fs = require('fs');
const path = require('path');

const BBOX = { west: -11.5, south: 36.0, east: -6.0, north: 42.5 };
const STEP = 0.25;
const STEP_HOURS = 3;
const BATCH = 100;
const BATCH_PAUSE_MS = 11000; // ~100 localizações por chamada → < 600/min
const TZ = 'Europe/Lisbon';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = path.resolve(arg('--out', path.join(__dirname, '..', 'public', 'data', 'sea-grid.json')));
const HOURS = Math.max(6, Math.min(96, Number(arg('--hours', '48')) || 48));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gridPoints() {
  const nx = Math.round((BBOX.east - BBOX.west) / STEP) + 1;
  const ny = Math.round((BBOX.north - BBOX.south) / STEP) + 1;
  const pts = [];
  for (let j = 0; j < ny; j++) {
    const lat = +(BBOX.north - j * STEP).toFixed(3);
    for (let i = 0; i < nx; i++) {
      pts.push({ lat, lon: +(BBOX.west + i * STEP).toFixed(3) });
    }
  }
  return { nx, ny, pts };
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': 'VenTu sea-grid prototype (ventu.surf)' } });
  if (res.status === 429 && attempt <= 3) {
    await sleep(60000);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}…`);
  return res.json();
}

async function fetchBatched(base, hourly, pts, extra) {
  const out = [];
  for (let k = 0; k < pts.length; k += BATCH) {
    const chunk = pts.slice(k, k + BATCH);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat).join(','),
      longitude: chunk.map((p) => p.lon).join(','),
      hourly: hourly.join(','),
      timezone: TZ,
      forecast_days: '4',
      ...extra,
    });
    const json = await fetchJson(`${base}?${params}`);
    const list = Array.isArray(json) ? json : [json];
    if (list.length !== chunk.length) throw new Error(`esperava ${chunk.length} localizações, veio ${list.length}`);
    out.push(...list);
    process.stdout.write(`  ${base.split('/')[2]} ${Math.min(k + BATCH, pts.length)}/${pts.length}\n`);
    if (k + BATCH < pts.length) await sleep(BATCH_PAUSE_MS);
  }
  return out;
}

function lisbonHourKey(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

function pickTimes(times) {
  const nowKey = lisbonHourKey();
  let start = times.findIndex((t) => t.slice(0, 13) >= nowKey);
  if (start < 0) start = 0;
  const idx = [];
  for (let i = start; i < times.length && idx.length * STEP_HOURS <= HOURS; i += STEP_HOURS) idx.push(i);
  return idx;
}

const q = (v, mul) => (v == null || !Number.isFinite(v) ? null : Math.round(v * mul));

async function main() {
  const { nx, ny, pts } = gridPoints();
  console.log(`[sea-grid] ${nx}×${ny} = ${pts.length} pontos a ${STEP}°`);

  const wind = await fetchBatched(
    'https://api.open-meteo.com/v1/forecast',
    ['wind_speed_10m', 'wind_direction_10m'],
    pts,
    { wind_speed_unit: 'ms' },
  );
  const marine = await fetchBatched(
    'https://marine-api.open-meteo.com/v1/marine',
    ['wave_height', 'swell_wave_direction', 'swell_wave_period'],
    pts,
    { cell_selection: 'sea' },
  );

  const times = wind[0].hourly.time;
  const idx = pickTimes(times);
  const series = (list, key, mul) =>
    idx.map((ti) => list.map((loc) => q(loc.hourly?.[key]?.[ti], mul)));

  // O marine com cell_selection=sea pode «puxar» pontos de terra para o mar
  // mais próximo; marcamos como null os pontos cuja célula devolvida está a
  // mais de 0.2° do pedido (tipicamente interior).
  const farFromRequest = marine.map(
    (loc, k) => Math.abs(loc.latitude - pts[k].lat) > 0.2 || Math.abs(loc.longitude - pts[k].lon) > 0.2,
  );
  const maskFar = (arr) => arr.map((row) => row.map((v, k) => (farFromRequest[k] ? null : v)));

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'Open-Meteo forecast + marine (best match)',
    bbox: [BBOX.west, BBOX.south, BBOX.east, BBOX.north],
    step: STEP,
    nx,
    ny,
    times: idx.map((ti) => times[ti]),
    windSpd10: series(wind, 'wind_speed_10m', 10),
    windDir: series(wind, 'wind_direction_10m', 1),
    hs10: maskFar(series(marine, 'wave_height', 10)),
    swellDir: maskFar(series(marine, 'swell_wave_direction', 1)),
    swellPer10: maskFar(series(marine, 'swell_wave_period', 10)),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`[sea-grid] ${out.times.length} passos → ${path.relative(process.cwd(), OUT)} (${kb} KB)`);
}

main().catch((err) => {
  console.error('[sea-grid] falhou:', err.message);
  process.exit(1);
});
