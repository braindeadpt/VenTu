/**
 * On-demand ensemble model health probe.
 *
 * Fetches the multimodel wave + wind responses for ONE representative spot
 * and prints per-model non-null counts, flagging models that return only null
 * (dead — e.g. the old ecmwf_wam025). The always-on detection happens inside
 * update-conditions.js (accumulates real data across all spots and writes
 * public/data/model-health.json); this CLI is for debugging/CI checks.
 *
 * Usage:
 *   node scripts/check-model-health.js                  # first primary spot
 *   node scripts/check-model-health.js --spot nazare    # specific spot
 *   node scripts/check-model-health.js --notify         # + Telegram transition alert
 *
 * Exit codes:
 *   0 — all configured models returned data
 *   1 — at least one configured model returned only null (dead)
 */

const fs = require('fs');
const path = require('path');
const {
  HEALTH_FAMILIES,
  countModelSlots,
  classifyModelCounts,
  buildHealthReport,
  notifyDeadModels,
} = require('./lib/modelHealth');

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({ id: match[1], lat: parseFloat(match[2]), lon: parseFloat(match[3]) });
  }
  const seen = new Set();
  return spots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

async function fetchMultimodel(spot) {
  const waveParams = new URLSearchParams({
    latitude: spot.lat.toString(),
    longitude: spot.lon.toString(),
    hourly: HEALTH_FAMILIES.wave.baseKey,
    models: HEALTH_FAMILIES.wave.models.join(','),
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });
  const windParams = new URLSearchParams({
    latitude: spot.lat.toString(),
    longitude: spot.lon.toString(),
    hourly: `${HEALTH_FAMILIES.wind.baseKey},wind_direction_10m,wind_gusts_10m`,
    models: HEALTH_FAMILIES.wind.models.join(','),
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });

  const [wave, wind] = await Promise.all([
    fetch(`${MARINE_API}?${waveParams}`).then(async (r) => {
      if (!r.ok) throw new Error(`marine HTTP ${r.status}`);
      return r.json();
    }),
    fetch(`${WEATHER_API}?${windParams}`).then(async (r) => {
      if (!r.ok) throw new Error(`weather HTTP ${r.status}`);
      return r.json();
    }),
  ]);
  return { wave, wind };
}

function printFamily(label, counts) {
  console.log(`\n${label}`);
  for (const [model, c] of Object.entries(counts)) {
    const pct = c.total > 0 ? `${(100 * c.ok / c.total).toFixed(0)}%` : 'n/a';
    const status = c.status === 'dead'
      ? '🚨 MORTO (só null)'
      : c.total === 0
        ? '—'
        : 'ok';
    console.log(
      `  ${model.padEnd(20)} ok ${String(c.ok).padStart(4)}/${String(c.total).padStart(4)} (${pct.padStart(4)}) ${c.absentCount > 0 ? `· key ausente ×${c.absentCount}` : ''} ${status}`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const spotArg = (() => {
    const i = args.indexOf('--spot');
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })();
  const wantNotify = args.includes('--notify');

  const allSpots = parseSpotsFromFile();
  const target = spotArg ? allSpots.find((s) => s.id === spotArg) : allSpots[0];
  if (!target) {
    console.error(`❌ Spot "${spotArg}" não encontrado.`);
    process.exit(1);
  }

  console.log(`🔍 Open-Meteo model health — probing ${target.id} (${target.lat}, ${target.lon})\n`);
  const { wave, wind } = await fetchMultimodel(target);

  const waveCounts = countModelSlots(wave.hourly, HEALTH_FAMILIES.wave.baseKey, HEALTH_FAMILIES.wave.models);
  const windCounts = countModelSlots(wind.hourly, HEALTH_FAMILIES.wind.baseKey, HEALTH_FAMILIES.wind.models);
  const classified = {
    wave: classifyModelCounts(waveCounts),
    wind: classifyModelCounts(windCounts),
  };

  printFamily('🌊 ONDAS (wave_height)', classified.wave);
  printFamily('💨 VENTO (wind_speed_10m)', classified.wind);

  const report = buildHealthReport({ waveCounts, windCounts, sampledSpots: 1 });
  const dead = report.dead;

  console.log('');
  if (dead.length === 0) {
    console.log('✅ Todos os modelos configurados devolvem dados.');
    process.exitCode = 0;
    return;
  }
  console.error(`🚨 ${dead.length} modelo(s) morto(s): ${dead.map((d) => `${d.family}/${d.model}`).join(', ')}`);
  console.error('   Remove o modelo de scripts/lib/forecastConfidence.js (WAVE_MODELS/WIND_MODELS)');
  console.error('   ou investiga na Open-Meteo. Ver public/data/model-health.json nos runs full.');

  if (wantNotify) {
    const res = await notifyDeadModels(report);
    console.log(res.notified
      ? `   ✅ Telegram enviado (${res.newlyDead.map((d) => d.model).join(', ')})`
      : `   ℹ️ Telegram: ${res.reason}`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('❌ Falha no probe:', err.message || err);
  process.exitCode = 1;
});
