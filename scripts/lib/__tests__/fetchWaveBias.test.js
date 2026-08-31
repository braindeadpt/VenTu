import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * fetch-wave-bias.js end-to-end unit tests (global fetch mockado).
 *
 * O script lê o ambiente no momento do import (IH_API_KEY, OUTPUT/ARCHIVE/COHERENCE
 * paths), por isso cada teste: (1) define o env, (2) `vi.resetModules()` + `import()`
 * para recarregar com o env novo, e (3) `vi.stubGlobal('fetch', …)` para simular
 * os três endpoints sem rede:
 *   - S3 Copernicus (listagem → XML; vazio = sem ficheiros novos hoje);
 *   - Open-Meteo Historical Marine (ERA5 hourly, `{ hourly: { time, wave_height } }`);
 *   - IH OGC API (estações GeoJSON) + getDatawellData (séries hm0).
 *
 * As leituras/módulo são geradas relativas a `Date.now()` para ficarem sempre dentro
 * da janela de prune (13 dias) — o teste nunca fica stale.
 */

const SCRIPT_PATH = path.join(__dirname, '../../fetch-wave-bias.js');
const ENV_KEYS = [
  'IH_API_KEY',
  'WAVE_BIAS_OUTPUT_PATH',
  'WMO_BIAS_ARCHIVE_OUTPUT_PATH',
  'BUOY_COHERENCE_PATH',
];

let tmpDir;
let envBackup = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wavebias-test-'));
  envBackup = {};
  for (const k of ENV_KEYS) envBackup[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  vi.unstubAllGlobals();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const tmpFile = (name) => path.join(tmpDir, name);

/**
 * Série horária de leituras terminando agora (minuto :25 para provar o
 * bucketing à hora UTC do alignPairs). hm0 cresce 0.01 m/hora → correlação
 * perfeita com o modelo quando o offset é constante.
 * @param {number} count horas
 * @returns {Array<{ date: string, hm0: number }>}
 */
function makeReadingSeries(count) {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const hour = new Date(now - i * 3_600_000).toISOString().slice(0, 13);
    rows.push({ date: `${hour}:25:00.000Z`, hm0: Math.round((2 + 0.01 * i) * 100) / 100 });
  }
  return rows;
}

/**
 * Modelo ERA5 mockado alinhado às leituras: waveHeight = hm0 + offset.
 * offset = -0.4 → ME = mean(observado − modelo) = +0.4 m (MAE/RMSE 0.4, r 1).
 * @param {Array<{ date: string, hm0: number }>} readings
 * @param {number} offset
 * @returns {Map<string, number>} hora UTC ('YYYY-MM-DDTHH') → waveHeight
 */
function buildModel(readings, offset = -0.4) {
  const model = new Map();
  for (const r of readings) {
    model.set(r.date.slice(0, 13), Math.round((r.hm0 + offset) * 100) / 100);
  }
  return model;
}

/**
 * Mock do fetch global — despacha por URL:
 * - bucket S3 (listagem XML, sem keys → nenhum ficheiro novo hoje);
 * - ERA5 (`marine-api.open-meteo.com`) → série do Map;
 * - estações IH (`/collections/…`) → GeoJSON por colecção;
 * - séries de onda (`getDatawellData`) → linhas hm0.
 */
function makeFetchMock({ model = new Map(), stations = {}, waveRows = [] } = {}) {
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
    const colMatch = u.match(/collections\/([^/?]+)/);
    if (colMatch) {
      const col = colMatch[1];
      return new Response(
        JSON.stringify(
          stations[col] ?? { type: 'FeatureCollection', features: [] },
        ),
        { status: 200, headers: { 'Content-Type': 'application/geo+json' } },
      );
    }
    if (u.includes('getDatawellData')) {
      return new Response(JSON.stringify(waveRows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  };
}

/**
 * Recarrega o script com o env pretendido (o módulo lê o env no import).
 * @param {{ ihKey?: string | null, outputPath: string, archivePath: string, coherencePath?: string }} opts
 */
async function loadScript({ ihKey = null, outputPath, archivePath, coherencePath }) {
  vi.resetModules();
  if (ihKey == null) delete process.env.IH_API_KEY;
  else process.env.IH_API_KEY = ihKey;
  process.env.WAVE_BIAS_OUTPUT_PATH = outputPath;
  process.env.WMO_BIAS_ARCHIVE_OUTPUT_PATH = archivePath;
  process.env.BUOY_COHERENCE_PATH = coherencePath ?? tmpFile('coherence.json');
  const mod = await import(pathToFileURL(SCRIPT_PATH).href);
  return mod;
}

/** Arquivo ES com 36 leituras de Silleiro (amostra ≥ MIN_BIAS_N=30). */
function seedEsArchive(archivePath, readings = makeReadingSeries(36)) {
  fs.writeFileSync(
    archivePath,
    JSON.stringify({
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
    }),
  );
}

describe('fetch-wave-bias (caminho completo com fetch mockado)', () => {
  it('rota ES keyless: arquivo → ERA5 → pares → stats → regiões (NW)', async () => {
    const archivePath = tmpFile('wmo-archive.json');
    const outputPath = tmpFile('wave-bias.json');
    const coherencePath = tmpFile('coherence.json');
    const readings = makeReadingSeries(36);
    seedEsArchive(archivePath, readings);
    fs.writeFileSync(coherencePath, JSON.stringify({ day: '2026-08-14', pairs: [] }));
    vi.stubGlobal('fetch', makeFetchMock({ model: buildModel(readings, -0.4) }));

    const mod = await loadScript({ outputPath, archivePath, coherencePath }); // sem key
    const out = await mod.fetchWaveBias();

    expect(out).not.toBeNull();
    const silleiro = out.buoys['6200084'];
    expect(silleiro).toMatchObject({
      source: 'wmo-es',
      name: 'Cabo Silleiro',
      area: 'Galiza',
      n: 36,
      me: 0.4,
      mae: 0.4,
      rmse: 0.4,
      corr: 1,
    });
    // Sem gate (pairs vazio) → a boia atribui viés às regiões.
    expect(silleiro.regionAttribution).toBeUndefined();

    // Regiões do NW herdam o viés da boia mais próxima (pool por mapa spot→boia).
    for (const r of ['Caminha', 'Viana do Castelo', 'Esposende', 'Porto']) {
      expect(out.regions[r]).toMatchObject({ n: 36, me: 0.4, buoys: ['6200084'] });
    }
    // Só a rota ES — sem IH_API_KEY não entra nenhuma boia 'ih'.
    expect(Object.values(out.buoys).every((b) => b.source === 'wmo-es')).toBe(true);

    // Output escrito com o shape público (inclui a nota do modelo ERA5).
    const written = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(written.buoys['6200084'].me).toBe(0.4);
    expect(written.thresholds).toEqual({ minN: 30, minBiasM: 0.15 });
    expect(written.models.reference).toContain('ERA5');
  });

  it('rota IH com key: estações OGC → getDatawellData → ERA5 → pares → regiões', async () => {
    const archivePath = tmpFile('wmo-archive.json');
    const outputPath = tmpFile('wave-bias.json');
    const coherencePath = tmpFile('coherence.json');
    fs.writeFileSync(archivePath, JSON.stringify({ fetchedAt: null, buoys: {} }));
    fs.writeFileSync(coherencePath, JSON.stringify({ day: '2026-08-14', pairs: [] }));

    const readings = makeReadingSeries(36);
    const stations = {
      buoys_datawell: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              id_est: 4,
              name: 'Leixões',
              area: 'Porto',
              status: 'active',
              lat: 41.32,
              lon: -8.98,
            },
            geometry: { type: 'Point', coordinates: [-8.98, 41.32] },
          },
        ],
      },
      buoys_Fugro_oceanor_wavescan: { type: 'FeatureCollection', features: [] },
    };
    const waveRows = readings.map((r) => ({
      date: r.date,
      hm0: r.hm0,
      tp: 10,
      thtp: 290,
      hmax: Math.round(r.hm0 * 1.5 * 10) / 10,
      temp: 17,
    }));
    vi.stubGlobal(
      'fetch',
      makeFetchMock({ model: buildModel(readings, -0.4), stations, waveRows }),
    );

    const mod = await loadScript({
      ihKey: 'test-key',
      outputPath,
      archivePath,
      coherencePath,
    });
    const out = await mod.fetchWaveBias();

    expect(out).not.toBeNull();
    expect(out.buoys['4']).toMatchObject({
      source: 'ih',
      name: 'Leixões',
      n: 36,
      me: 0.4,
      mae: 0.4,
      rmse: 0.4,
      corr: 1,
    });
    // Leixões (41.32, -8.98) é a boia mais próxima do Porto/Esposende/etc.
    expect(out.regions['Porto']).toMatchObject({ n: 36, me: 0.4, buoys: [4] });
    expect(Object.keys(out.regions).length).toBeGreaterThan(1);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('degradação sem IH_API_KEY e sem arquivo ES → null, sem output', async () => {
    const archivePath = tmpFile('wmo-archive.json');
    const outputPath = tmpFile('wave-bias.json');
    fs.writeFileSync(archivePath, JSON.stringify({ fetchedAt: null, buoys: {} }));
    vi.stubGlobal('fetch', makeFetchMock({ model: new Map() }));

    const mod = await loadScript({ outputPath, archivePath });
    const out = await mod.fetchWaveBias();

    expect(out).toBeNull();
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('degradação sem IH_API_KEY mas com arquivo ES → só o viés ES sai (IH saltado)', async () => {
    const archivePath = tmpFile('wmo-archive.json');
    const outputPath = tmpFile('wave-bias.json');
    const coherencePath = tmpFile('coherence.json');
    const readings = makeReadingSeries(36);
    seedEsArchive(archivePath, readings);
    fs.writeFileSync(coherencePath, JSON.stringify({ day: '2026-08-14', pairs: [] }));
    vi.stubGlobal('fetch', makeFetchMock({ model: buildModel(readings, -0.4) }));

    const mod = await loadScript({ outputPath, archivePath, coherencePath }); // sem key
    const out = await mod.fetchWaveBias();

    expect(out).not.toBeNull();
    expect(Object.keys(out.buoys)).toEqual(['6200084']);
    expect(out.buoys['6200084'].source).toBe('wmo-es');
    expect(out.regions['Caminha']).toBeDefined();
    // Nenhuma boia IH — a rota keyed foi saltada graciosamente.
    expect(Object.values(out.buoys).every((b) => b.source === 'wmo-es')).toBe(true);
  });

  it('gate cross-border no caminho completo: par incoherent → sem regiões dessa boia', async () => {
    const archivePath = tmpFile('wmo-archive.json');
    const outputPath = tmpFile('wave-bias.json');
    const coherencePath = tmpFile('coherence.json');
    const readings = makeReadingSeries(36);
    seedEsArchive(archivePath, readings);
    fs.writeFileSync(
      coherencePath,
      JSON.stringify({
        day: '2026-08-14',
        pairs: [{ codes: ['6200084', '6201077'], verdict: 'incoherent' }],
      }),
    );
    vi.stubGlobal('fetch', makeFetchMock({ model: buildModel(readings, -0.4) }));

    const mod = await loadScript({ outputPath, archivePath, coherencePath });
    const out = await mod.fetchWaveBias();

    expect(out).not.toBeNull();
    expect(out.buoys['6200084'].regionAttribution).toBe(false);
    expect(out.coherenceGate).toMatchObject({
      day: '2026-08-14',
      gatedCodes: ['6200084'],
    });
    // Bias per-buoy calculado, mas nenhuma região herda o viés (mapa vazio).
    expect(Object.keys(out.regions)).toHaveLength(0);
  });
});
