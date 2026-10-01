'use strict';
/**
 * Bake das áreas de aviso IPMA → public/geo/warning-areas.json (B2).
 *
 * Fontes (keyless):
 * - Distritos do continente: DGT OGC API, colecção `distritos` (CAOP2025,
 *   oficial). A OGC API só publica o continente — bbox confirmado.
 * - Ilhas (Madeira, Porto Santo, 9 Açores): OpenStreetMap via Nominatim
 *   (polígono administrativo da ilha, 1 req/s — usage policy).
 *
 * É um bake ocasional (fronteiras administrativas quase não mudam) — NÃO
 * corre no workflow diário; o artefacto é commitado. Correr à mão:
 *   npm run warnings:areas
 *
 * Env: WARN_AREAS_OUTPUT_PATH para override em testes.
 */

const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const { ISLAND_GROUPS, buildAreasPayload } = require('./lib/warningAreas.js');

const DGT_DISTRICTS_URL =
  process.env.DGT_DISTRICTS_URL ||
  'https://ogcapi.dgterritorio.gov.pt/collections/distritos/items?f=json&limit=20';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OUTPUT_PATH =
  process.env.WARN_AREAS_OUTPUT_PATH ||
  path.join(__dirname, '../public/geo/warning-areas.json');
const FETCH_TIMEOUT_MS = 60_000;
const NOMINATIM_GAP_MS = 1_200; // usage policy: máx. 1 req/s
const UA = 'VenTu (ventu.surf) warning-areas bake, contact via GitHub';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': UA, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 110)}`);
  return res.json();
}

/** Primeira geometria Polygon/MultiPolygon devolvida pelo Nominatim. */
async function fetchIslandGeometry(query) {
  const url =
    `${NOMINATIM_URL}?format=geojson&polygon_geojson=1&limit=5&q=` +
    encodeURIComponent(query);
  const data = await fetchJson(url);
  const feat = (data?.features || []).find(
    (f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );
  if (!feat) throw new Error(`sem polígono para «${query}»`);
  return feat.geometry;
}

async function main() {
  console.log('⚠️  Áreas de aviso IPMA →', path.basename(OUTPUT_PATH));

  const distritos = await fetchJson(DGT_DISTRICTS_URL);
  const features = distritos?.features || [];
  console.log(`  DGT distritos: ${features.length} features`);

  const islandGeometries = {};
  const islandQueries = ISLAND_GROUPS.flatMap((g) => g.islands);
  for (const q of islandQueries) {
    await sleep(NOMINATIM_GAP_MS);
    islandGeometries[q] = await fetchIslandGeometry(q);
    console.log(`  ilha «${q}» OK`);
  }

  const payload = buildAreasPayload(features, islandGeometries, new Date().toISOString());
  const groups = Object.keys(payload.groups);
  if (groups.length < 20) {
    throw new Error(`cobertura incompleta — ${groups.length}/23 grupos (${groups.join(',')})`);
  }
  atomicWriteJson(OUTPUT_PATH, payload);
  const kb = Math.round(JSON.stringify(payload).length / 1024);
  console.log(`  ✅ ${groups.length} grupos · ~${kb} KB`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ fetch-warning-areas:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
