/**
 * End-to-end (script-level) validation of the IH_API_KEY chain for the Fugro
 * Wavescan Nazaré Costeira buoy (id_est 2, CSA88/2, WMO 6200199).
 *
 * What a real key unlocks: getDatawellData returns wave rows for station 2 →
 * fetch-ih-buoys.js bakes `latest` into ih-buoys.json → merge-observations
 * attaches observedWave to the 36 spots mapped to that buoy. Here the same
 * chain is exercised hermetically: the ih-buoys.json fixture carries a fresh
 * `latest` for station 2 (exactly what the keyed API would have produced),
 * and the merge must attach it to the `nazare` spot.
 *
 * This is the verification step for docs/IH_API_KEY.md ("Verificar a família
 * Fugro Wavescan") — runnable without the key, covering the path that the
 * real key will take in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

const MODULE_PATH = '../../merge-observations.mjs';

const NAZARE_LAT = 39.6005;
const NAZARE_LON = -9.0683;

describe('observedWave da Nazaré Costeira (Fugro id_est 2) — ponta a ponta', () => {
  let tmpDir;

  function loadModule() {
    // ESM cache do vitest: resetModules() força a reavaliação do módulo, para
    // o env (CONDITIONS_PATH etc., lido em load time) ser re-lido por teste.
    vi.resetModules();
    return import(MODULE_PATH);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nazare-e2e-'));
    // Apanha o fetch global real usado pelos fetches de observações — este
    // teste falha-os de propósito (o merge tolera com try/catch e segue).
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('observations network disabled in this test');
    }));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    delete process.env.IH_BUOYS_PATH;
    delete process.env.WMO_BUOYS_PATH;
    delete process.env.CONDITIONS_PATH;
    delete process.env.IPMA_STATION_MAP_PATH;
    delete process.env.SPOTS_PATH;
    delete process.env.FORECAST_SKILL_PATH;
    delete process.env.BUOY_COHERENCE_PATH;
    delete process.env.WIND_BIAS_PATH;
    delete process.env.PIPELINE_META_ROOT;
  });

  /** conditions.json mínimo por spot (o merge só precisa das rows + windSpeed). */
  function writeConditions() {
    const conditions = {
      nazare: { windSpeed: 5.2, waveHeight: 1.2 },
      leirosa: { windSpeed: 4.1, waveHeight: 0.9 },
    };
    fs.writeFileSync(path.join(tmpDir, 'conditions.json'), JSON.stringify(conditions));
  }

  /** ipma-station-map.json vazio — sem observações de vento, sem pressa. */
  function writeStationMap() {
    fs.writeFileSync(path.join(tmpDir, 'ipma-station-map.json'), JSON.stringify({}));
  }

  /**
   * ih-buoys.json fixture = o que fetch-ih-buoys.js escreve COM a key:
   * estação 2 (Fugro Nazaré, activa) com `latest` fresco (o que a
   * getDatawellData devolveria) + spotMapping nazare → idEst 2.
   */
  function writeIhBuoysWithNazare({ fresh = true } = {}) {
    const iso = fresh ? new Date().toISOString() : new Date(Date.now() - 5 * 3_600_000).toISOString();
    const ih = {
      stations: {
        2: {
          idEst: 2,
          name: 'CSA88/2',
          area: 'Boia Nazaré Costeira',
          wmoId: 6200199,
          status: 'active',
          nrt: 'near-real-time data available',
          lat: 39.55,
          lon: -9.2,
          lastSea: iso,
          latest: fresh
            ? { date: iso, hm0: 2.4, tp: 13.2, thtp: 315, hmax: 3.6, temp: 18.2 }
            : undefined,
        },
      },
      spotMapping: {
        nazare: {
          idEst: 2,
          stationTitle: 'CSA88/2',
          area: 'Boia Nazaré Costeira',
          distanceKm: 12.1,
        },
      },
      fetchedAt: new Date().toISOString(),
      sourceCollections: ['buoys_datawell', 'buoys_Fugro_oceanor_wavescan'],
      apiKeyConfigured: true,
      hasWaveData: fresh,
    };
    fs.writeFileSync(path.join(tmpDir, 'ih-buoys.json'), JSON.stringify(ih));
  }

  /** wmo-buoys.json sem dados (o merge salta) — para o teste não depender dele. */
  function writeEmptyWmoBuoys() {
    fs.writeFileSync(
      path.join(tmpDir, 'wmo-buoys.json'),
      JSON.stringify({ buoys: {}, spotMapping: {}, hasWaveData: false, day: '20260815' }),
    );
  }

  async function runMerge() {
    process.env.CONDITIONS_PATH = path.join(tmpDir, 'conditions.json');
    process.env.IPMA_STATION_MAP_PATH = path.join(tmpDir, 'ipma-station-map.json');
    process.env.IH_BUOYS_PATH = path.join(tmpDir, 'ih-buoys.json');
    process.env.WMO_BUOYS_PATH = path.join(tmpDir, 'wmo-buoys.json');
    process.env.PIPELINE_META_ROOT = tmpDir;
    const mod = await loadModule();
    return mod.mergeObservations();
  }

  it('leitura fresca da Fugro Nazaré (simulando a key) → observedWave no spot nazare', async () => {
    writeConditions();
    writeStationMap();
    writeIhBuoysWithNazare({ fresh: true });
    writeEmptyWmoBuoys();

    await runMerge();

    const conditions = JSON.parse(fs.readFileSync(path.join(tmpDir, 'conditions.json'), 'utf-8'));
    const wave = conditions.nazare.observedWave;
    expect(wave).toBeTruthy();
    expect(wave).toMatchObject({
      waveHeight: 2.4,
      wavePeriod: 13.2,
      waveDirection: 315,
      maxWaveHeight: 3.6,
      waterTemp: 18.2,
      stationName: 'CSA88/2',
      stationArea: 'Boia Nazaré Costeira',
      distanceKm: 12.1,
      source: 'ih-buoy',
    });
    // Sem WMO → razão ih-only, sem alternativo.
    expect(conditions.nazare.observedWaveMeta).toMatchObject({
      winner: 'ih',
      reason: 'ih-only',
    });
    expect(conditions.nazare.observedWaveAlt).toBeUndefined();
    // Spot sem mapeamento → sem observedWave.
    expect(conditions.leirosa.observedWave).toBeUndefined();
  });

  it('leitura velha (>3h) → SEM observedWave (gate de frescura da IH)', async () => {
    writeConditions();
    writeStationMap();
    writeIhBuoysWithNazare({ fresh: false });
    writeEmptyWmoBuoys();

    await runMerge();

    const conditions = JSON.parse(fs.readFileSync(path.join(tmpDir, 'conditions.json'), 'utf-8'));
    expect(conditions.nazare.observedWave).toBeUndefined();
    expect(conditions.nazare.observedWaveMeta).toBeUndefined();
  });
});
