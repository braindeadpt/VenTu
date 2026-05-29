/**
 * generate-spot-aerials.mjs
 *
 * Gera UM thumbnail aéreo (satélite) por spot a partir das coordenadas reais.
 * Imagem é SEMPRE o sítio exato — nunca stock genérico. Corre uma vez; idempotente
 * (salta os que já existem). Re-corre quando se adiciona/move um spot.
 *
 *   node scripts/generate-spot-aerials.mjs            # todos os spots em falta
 *   node scripts/generate-spot-aerials.mjs --limit 5  # testar com 5
 *   node scripts/generate-spot-aerials.mjs --force     # regenerar todos
 *   node scripts/generate-spot-aerials.mjs --only vale-figueiras,baleal
 *
 * Provider AGNÓSTICO: por defeito usa o Esri World Imagery export (o mesmo serviço
 * já usado no mapa, sem token). Para trocar para MapTiler/Mapbox Static (termos mais
 * explícitos p/ imagens estáticas), reescrever apenas getExportUrl().
 *
 * ATRIBUIÇÃO obrigatória onde as imagens aparecem: "Imagery © Esri, Maxar, Earthstar Geographics".
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SPOTS_INDEX = join(ROOT, 'public', 'data', 'spots-index.json');
const OUT_DIR = join(ROOT, 'public', 'images', 'spots');

// ── imagem ──
const IMG_W = 800;
const IMG_H = 600;
const HALF_LON_DEG = 0.022; // meia-largura em graus de longitude (~3.4 km @ lat 39)
const REQUEST_SPACING_MS = 150;
const MAX_RETRIES = 3;

// ── args ──
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const FORCE = args.includes('--force');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;
const ONLY = getArg('--only') ? new Set(getArg('--only').split(',').map((s) => s.trim())) : null;

/**
 * URL do provider. AGNÓSTICO — trocar só esta função para mudar de fonte.
 * bbox aspect-correto: dy ajustado por cos(lat) e pela razão da imagem para não distorcer.
 */
function getExportUrl(lat, lon) {
  const halfLon = HALF_LON_DEG;
  const halfLat = (halfLon * Math.cos((lat * Math.PI) / 180) * IMG_H) / IMG_W;
  const xmin = lon - halfLon;
  const xmax = lon + halfLon;
  const ymin = lat - halfLat;
  const ymax = lat + halfLat;
  const params = new URLSearchParams({
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${IMG_W},${IMG_H}`,
    format: 'jpg',
    f: 'image',
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params}`;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchImage(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'image/jpeg,image/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('image')) throw new Error(`content-type ${ct}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) throw new Error(`suspiciously small (${buf.length}b)`);
      return buf;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await delay(400 * attempt);
    }
  }
}

async function main() {
  if (!existsSync(SPOTS_INDEX)) {
    console.error(`✗ Não encontrei ${SPOTS_INDEX}. Corre "npm run spots:index" primeiro.`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const raw = JSON.parse(readFileSync(SPOTS_INDEX, 'utf-8'));
  const spots = Array.isArray(raw) ? raw : raw.spots ?? [];

  let candidates = spots.filter((s) => s.slug && typeof s.lat === 'number' && typeof s.lon === 'number');
  if (ONLY) candidates = candidates.filter((s) => ONLY.has(s.slug));
  if (!FORCE) candidates = candidates.filter((s) => !existsSync(join(OUT_DIR, `${s.slug}.jpg`)));
  candidates = candidates.slice(0, LIMIT);

  console.log(`Spots no índice: ${spots.length} · a gerar: ${candidates.length}${FORCE ? ' (--force)' : ''}`);
  if (candidates.length === 0) {
    console.log('Nada a fazer (tudo já existe — usa --force para regenerar).');
    return;
  }

  let ok = 0;
  const failed = [];
  for (const s of candidates) {
    const dest = join(OUT_DIR, `${s.slug}.jpg`);
    try {
      const buf = await fetchImage(getExportUrl(s.lat, s.lon));
      writeFileSync(dest, buf);
      ok++;
      console.log(`✓ ${s.slug} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failed.push(s.slug);
      console.log(`✗ ${s.slug} — ${err.message}`);
    }
    await delay(REQUEST_SPACING_MS);
  }

  // resumo + tamanhos
  const sizes = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => statSync(join(OUT_DIR, f)).size);
  const avgKb = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length / 1024 : 0;
  console.log(`\nFeito: ${ok} ok, ${failed.length} falhas. Total em disco: ${sizes.length} imagens, média ${avgKb.toFixed(0)} KB.`);
  if (failed.length) console.log('Falhas:', failed.join(', '));
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
