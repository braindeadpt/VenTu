'use strict';
/**
 * Fetch NHC tropical storms → public/data/storms.json (B0 do STORM-STUDY).
 *
 * Keyless NOAA. Filtra à região Ventu (Ibéria + mar até Açores/Madeira);
 * o cone a tocar a região conta mesmo com o centro fora. Falhas de KMZ
 * deixam `track`/`cone` a null — nunca inventa geometria.
 *
 * Env: NHC_OUTPUT_PATH para override em testes.
 */

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const {
  REGION,
  unzipKmz,
  parseKmlPlacemarks,
  simplifyRing,
  normalizeStorm,
  stormInScope,
  buildStormsPayload,
} = require('./lib/nhcStorms.js');

const CURRENT_STORMS_URL =
  process.env.NHC_CURRENT_URL || 'https://www.nhc.noaa.gov/CurrentStorms.json';
const OUTPUT_PATH =
  process.env.NHC_OUTPUT_PATH || path.join(__dirname, '../public/data/storms.json');
const CONE_SIMPLIFY_EPS = 0.05; // graus — ~150 pts finais de ~1500
const FETCH_TIMEOUT_MS = 30_000;

function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({ id: match[1], lat: parseFloat(match[2]), lon: parseFloat(match[3]) });
  }
  return spots;
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchKmz(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Anexa track/trackPoints/cone à tempestade normalizada. Nunca lança. */
async function attachGeometry(storm) {
  if (storm.coneKmz) {
    try {
      const buf = await fetchKmz(storm.coneKmz);
      const pms = buf ? parseKmlPlacemarks(unzipKmz(buf) || '') : [];
      const cone = pms.find((p) => p.type === 'polygon');
      if (cone) storm.cone = simplifyRing(cone.coords, CONE_SIMPLIFY_EPS);
    } catch (err) {
      console.warn(`  ⚠️ cone KMZ ${storm.id}: ${err.message}`);
    }
  }
  if (storm.trackKmz) {
    try {
      const buf = await fetchKmz(storm.trackKmz);
      const pms = buf ? parseKmlPlacemarks(unzipKmz(buf) || '') : [];
      const lines = pms.filter((p) => p.type === 'line');
      if (lines.length) {
        // A linha mais longa é a previsão completa (best track + forecast
        // partilham o ponto actual — a union ordenada é a que acaba mais a E).
        const best = lines.reduce((a, b) => (a.coords.length >= b.coords.length ? a : b));
        storm.track = best.coords;
      }
      const pts = pms.filter((p) => p.type === 'point');
      if (pts.length) {
        storm.trackPoints = pts.map((p) => ({
          lat: p.coords[0][1],
          lon: p.coords[0][0],
          forecastHr: p.forecastHr ?? null,
          validAt: p.validAt ?? null,
          maxWindMph: p.maxWindMph ?? null,
        }));
      }
    } catch (err) {
      console.warn(`  ⚠️ track KMZ ${storm.id}: ${err.message}`);
    }
  }
  delete storm.trackKmz;
  delete storm.coneKmz;
  if (!storm.cone) storm.cone = null;
  if (!storm.track) storm.track = null;
  if (!storm.trackPoints) storm.trackPoints = null;
  return storm;
}

async function main() {
  console.log('🌀 NHC tropical storms →', path.basename(OUTPUT_PATH));
  const current = await fetchJson(CURRENT_STORMS_URL);
  const raw = current?.activeStorms || [];
  console.log(`  ${raw.length} tempestades activas na bacia`);

  const normalized = raw.map(normalizeStorm).filter(Boolean);
  const spots = parseSpotsFromFile();

  const kept = [];
  for (const s of normalized) {
    // Geometria primeiro (KMZ ~8 KB por produto, poucas tempestades): um
    // cone a tocar a região com o centro fora não pode cair num pré-filtro.
    await attachGeometry(s);
    const scope = stormInScope(s, REGION);
    if (!scope.inScope) continue;
    s.coneTouchesRegion = scope.coneTouches === null ? null : scope.coneTouches;
    kept.push(s);
  }

  const payload = buildStormsPayload(current, kept, spots, new Date().toISOString());
  atomicWriteJson(OUTPUT_PATH, payload);
  console.log(
    `  ✅ ${kept.length} na região (${REGION.latMin}–${REGION.latMax}N, ${REGION.lonMin}→${REGION.lonMax}E)`,
    `· ${Object.keys(payload.spotStorms).length} spots dentro de cones`,
  );
  for (const s of kept) {
    console.log(
      `   · ${s.name} ${s.classification} ${s.intensityMph} mph | ${s.lat.toFixed(1)}N ${s.lon.toFixed(1)}W`,
      `| ${s.movementDirDeg}°@${s.movementSpeedMph} mph`,
      `| track ${s.track ? s.track.length + 'pts' : '—'} cone ${s.cone ? s.cone.length + 'pts' : '—'}`,
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ fetch-nhc-storms:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { main, attachGeometry, parseSpotsFromFile };
