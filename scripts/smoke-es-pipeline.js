#!/usr/bin/env node
/**
 * Smoke de integração (fora do vitest) — caminho ES ponta a ponta.
 *
 * Corre os DOIS scripts reais da cadeia num ciclo de 2 runs, com fixtures
 * locais (paths env-overridable) e fetch/clock herméticos — sem rede, sem
 * h5wasm, determinístico. É o "provar o caminho ES fora do vitest": invoca
 * `scripts/fetch-wave-bias.js` e `scripts/fetch-forecast-skill.js` como
 * módulos CJS reais (não funções unit testadas), contra o mesmo ficheiro de
 * arquivo partilhado, e valida o handoff entre eles:
 *
 *   Run 1 (T0=10:00Z)
 *     · fetch-wave-bias: lê wmo-bias-archive.json (Sillero semeado, 36 h),
 *       ERA5 mock (waveHeight = hm0 − 0.4) → wave-bias.json com a boia ES
 *       + regiões NW (Caminha/Viana/Esposende/Porto).
 *     · fetch-forecast-skill: arquiva o best_match do spot mais próximo
 *       (moledo → Sillero) para 13:00Z/14:00Z com runAt=T0. Sem leitura para
 *       13:00Z ainda → pairCount 0.
 *   Run 2 (T1=13:30Z)
 *     · o Copernicus "entrega" a leitura de 13:00Z (hm0 1.6) — escrita no
 *       wmo-bias-archive.json partilhado.
 *     · fetch-wave-bias: recalcula o viés ES (n inclui a leitura nova).
 *     · fetch-forecast-skill: o prognóstico de 13:00Z (runAt T0 < target)
 *       cruza com a leitura → par ES com lead real (origin 'wmo-es').
 *
 * Se alguma asserção falhar o processo sai com exit 1 (cada bloco imprime a
 * razão). Espera-se correr via `npm run smoke:es`; também é CI-safe (hermético).
 *
 * Nota sobre o tempo: os scripts usam `new Date()`/`Date.now()` em call time,
 * por isso um FakeDate controlável patcheia global.Date durante o ciclo e é
 * restaurado no finally — nada fica poluído.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const WAVE_BIAS_SCRIPT = path.join(__dirname, 'fetch-wave-bias.js');
const FORECAST_SKILL_SCRIPT = path.join(__dirname, 'fetch-forecast-skill.js');

/** Horas fixas do cenário (mesma convenção do vitest). */
const T0_MS = Date.parse('2026-08-14T10:00:00Z'); // run 1
const T1_MS = Date.parse('2026-08-14T13:30:00Z'); // run 2
const READINGS = 36; // ≥ MIN_BIAS_N=30

// ── FakeDate (relógio controlável, restaurado no fim) ─────────────────────
const RealDate = global.Date;
let fakeNow = T0_MS;
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fakeNow);
    else super(...args);
  }
  static now() {
    return fakeNow;
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────
let tmpDir;
const letters = 'abcdefghijklmnopqrstuvwxyz';
let fails = 0;

const check = (name, cond, extra = '') => {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    fails += 1;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

/** Série horária de leituras terminando em `endMs` (minuto :25). hm0 sobe 0.01 m/hora. */
function makeReadings(count, endMs) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const hour = new Date(endMs - i * 3_600_000).toISOString().slice(0, 13);
    rows.push({ date: `${hour}:25:00.000Z`, hm0: Math.round((2 + 0.01 * i) * 100) / 100 });
  }
  return rows;
}

/**
 * Modelo ERA5 mock alinhado às leituras: waveHeight = hm0 − 0.4 → ME +0.4.
 * Extra permite injetar horas fora do conjunto principal (ex. 13:00Z).
 */
function buildModel(readings, extra = []) {
  const model = new Map();
  for (const r of readings) model.set(r.date.slice(0, 13), Math.round((r.hm0 - 0.4) * 100) / 100);
  for (const r of extra) model.set(r.date.slice(0, 13), Math.round((r.hm0 - 0.4) * 100) / 100);
  return model;
}

/**
 * Mock do fetch global — despacha por URL:
 * - S3 Copernicus (listagem) → XML vazio (nenhum ficheiro novo hoje: o arquivo
 *   é semeado directamente, evitando baixar/interpretar NetCDF/h5wasm);
 * - Open-Meteo Historical Marine (ERA5) → série do Map;
 * - IH OGC API / getDatawellData → lança (sem key o fetch de ondas não deve
 *   acontecer; estações caem no arquivo via try/catch).
 */
function makeFetchMock({ model, throwOnWave = true }) {
  return async (url) => {
    const u = String(url);
    if (u.includes('mdl-native-01') || u.includes('cloudferro')) {
      return new Response(
        '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      );
    }
    if (u.includes('marine-api.open-meteo.com')) {
      const times = [...model.keys()].sort();
      return new Response(
        JSON.stringify({
          hourly: {
            time: times.map((h) => `${h}:00`),
            wave_height: times.map((h) => model.get(h)),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (throwOnWave) {
      throw new Error('offline — sem IH_API_KEY não deve fetchar ondas do IH');
    }
    return new Response('{}', { status: 404 });
  };
}

/** Escreve o wmo-bias-archive.json partilhado a partir de um vetor de leituras. */
function writeSharedArchive(readings) {
  fs.writeFileSync(
    path.join(tmpDir, 'wmo-bias-archive.json'),
    JSON.stringify(
      {
        fetchedAt: null,
        buoys: {
          '6200084': {
            code: '6200084',
            name: 'Cabo Silleiro',
            area: 'Galiza',
            lat: 42.12,
            lon: -9.43,
            readings,
          },
        },
      },
      null,
      2,
    ),
  );
}

/** Projeta um JSON lido do temp dir. */
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, name), 'utf-8'));
}

function exists(name) {
  return fs.existsSync(path.join(tmpDir, name));
}

function clearRequireCache(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

async function main() {
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-es-'));
    const readings = makeReadings(READINGS, T0_MS);
    writeSharedArchive(readings);

    // Inputs partilhados entre os dois scripts (paths env-overridable).
    fs.writeFileSync(
      path.join(tmpDir, 'forecasts.json'),
      JSON.stringify({
        moledo: [
          { time: '2026-08-14T13:00', waveHeight: 1.4 },
          { time: '2026-08-14T14:00', waveHeight: 1.5 },
        ],
      }),
    );
    fs.writeFileSync(path.join(tmpDir, 'ih-buoys.json'), JSON.stringify({ stations: {}, spotMapping: {} }));
    fs.writeFileSync(
      path.join(tmpDir, 'wmo-buoys.json'),
      JSON.stringify({
        buoys: { '6200084': { code: '6200084', name: 'Cabo Silleiro', lat: 42.12, lon: -9.43 } },
        spotMapping: { moledo: { code: '6200084', distanceKm: 59 } },
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'coherence.json'),
      JSON.stringify({ day: '2026-08-14', pairs: [] }),
    );

    // Env antes dos requires (as constantes são capturadas em load time).
    process.env.WAVE_BIAS_OUTPUT_PATH = path.join(tmpDir, 'wave-bias.json');
    process.env.WMO_BIAS_ARCHIVE_OUTPUT_PATH = path.join(tmpDir, 'wmo-bias-archive.json');
    process.env.BUOY_COHERENCE_PATH = path.join(tmpDir, 'coherence.json');
    process.env.FORECAST_SKILL_OUTPUT_PATH = path.join(tmpDir, 'forecast-skill.json');
    process.env.FORECASTS_PATH = path.join(tmpDir, 'forecasts.json');
    process.env.IH_BUOYS_PATH = path.join(tmpDir, 'ih-buoys.json');
    process.env.WMO_BIAS_ARCHIVE_PATH = path.join(tmpDir, 'wmo-bias-archive.json');
    process.env.WMO_BUOYS_PATH = path.join(tmpDir, 'wmo-buoys.json');
    process.env.IH_API_URL = 'http://mock-ih.local';
    process.env.IH_BUOY_WAVE_API_URL = 'http://mock-ih.local/wave';
    delete process.env.IH_API_KEY;

    // Patcheia o relógio e o fetch (o script lê global fetch em call time).
    global.Date = FakeDate;
    global.fetch = makeFetchMock({ model: buildModel(readings) });

    // Carrega os dois scripts reais.
    clearRequireCache(WAVE_BIAS_SCRIPT);
    clearRequireCache(FORECAST_SKILL_SCRIPT);
    const waveBias = require(WAVE_BIAS_SCRIPT);
    const forecastSkill = require(FORECAST_SKILL_SCRIPT);

    console.log('── Run 1 (T0 = 10:00 UTC) ────────────────────────────────\n');

    fakeNow = T0_MS;
    await waveBias.fetchWaveBias();
    await forecastSkill.fetchForecastSkill();

    console.log('\n── Asserções run 1 ────────────────────────────────────────');
    check('wave-bias.json escrito', exists('wave-bias.json'));
    if (exists('wave-bias.json')) {
      const wb = readJson('wave-bias.json');
      const s = wb.buoys?.['6200084'];
      check('boia ES (6200084, Sillero) no wave-bias', s?.name === 'Cabo Silleiro' && s?.source === 'wmo-es');
      check(`amostra suficiente (n=${s?.n} ≥ 30)`, s && s.n >= 30);
      check('ME = +0.4 (ERA5 subestima 0.4 m)', s && Math.abs(s.me - 0.4) < 0.15);
      for (const r of ['Caminha', 'Viana do Castelo', 'Esposende', 'Porto']) {
        check(`região NW «${r}» herda o viés ES`, wb.regions?.[r]?.n >= 30 && (wb.regions[r].buoys || []).includes('6200084'));
      }
    }
    if (exists('forecast-skill.json')) {
      const fs1 = readJson('forecast-skill.json');
      check('previsões ES arquivadas (6200084)', fs1.forecasts.some((f) => String(f.buoyId) === '6200084' && f.origin === 'wmo-es'));
      check('observações ES arquivadas (6200084)', fs1.observations.some((o) => String(o.buoyId) === '6200084'));
      check('par ainda NÃO formado (12:00Z é futuro em T0)', fs1.pairCount === 0);
      check('contadores por origem presentes (IH 0 · WMO-ES 0)', fs1.pairCountByOrigin?.ih === 0 && fs1.pairCountByOrigin?.['wmo-es'] === 0);
    }

    console.log('\n── Run 2 (T1 = 13:30 UTC) ────────────────────────────────\n');

    fakeNow = T1_MS;
    // O Copernicus "entrega" a leitura real da hora 13:00 Lisboa — o prognóstico
    // `{time:'2026-08-14T13:00'}` em forecasts.json é hora de parede Lisboa;
    // a boia serve UTC, e 13:00 Lisboa ≈ 12:00Z (verão). É esta a hora que cruza
    // com o forecast do spot (hm0 1.6 vs 1.4) no run 2.
    const deliveredReading = { date: '2026-08-14T12:00:00.000Z', hm0: 1.6 };
    const seeded = readJson('wmo-bias-archive.json').buoys['6200084'].readings;
    writeSharedArchive([...seeded, deliveredReading]);
    global.fetch = makeFetchMock({ model: buildModel(readings, [deliveredReading]) });

    await waveBias.fetchWaveBias();
    await forecastSkill.fetchForecastSkill();

    console.log('\n── Asserções run 2 ────────────────────────────────────────');
    if (exists('wave-bias.json')) {
      const wb = readJson('wave-bias.json');
      const s = wb.buoys?.['6200084'];
      check('boia ES persistente após 2º run', s?.source === 'wmo-es');
      check(`n acumulado inclui 13:00Z (n=${s?.n} ≥ 31)`, s && s.n >= READINGS);
    }
    const sk2 = exists('forecast-skill.json') ? readJson('forecast-skill.json') : null;
    check('par ES formado no run 2 (pairCount ≥ 1)', sk2 && sk2.pairCount >= 1);
    if (sk2) {
      const p = sk2.pairs.find((x) => String(x.buoyId) === '6200084');
      check('par com origem wmo-es (Sillero)', p && p.origin === 'wmo-es');
      check('par mede skill real (lead > 0)', p && p.leadTimeHours > 0);
      check(
        `par alinhado correctamente (prev 1.4 · obs 1.6 · lead 2h)`,
        p && Math.abs(p.forecastHm0 - 1.4) < 0.01 && Math.abs(p.observedHm0 - 1.6) < 0.01 && Math.abs(p.leadTimeHours - 2) < 0.5,
      );
      check('pairCountByOrigin WMO-ES ≥ 1', sk2.pairCountByOrigin?.['wmo-es'] >= 1);
      check('byOrigin WMO-ES presente com n ≥ 1', sk2.byOrigin?.['wmo-es']?.n >= 1);
    }

    console.log(`\n── ${fails === 0 ? '✅ SMOKE PASS' : `❌ SMOKE FAIL (${fails})`} ──`);
  } finally {
    global.Date = RealDate;
    global.fetch = undefined;
    for (const k of [
      'WAVE_BIAS_OUTPUT_PATH',
      'WMO_BIAS_ARCHIVE_OUTPUT_PATH',
      'BUOY_COHERENCE_PATH',
      'FORECAST_SKILL_OUTPUT_PATH',
      'FORECASTS_PATH',
      'IH_BUOYS_PATH',
      'WMO_BIAS_ARCHIVE_PATH',
      'WMO_BUOYS_PATH',
      'IH_API_URL',
      'IH_BUOY_WAVE_API_URL',
      'IH_API_KEY',
    ]) {
      delete process.env[k];
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  process.exit(fails === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Smoke falhou com exceção:', err);
    process.exit(1);
  });
}

module.exports = { main };