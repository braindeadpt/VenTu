import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  rawToScoreInput,
  resolveScoreWaveCorrection,
  resolveScoreWaveSource,
  resolveScoreWindCorrection,
  resolveScoreWindSource,
} from '../../../src/lib/scoreConditions';

/**
 * merge-observations vs waveBias: o merge escreve só os campos observed*
 * (observed / observedWave / observedWaveAlt / observedWaveMeta) e NUNCA deve
 * mexer no waveBias/waveHeightRaw/waveHeight que o update-conditions escreveu
 * na row (correcção regional opt-in VENTU_WAVE_BIAS_CORRECTION=1).
 *
 * O teste corre o mergeObservations REAL contra ficheiros temporários (paths
 * env-overridable, padrão do fetch-wave-bias) com o fetch global offline:
 *   - IPMA/Ecowitt/METAR falham → sem observed de vento (irrelevante);
 *   - ih-buoys.json injeta uma leitura fresca (ou stale) para o spot;
 *   - a row entra com waveBias + waveHeightRaw + waveHeight corrigido.
 *
 * Invariantes verificadas com a row PÓS-merge:
 *   1. waveBias / waveHeightRaw / waveHeight sobrevivem intactos;
 *   2. o observedWave fresco é anexado e, no score, ganha ao viés
 *      (resolveScoreWaveSource = 'observed', altura = medida) — mas o meta
 *      waveBias continua na row (transparência preservada).
 */

const SCRIPT_PATH = path.join(__dirname, '../../merge-observations.mjs');
const ENV_KEYS = [
  'CONDITIONS_PATH',
  'IPMA_STATION_MAP_PATH',
  'SPOTS_PATH',
  'IH_BUOYS_PATH',
  'WMO_BUOYS_PATH',
  'FORECAST_SKILL_PATH',
  'BUOY_COHERENCE_PATH',
  'BUOY_COHERENCE_DAILY_PATH',
  'WIND_BIAS_PATH',
  'PIPELINE_META_ROOT',
];

let tmpDir;
let envBackup = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-wavebias-'));
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

/** Recarrega o merge-observations com o env pretendido (lê o env no import). */
async function loadMerge(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  return import(pathToFileURL(SCRIPT_PATH).href);
}

/**
 * Monta o cenário: conditions.json (row com waveBias), station map vazio e
 * ih-buoys.json com leitura para o spot `guincho` (ou stale quando pedido).
 */
function setupFiles({ fresh = true } = {}) {
  const conditionsPath = tmpFile('conditions.json');
  const mapPath = tmpFile('ipma-station-map.json');
  const ihBuoysPath = tmpFile('ih-buoys.json');

  const row = {
    waveHeight: 1.5, // previsão corrigida pelo viés (update-conditions)
    waveHeightRaw: 1.1,
    waveBias: { region: 'Cascais', me: 0.4, n: 120, deltaM: 0.4 },
    wavePeriod: 8,
    waveDirection: 300,
    windSpeed: 6,
    windDirection: 320,
    windGust: 9,
    waterTemp: 17,
  };
  fs.writeFileSync(conditionsPath, JSON.stringify({ guincho: row }, null, 2));
  fs.writeFileSync(mapPath, JSON.stringify({}));

  const observedAt = fresh
    ? new Date().toISOString()
    : new Date(Date.now() - 5 * 3_600_000).toISOString(); // 5h → fora do gate de 3h
  fs.writeFileSync(
    ihBuoysPath,
    JSON.stringify({
      hasWaveData: true,
      day: '2026-08-15',
      stations: {
        '19': {
          idEst: 19,
          name: 'CSA92/D',
          area: 'Leixões',
          latest: { date: observedAt, hm0: 2.4, tp: 11, thtp: 280 },
        },
      },
      spotMapping: { guincho: { idEst: 19, distanceKm: 60 } },
    }),
  );

  return { conditionsPath, mapPath, ihBuoysPath, row };
}

/**
 * Escreve um wave-bias.json + forecast-skill.json (vazios/sem dados) para o
 * scenario de gate. O merge lê forecast-skill só para anexar skill; vazio ok.
 */
function writeCoherenceFile(p, pairs) {
  fs.writeFileSync(p, JSON.stringify({ day: '2026-08-14', pairs }, null, 2));
}

/**
 * wmo-buoys.json com uma boia ES (Cabo Silleiro, 6200084) mapeada para o
 * spot guincho — a rota cross-border (Copernicus WMO, sem key).
 */
function setupWmoEs(spotId = 'guincho') {
  const wmoBuoysPath = tmpFile('wmo-buoys.json');
  const now = new Date().toISOString();
  fs.writeFileSync(
    wmoBuoysPath,
    JSON.stringify(
      {
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': {
            name: 'Cabo Silleiro',
            area: 'Galiza',
            latest: { date: now, hs: 2.8, tp: 12, dir: 300 },
          },
        },
        spotMapping: { [spotId]: { code: '6200084', distanceKm: 40 } },
      },
      null,
      2,
    ),
  );
  return wmoBuoysPath;
}

/** Env comum: tudo para ficheiros temporários, fetch offline (sem rede). */
function testEnv(conditionsPath, mapPath, ihBuoysPath, overrides = {}) {
  return {
    CONDITIONS_PATH: conditionsPath,
    IPMA_STATION_MAP_PATH: mapPath,
    IH_BUOYS_PATH: ihBuoysPath,
    // Sem ficheiros reais por omissão: WMO/skill/coherence → camadas saltadas.
    WMO_BUOYS_PATH: tmpFile('wmo-missing.json'),
    FORECAST_SKILL_PATH: tmpFile('skill-missing.json'),
    BUOY_COHERENCE_PATH: tmpFile('coherence-missing.json'),
    BUOY_COHERENCE_DAILY_PATH: tmpFile('coherence-daily-missing.json'),
    WIND_BIAS_PATH: tmpFile('wind-bias.json'),
    PIPELINE_META_ROOT: tmpDir,
    SPOTS_PATH: null, // usar o spots.ts real (só leitura)
    ...overrides,
  };
}

/** Hora actual em Europe/Lisbon como chave IPMA ("YYYY-MM-DDThh:00"). */
function lisbonHourKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const pick = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:00`;
}

/** Pré-semeia o arquivo wind-bias com pares históricos (mesma estação+spot). */
function seedWindBiasArchive(pathToFile, stationKey, spotId, nPairs) {
  const archive = {
    fetchedAt: null,
    pairs: [],
    stations: {},
    pairCount: 0,
    lastPairs: [],
  };
  const now = Date.now();
  for (let i = 1; i <= nPairs; i++) {
    const t = new Date(now - i * 3_600_000);
    archive.pairs.push({
      stationKey,
      spotId,
      hourKey: t.toISOString().slice(0, 13),
      observedAt: t.toISOString(),
      observedKt: 10,
      forecastKt: 12,
      source: 'ipma',
      stationName: 'Cascais',
    });
  }
  fs.writeFileSync(pathToFile, `${JSON.stringify(archive, null, 2)}\n`, 'utf-8');
}

describe('merge-observations preserva o waveBias da row', () => {
  it('observedWave fresco é anexado, ganha ao viés no score, e o meta waveBias fica na row', async () => {
    const { conditionsPath, mapPath, ihBuoysPath, row } = setupFiles({ fresh: true });
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(testEnv(conditionsPath, mapPath, ihBuoysPath));
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;

    // 1. A meta do viés aplicado pelo update-conditions sobrevive intacta.
    expect(out.waveBias).toEqual(row.waveBias);
    expect(out.waveHeightRaw).toBe(1.1);
    expect(out.waveHeight).toBe(1.5); // o merge NÃO escreve a medida em waveHeight

    // 2. A leitura fresca da boia é anexada no campo próprio.
    expect(out.observedWave).toMatchObject({
      source: 'ih-buoy',
      waveHeight: 2.4,
      stationName: 'CSA92/D',
      distanceKm: 60,
    });
    expect(out.observedWaveMeta).toMatchObject({ winner: 'ih', reason: 'ih-only' });

    // 3. Tempo de score: a medida fresca ganha ao viés — mas o meta fica na row.
    expect(resolveScoreWaveSource(out)).toBe('observed');
    expect(rawToScoreInput(out).waveHeight).toBe(2.4);
    const corr = resolveScoreWaveCorrection(out);
    expect(corr).toMatchObject({ source: 'observed', buoyName: 'CSA92/D' });
    // A meta waveBias permanece na row mesmo quando o score usa a medida.
    expect(out.waveBias).toEqual(row.waveBias);
  });

  it('sem leitura fresca: o merge deixa o waveBias intacto e o score fica bias-corrected', async () => {
    const { conditionsPath, mapPath, ihBuoysPath, row } = setupFiles({ fresh: false });
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(testEnv(conditionsPath, mapPath, ihBuoysPath));
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;

    // Sem observedWave (leitura stale) — os campos observed* são limpos…
    expect(out.observedWave).toBeUndefined();
    expect(out.observedWaveMeta).toBeUndefined();
    // …mas a correcção regional (waveBias/waveHeightRaw/waveHeight) fica.
    expect(out.waveBias).toEqual(row.waveBias);
    expect(out.waveHeightRaw).toBe(1.1);
    expect(out.waveHeight).toBe(1.5);
    // Sem observação fresca não há windBias anexado.
    expect(out.windBias).toBeUndefined();

    // Score: sem leitura fresca, o viés regional continua a ser a fonte.
    expect(resolveScoreWaveSource(out)).toBe('bias-corrected');
    expect(resolveScoreWaveCorrection(out)).toMatchObject({
      source: 'bias-corrected',
      me: 0.4,
      n: 120,
      deltaM: 0.4,
    });
  });

  it('com observação IPMA fresca: acumula o par de vento e anexa o windBias da estação', async () => {
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: false });

    // O spot guincho é servido pela estação IPMA Cascais (id 1210881), a ≤30 km.
    fs.writeFileSync(
      mapPath,
      JSON.stringify({
        guincho: { idEstacao: 1210881, stationName: 'Cascais', distanceKm: 5 },
      }),
    );
    // Pré-semeia 9 pares históricos da mesma estação+spot (n=10 no total com o
    // par do run) — o viés só é anexado quando n ≥ MIN_PAIRS (10).
    const windBiasPath = tmpFile('wind-bias.json');
    seedWindBiasArchive(windBiasPath, 'ipma|Cascais', 'guincho', 9);

    // IPMA mockado: observação fresca (intensidadeVento 5 m/s → 10 kt) para a
    // hora actual em Lisboa; o resto das fontes falha (offline, como os outros).
    const ipmaObs = {
      [lisbonHourKey()]: {
        1210881: { intensidadeVento: 5, idDireccVento: 5, temperatura: 19 },
      },
    };
    vi.stubGlobal('fetch', (url) => {
      if (String(url).includes('observations.json')) {
        return Promise.resolve({ ok: true, json: async () => ipmaObs });
      }
      return Promise.reject(new Error('offline'));
    });

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;

    // A observação IPMA foi anexada (fresca) e o viés da estação idem.
    expect(out.observed).toMatchObject({ source: 'ipma', stationName: 'Cascais', windSpeedKt: 10 });
    // Forecast da row: windSpeed 6 m/s → 12 kt; observado 10 kt → ME −2 (n=10).
    expect(out.windBias).toMatchObject({
      station: 'Cascais',
      source: 'ipma',
      me: -2,
      mae: 2,
      rmse: 2,
      n: 10,
    });

    // O arquivo foi escrito com o par novo (10 pares totais).
    const archive = JSON.parse(fs.readFileSync(windBiasPath, 'utf-8'));
    expect(archive.pairs).toHaveLength(10);

    // O score usa o vento observado e o badge expõe o viés.
    expect(resolveScoreWindSource(out)).toBe('observed');
    expect(resolveScoreWindCorrection(out)).toMatchObject({
      station: 'Cascais',
      source: 'ipma',
      me: -2,
      n: 10,
    });
  });

  it('recusa anexar a boia ES ao observedWaveAlt quando o par ES×PT está incoherent', async () => {
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: true });
    const wmoBuoysPath = setupWmoEs('guincho'); // Silleiro 6200084, fresca
    // Par ES×PT marcado incoherent no buoy-coherence.json (passo anterior).
    const coherencePath = tmpFile('coherence.json');
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084'], verdict: 'incoherent' },
    ]);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;
    // O IH (19, fresca) é o vencedor; a ES incoherent NÃO entra como alt.
    expect(out.observedWave).toMatchObject({ source: 'ih-buoy' });
    expect(out.observedWaveAlt).toBeUndefined();
    // A row expõe a recusa por coerência (aviso junto do card na UI).
    expect(out.observedWaveCoherenceRefused).toEqual({
      esCode: '6200084',
      day: '2026-08-14',
    });
  });

  it('anexa a boia ES ao observedWaveAlt quando o par ES×PT está coherent', async () => {
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: true });
    const wmoBuoysPath = setupWmoEs('guincho');
    const coherencePath = tmpFile('coherence.json');
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084'], verdict: 'coherent' },
    ]);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;
    expect(out.observedWave).toMatchObject({ source: 'ih-buoy' });
    expect(out.observedWaveAlt).toMatchObject({ source: 'wmo-buoy', stationName: 'Cabo Silleiro' });
    // Coherent → sem recusa: o campo é removido da row.
    expect(out.observedWaveCoherenceRefused).toBeUndefined();

    // Fluxo completo da auditoria por região (passo `obs:update`): o merge
    // escreve o bloco `regions` no buoy-coherence.json. Aqui a IH (60 km) vence
    // mas a alt WMO (40 km) é mais próxima → a região fica marcada com a
    // anomalia attachedNotClosest e o detalhe em notClosest.
    const report = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
    expect(report.regionsAuditedAt).toBeTruthy();
    const regions = Object.values(report.regions ?? {});
    expect(regions.length).toBeGreaterThan(0);
    const anomalous = regions.find((r) => r.attachedNotClosest > 0);
    expect(anomalous).toBeDefined();
    const anomaly = anomalous.notClosest[0];
    expect(anomaly).toMatchObject({
      spot: 'guincho',
      winner: 'ih-buoy',
      attachedKm: 60,
      altKm: 40,
    });    expect(anomaly.attachedKm).toBeGreaterThan(anomaly.altKm);
  });

  it('IH stale + ES fresca + par coherent → WMO-only com calibração ES→PT aplicada no merge', async () => {
    // Caminho hermético da calibração cross-border DENTRO do merge: o IH está
    // stale (fresco=false → fora do gate de 3h), a boia ES (Silleiro) está
    // fresca e vence (WMO-only), mas o seu viés sistemático vs a referência PT
    // (Par ES×PT coherent no buoy-coherence.json com ME) recalibra a altura
    // para o campo local — `calibrated = raw + ME`, com o payload a expor a
    // correcção de forma transparente (calibration:{me,n,from,rawHeight,deltaM}).
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: false });
    // WMO-buoys com a ES (6200084) + uma PT de referência (6201077) mapeada,
    // para o nearestPtRefCode resolver o par ES×PT da calibração.
    const wmoBuoysPath = tmpFile('wmo-buoys-es-pt.json');
    const now = new Date().toISOString();
    fs.writeFileSync(
      wmoBuoysPath,
      JSON.stringify({
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': { name: 'Cabo Silleiro', area: 'Galiza', country: 'ES', lat: 42.1, lon: -9.4, latest: { date: now, hs: 2.8, tp: 12, dir: 300 } },
          '6201077': { name: 'Porto', area: 'Leixões', country: 'PT', lat: 41.1, lon: -8.9, latest: { date: now, hs: 2.4, tp: 11, dir: 290 } },
        },
        spotMapping: { guincho: { code: '6200084', distanceKm: 40 } },
      }),
    );
    const coherencePath = tmpFile('coherence.json');
    // Par ES×PT coherent e com amostra suficiente (n≥3) + ME → a calibração é
    // aplicada: a altura do Silleiro aproxima-se da referência PT.
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084', '6201077'], verdict: 'coherent', n: 5, meanDeltaM: -0.9, pair: 'Cabo Silleiro × Porto' },
    ]);
    // Auditoria de par subóptimo: junta ao ih-buoys.json uma estação IH PT
    // (Sines, idEst 4) MAIS PRÓXIMA do Guincho do que a ref WMO Porto 6201077
    // (~270 km vs ~130 km). A calibração só pode usar a WMO-PT (o único par de
    // coerência ES×PT), logo o par escolhido fica marcado subóptimo na região.
    const ihRaw = JSON.parse(fs.readFileSync(ihBuoysPath, 'utf-8'));
    ihRaw.stations['4'] = {
      idEst: 4,
      name: 'Sines',
      area: 'Alentejo',
      lat: 37.95,
      lon: -8.87,
      latest: { date: new Date(Date.now() - 5 * 3_600_000).toISOString(), hm0: 2.1, tp: 10 },
    };
    fs.writeFileSync(ihBuoysPath, JSON.stringify(ihRaw));
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;
    // Sem IH fresca → a ES vence em WMO-only (fallback Copernicus).
    expect(out.observedWave).toMatchObject({ source: 'wmo-buoy' });
    // A calibração ES→PT foi aplicada pelo merge: 2.8 + (−0.9) = 1.9 m.
    expect(out.observedWave.waveHeight).toBe(1.9);
    expect(out.observedWave.calibration).toEqual({
      me: -0.9,
      n: 5,
      verdict: 'coherent',
      from: 'Cabo Silleiro × Porto',
      rawHeight: 2.8,
      deltaM: -0.9,
    });

    // Auditoria no bloco `regions` do buoy-coherence.json: a referência PT
    // escolhida (6201077 Porto, a mais próxima do spot) fica registada com o
    // par e o ME/n que recalibraram a leitura — para auditar que a calibração
    // escolheu o par certo (e não outro).
    const report = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
    const regions = Object.values(report.regions ?? {});
    const calibratedRegion = regions.find((r) => r.calibrated > 0);
    expect(calibratedRegion).toBeDefined();
    expect(calibratedRegion.calibrated).toBe(1);
    const ref = calibratedRegion.calibrationRefs['6200084→6201077'];
    expect(ref).toMatchObject({
      esCode: '6200084',
      esName: 'Cabo Silleiro',
      ptRefCode: '6201077',
      ptRefName: 'Porto',
      ptRefArea: 'Leixões',
      pair: 'Cabo Silleiro × Porto',
      me: -0.9,
      n: 5,
    });
    expect(ref.spots).toContain('guincho');
    // Par subóptimo: a ref escolhida (6201077 Porto) não é a boia PT mais
    // próxima do Guincho — a estação IH Sines (4) está a ~130 km vs ~270 km.
    expect(calibratedRegion.suboptimalRefs).toBe(1);
    expect(calibratedRegion.suboptimal[0]).toMatchObject({
      spot: 'guincho',
      esCode: '6200084',
      ptRefCode: '6201077',
      nearestPtCode: '4',
      nearestPtName: 'Sines',
    });
    // A distância da ref registada é a real (haversine Guincho→Porto).
    expect(calibratedRegion.suboptimal[0].ptRefKm).toBeGreaterThan(250);
    expect(calibratedRegion.suboptimal[0].nearestPtKm).toBeLessThan(150);
  });

  it('IH stable + ES fresca + par incoherent → WMO recusada, sem calibração', async () => {
    // O par ES×PT incoherent bloqueia a ES (não é anexada) para além de
    // impedir qualquer calibração — o observedWave fica sem leitura (sem IH).
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: false });
    const wmoBuoysPath = tmpFile('wmo-buoys-es-pt.json');
    const now = new Date().toISOString();
    fs.writeFileSync(
      wmoBuoysPath,
      JSON.stringify({
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': { name: 'Cabo Silleiro', area: 'Galiza', country: 'ES', lat: 42.1, lon: -9.4, latest: { date: now, hs: 2.8 } },
        },
        spotMapping: { guincho: { code: '6200084', distanceKm: 40 } },
      }),
    );
    const coherencePath = tmpFile('coherence.json');
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084'], verdict: 'incoherent' },
    ]);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;
    expect(out.observedWave).toBeUndefined();
  });

  it('recusa a boia ES em observedWave quando não há IH e o par está incoherent', async () => {
    // Sem mapeamento IH (só ES disponível) → se o par estiver incoherent, até
    // o observedWave fica sem leitura — a ES não é anexada de todo.
    const { conditionsPath, mapPath } = setupFiles({ fresh: true });
    const ihBuoysPathEmpty = tmpFile('ih-buoys-empty.json');
    fs.writeFileSync(
      ihBuoysPathEmpty,
      JSON.stringify({ hasWaveData: true, day: '2026-08-15', stations: {}, spotMapping: {} }),
    );
    const wmoBuoysPath = setupWmoEs('guincho');
    const coherencePath = tmpFile('coherence.json');
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084'], verdict: 'incoherent' },
    ]);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPathEmpty, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;
    expect(out.observedWave).toBeUndefined();
    expect(out.observedWaveMeta).toBeUndefined();
    // Sem wave, a recusa ainda é registada → a UI avisa mesmo sem card.
    expect(out.observedWaveCoherenceRefused).toEqual({
      esCode: '6200084',
      day: '2026-08-14',
    });
  });

  it('anexa observedWaveCoherenceWarning quando o par ES×PT persiste incoherent por N dias', async () => {
    // IH fresca serve o spot; WMO com ES + PT referência; arquivo diário marca
    // o par incoherent por 3+ dias consecutivos → a leitura nacional (IH) perde
    // confiança (aviso na UI), sem bloquear a leitura IH (é primária).
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: true });
    const wmoBuoysPath = tmpFile('wmo-buoys-es-pt.json');
    const now = new Date().toISOString();
    fs.writeFileSync(
      wmoBuoysPath,
      JSON.stringify({
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': { name: 'Cabo Silleiro', area: 'Galiza', country: 'ES', lat: 42.1, lon: -9.4, latest: { date: now, hs: 2.8 } },
          '6201077': { name: 'Porto', area: 'Leixões', country: 'PT', lat: 41.1, lon: -8.9, latest: { date: now, hs: 2.4 } },
        },
        spotMapping: { guincho: { code: '6200084', distanceKm: 40 } },
      }),
    );
    const dailyPath = tmpFile('buoy-coherence-daily.json');
    const incoherentPair = (day) => ({
      day,
      pairs: [{ codes: ['6200084', '6201077'], verdict: 'incoherent', n: 4 }],
    });
    fs.writeFileSync(dailyPath, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      windowDays: 180,
      days: [incoherentPair('2026-08-12'), incoherentPair('2026-08-13'), incoherentPair('2026-08-14')],
    }));
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_DAILY_PATH: dailyPath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    const out = merged.guincho;
    // IH é primária e continua anexada (não bloqueada).
    expect(out.observedWave).toMatchObject({ source: 'ih-buoy' });
    // Aviso de confiança baixa com os dias consecutivos e o intervalo.
    expect(out.observedWaveCoherenceWarning).toEqual({
      esCode: '6200084',
      ptRefCode: '6201077',
      days: 3,
      firstDay: '2026-08-12',
      lastDay: '2026-08-14',
    });
  });

  it('remove observedWaveCoherenceWarning quando o par não persiste incoherent dias suficientes', async () => {
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: true });
    const wmoBuoysPath = tmpFile('wmo-buoys-es-pt.json');
    const now = new Date().toISOString();
    fs.writeFileSync(
      wmoBuoysPath,
      JSON.stringify({
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': { name: 'Cabo Silleiro', area: 'Galiza', country: 'ES', lat: 42.1, lon: -9.4, latest: { date: now, hs: 2.8 } },
          '6201077': { name: 'Porto', area: 'Leixões', country: 'PT', lat: 41.1, lon: -8.9, latest: { date: now, hs: 2.4 } },
        },
        spotMapping: { guincho: { code: '6200084', distanceKm: 40 } },
      }),
    );
    const dailyPath = tmpFile('buoy-coherence-daily.json');
    // Apenas 1 dia incoherent (< MIN_CONSECUTIVE_INCOHERENT_DAYS=3).
    fs.writeFileSync(dailyPath, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      windowDays: 180,
      days: [{ day: '2026-08-14', pairs: [{ codes: ['6200084', '6201077'], verdict: 'incoherent', n: 4 }] }],
    }));
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_DAILY_PATH: dailyPath,
      }),
    );
    await mergeObservations();

    const merged = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
    expect(merged.guincho.observedWaveCoherenceWarning).toBeUndefined();
  });

  it('acumula o histórico de recusas (gateHistory) no buoy-coherence.json por boia ES', async () => {
    // Duas boias ES mapeadas para spots distintos recusadas no mesmo run → o
    // merge regista o dia, os spots e a razão no report.gateHistory, dedup por
    // dia (mesmo boia re-corrida) e acumulação por código.
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: true });
    // Só o guincho tem IH; preciso de 2 spots mapeados a ES... guincho é o único
    // spot do fixture, por isso testo com 1 ES recusada + outra sem recusa nelas.
    const wmoBuoysPath = tmpFile('wmo-buoys-es-pt.json');
    const now = new Date().toISOString();
    fs.writeFileSync(
      wmoBuoysPath,
      JSON.stringify({
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': { name: 'Cabo Silleiro', area: 'Galiza', country: 'ES', lat: 42.1, lon: -9.4, latest: { date: now, hs: 2.8 } },
          '6201077': { name: 'Porto', area: 'Leixões', country: 'PT', lat: 41.1, lon: -8.9, latest: { date: now, hs: 2.4 } },
        },
        spotMapping: { guincho: { code: '6200084', distanceKm: 40 } },
      }),
    );
    const coherencePath = tmpFile('coherence.json');
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084', '6201077'], verdict: 'incoherent', pair: 'Cabo Silleiro × Porto' },
    ]);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const report = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
    expect(report.gateHistory).toBeDefined();
    const r = report.gateHistory.byCode['6200084'];
    expect(r).toBeDefined();
    expect(r.name).toBe('Cabo Silleiro');
    expect(r.dayCount).toBe(1);
    expect(r.totalSpots).toBe(1); // 1 spot (guincho) recusado
    expect(r.events[0].day).toBe('2026-08-14');
    expect(r.events[0].reason).toContain('Cabo Silleiro × Porto');

    // Segundo run (mesmo dia) → dedup: dayCount mantém-se, spots sobrescrito,
    // não duplica o dia.
    const { mergeObservations: merge2 } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await merge2();
    const report2 = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
    expect(report2.gateHistory.byCode['6200084'].dayCount).toBe(1);
    expect(report2.gateHistory.byCode['6200084'].totalSpots).toBe(1);
  }, 10_000);

  it('gera gateHistory vazio quando não há refusas (report preservado, sem bloco inventado)', async () => {
    const { conditionsPath, mapPath, ihBuoysPath } = setupFiles({ fresh: true });
    const wmoBuoysPath = tmpFile('wmo-buoys-es-pt.json');
    const now = new Date().toISOString();
    fs.writeFileSync(
      wmoBuoysPath,
      JSON.stringify({
        hasWaveData: true,
        day: '2026-08-15',
        buoys: {
          '6200084': { name: 'Cabo Silleiro', area: 'Galiza', country: 'ES', lat: 42.1, lon: -9.4, latest: { date: now, hs: 2.8 } },
          '6201077': { name: 'Porto', area: 'Leixões', country: 'PT', lat: 41.1, lon: -8.9, latest: { date: now, hs: 2.4 } },
        },
        spotMapping: { guincho: { code: '6200084', distanceKm: 40 } },
      }),
    );
    const coherencePath = tmpFile('coherence.json');
    writeCoherenceFile(coherencePath, [
      { codes: ['6200084', '6201077'], verdict: 'coherent', pair: 'Cabo Silleiro × Porto' },
    ]);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    const { mergeObservations } = await loadMerge(
      testEnv(conditionsPath, mapPath, ihBuoysPath, {
        WMO_BUOYS_PATH: wmoBuoysPath,
        BUOY_COHERENCE_PATH: coherencePath,
      }),
    );
    await mergeObservations();

    const report = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
    expect(report.gateHistory).toBeUndefined();
  });
});
