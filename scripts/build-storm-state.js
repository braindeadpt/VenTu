'use strict';
/**
 * Build storm-state.json (B1 do docs/STORM-STUDY.md) — deriva, por spot:
 *  - estado de precipitação do radar IPMA (eco mais próximo, intensidade,
 *    «a aproximar-se» por deslocamento do centróide entre frames)
 *  - nível máximo de aviso IPMA activo
 *  - dentro do cone NHC
 *
 * Sem rede: lê radar.json + frames PNG já baked, warnings.json, storms.json
 * e spots.ts. Corre DEPOIS desses fetchers no pipeline.
 *
 * Env: STORM_STATE_OUTPUT para override em testes.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const { parseSpotsFromFile } = require('./lib/ipma.js');
const {
  echoPixels,
  buildStormState,
} = require('./lib/stormState.js');

const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_PATH = process.env.STORM_STATE_OUTPUT || path.join(DATA_DIR, 'storm-state.json');
/** Frame de comparação para o vector de aproximação (~15-20 min atrás). */
const COMPARE_FRAME_INDEX = 3;

function loadJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf-8'));
  } catch {
    return null;
  }
}

async function analyzeFrame(framePath, bounds) {
  const { data, info } = await sharp(path.join(DATA_DIR, framePath))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { px } = echoPixels(data, info.width, info.height);
  return { echoList: px, w: info.width, h: info.height, bounds };
}

async function main() {
  const radar = loadJson('radar.json');
  if (!radar || !Array.isArray(radar.frames) || radar.frames.length === 0) {
    console.warn('⚠️ storm-state: radar.json ausente/sem frames — artefacto não escrito');
    process.exit(0);
  }
  const bounds = radar.bounds;
  const framesIdx = [0];
  if (radar.frames.length > COMPARE_FRAME_INDEX) framesIdx.push(COMPARE_FRAME_INDEX);

  const framesAnalysed = [];
  for (const i of framesIdx) {
    const f = radar.frames[i];
    const p = path.join(DATA_DIR, f.imagePath);
    if (!fs.existsSync(p)) {
      console.warn(`⚠️ storm-state: frame em falta ${f.imagePath} — ignorada`);
      continue;
    }
    const a = await analyzeFrame(f.imagePath, bounds);
    framesAnalysed.push({ frameTime: f.frameTime, ...a });
  }
  if (framesAnalysed.length === 0) {
    console.warn('⚠️ storm-state: nenhum frame decodificado — artefacto não escrito');
    process.exit(0);
  }

  const warnings = loadJson('warnings.json');
  const storms = loadJson('storms.json');
  const spots = parseSpotsFromFile(path.join(__dirname, '../src/lib/spots.ts'));

  const payload = buildStormState(framesAnalysed, spots, warnings, storms, new Date().toISOString());
  atomicWriteJson(OUTPUT_PATH, payload);

  const counts = { over: 0, near: 0, clean: 0, none: 0 };
  for (const s of Object.values(payload.spots)) {
    if (!s.radar) counts.none += 1;
    else counts[s.radar.state] += 1;
  }
  console.log(
    `⛈️ storm-state → ${path.relative(process.cwd(), OUTPUT_PATH)}\n` +
      `   frame ${payload.radar.frameTime} vs ${payload.radar.compareFrameTime ?? '—'} · ` +
      `${Object.keys(payload.spots).length} spots: ${counts.over} sobre · ${counts.near} perto · ` +
      `${counts.clean} limpos · ${counts.none} fora do radar`,
  );
}

main().catch((e) => {
  console.error('❌ storm-state:', e.message || e);
  process.exit(1);
});
