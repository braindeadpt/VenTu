import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  normalizeStation,
  parseWaveRow,
  pickLatestWave,
  extractWaveRows,
  waveWindow,
  isFreshObservation,
  mapSpotsToBuoys,
  observedWaveForSpot,
  fetchBuoyWave,
  buildWaveRequestUrl,
  IhAuthError,
  isIhAuthError,
  MAX_BUOY_MAP_KM,
  MAX_BUOY_ATTACH_KM,
  MAX_OBS_AGE_HOURS,
  MAX_PLAUSIBLE_HM0_M,
  isPlausibleHm0,
} = require('../ihBuoys.js');

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.parse('2026-08-14T14:00:00Z');

describe('normalizeStation', () => {
  it('normaliza o schema OGC (name/nrt) com coordenadas na geometry', () => {
    const st = normalizeStation({
      properties: {
        id_est: 4,
        name: 'CSA92/D',
        area: 'Leixões',
        wmo_id: 6201077,
        depth: 81,
        status: 'active',
        nrt: 'near-real-time data available',
        last_pos: '2026-08-14T08:32:15+00:00',
        last_sea: '2026-08-14T13:32:15+00:00',
      },
      geometry: { type: 'Point', coordinates: [-8.9825, 41.3156] },
    });
    expect(st).toMatchObject({
      idEst: 4,
      name: 'CSA92/D',
      area: 'Leixões',
      wmoId: 6201077,
      depth: 81,
      lat: 41.3156,
      lon: -8.9825,
    });
  });

  it('aceita o schema WFS antigo (nome/nrtd) e lat/lon nas properties', () => {
    const st = normalizeStation({
      properties: { id_est: 19, nome: 'CSA83/1D', area: 'Sines', nrtd: 'nrt', lat: 37.9, lon: -8.93 },
    });
    expect(st.name).toBe('CSA83/1D');
    expect(st.nrt).toBe('nrt');
    expect(st.lat).toBe(37.9);
    expect(st.lon).toBe(-8.93);
  });

  it('aceita o schema Fugro Wavescan (last_data, depth string, wmo_id)', () => {
    const st = normalizeStation({
      properties: {
        id_est: 2,
        name: 'CSA88/2',
        area: 'Boia Nazaré Costeira',
        wmo_id: 6200199,
        aton_id: 'LL 126',
        depth: '85',
        status: 'active',
        nrt: 'near-real-time data available',
        last_data: '2026-08-14T18:00:00',
      },
      geometry: { type: 'Point', coordinates: [-9.200000000000001, 39.550000000000004] },
    });
    expect(st).toMatchObject({
      idEst: 2,
      name: 'CSA88/2',
      area: 'Boia Nazaré Costeira',
      wmoId: 6200199,
      depth: 85,
      status: 'active',
      lastSea: '2026-08-14T18:00:00',
      lat: 39.550000000000004,
      lon: -9.200000000000001,
    });
  });

  it('não duplica a chave lastSea quando last_sea existe (Datawell vence)', () => {
    const st = normalizeStation({
      properties: { id_est: 4, last_sea: '2026-08-14T13:32:15+00:00', last_data: '2026-08-14T18:00:00' },
      geometry: { type: 'Point', coordinates: [-8.98, 41.31] },
    });
    expect(st.lastSea).toBe('2026-08-14T13:32:15+00:00');
  });

  it('devolve null sem id_est ou sem coordenadas', () => {
    expect(normalizeStation({ properties: { name: 'x' } })).toBeNull();
    expect(normalizeStation({ properties: { id_est: 1 } })).toBeNull();
    expect(normalizeStation(null)).toBeNull();
  });
});

describe('parseWaveRow / pickLatestWave / extractWaveRows', () => {
  const row = {
    date: '2026-08-14T13:32:15+00:00',
    hm0: 1.5,
    tp: 12.3,
    thtp: 270,
    hmax: 2.2,
    temp: 19.4,
    qc_hm0: 1,
  };

  it('extrai hm0/tp/thtp/hmax/temp e normaliza a data para ISO', () => {
    const parsed = parseWaveRow(row);
    expect(parsed).toMatchObject({
      date: '2026-08-14T13:32:15.000Z',
      hm0: 1.5,
      tp: 12.3,
      thtp: 270,
      hmax: 2.2,
      temp: 19.4,
    });
  });

  it('devolve null sem hm0, com hm0 negativo, ou data inválida', () => {
    expect(parseWaveRow({ date: row.date })).toBeNull();
    expect(parseWaveRow({ date: row.date, hm0: -1 })).toBeNull();
    expect(parseWaveRow({ date: 'not-a-date', hm0: 1 })).toBeNull();
    expect(parseWaveRow(null)).toBeNull();
  });

  it('descarta o fill 99.99 do IH (amostra em falta/QC) e qualquer hm0 acima do plausível', () => {
    // 99.99 é o fill do getDatawellData: ingerido como leitura real, faz o RMSE
    // do forecast-skill saltar de ~0.2 m para ~9 m e a corr cair a 0.0.
    expect(parseWaveRow({ date: row.date, hm0: 99.99 })).toBeNull();
    expect(parseWaveRow({ date: row.date, hm0: MAX_PLAUSIBLE_HM0_M + 1 })).toBeNull();
    expect(parseWaveRow({ date: row.date, hm0: MAX_PLAUSIBLE_HM0_M })).toMatchObject({
      hm0: MAX_PLAUSIBLE_HM0_M,
    });
    expect(parseWaveRow({ date: row.date, hm0: NaN })).toBeNull();
  });

  it('mantém a linha mas larga o hmax quando este vem com o fill 99.99', () => {
    const parsed = parseWaveRow({ date: row.date, hm0: 1.4, hmax: 99.99 });
    expect(parsed).toMatchObject({ hm0: 1.4 });
    expect(parsed.hmax).toBeUndefined();
  });

  it('isPlausibleHm0 é a barreira partilhada pelas camadas de skill/bias', () => {
    expect(isPlausibleHm0(0)).toBe(true);
    expect(isPlausibleHm0(19)).toBe(true);
    expect(isPlausibleHm0(MAX_PLAUSIBLE_HM0_M)).toBe(true);
    expect(isPlausibleHm0(99.99)).toBe(false);
    expect(isPlausibleHm0(-0.1)).toBe(false);
    expect(isPlausibleHm0(Infinity)).toBe(false);
    expect(isPlausibleHm0('abc')).toBe(false);
  });

  it('pickLatestWave nunca escolhe uma linha com hm0 de fill (99.99)', () => {
    const older = { date: '2026-08-14T12:00:00+00:00', hm0: 1.1 };
    const fill = { date: '2026-08-14T13:40:00+00:00', hm0: 99.99 };
    expect(pickLatestWave([older, fill])).toMatchObject({ hm0: 1.1 });
    expect(pickLatestWave([fill])).toBeNull();
  });

  it('ignora direcção fora de 0–360 e valores não finitos', () => {
    const parsed = parseWaveRow({ date: row.date, hm0: 1.2, thtp: 999, tp: -5, hmax: -1 });
    expect(parsed.thtp).toBeUndefined();
    expect(parsed.tp).toBeUndefined();
    expect(parsed.hmax).toBeUndefined();
  });

  it('pickLatestWave escolhe a linha válida mais recente (e salta linhas inválidas)', () => {
    const older = { date: '2026-08-14T12:00:00+00:00', hm0: 1.1 };
    const invalid = { date: '2026-08-14T13:40:00+00:00' };
    expect(pickLatestWave([older, row, invalid])).toMatchObject({ hm0: 1.5 });
    expect(pickLatestWave([invalid])).toBeNull();
  });

  it('extractWaveRows lida com array, {data}, {features} e desconhecido', () => {
    expect(extractWaveRows([row])).toEqual([row]);
    expect(extractWaveRows({ data: [row] })).toEqual([row]);
    expect(extractWaveRows({ features: [{ properties: row }] })).toEqual([row]);
    expect(extractWaveRows({ nope: 1 })).toEqual([]);
    expect(extractWaveRows(null)).toEqual([]);
  });

  it('waveWindow devolve janela ISO com o span pedido', () => {
    const w = waveWindow(24, NOW);
    expect(Date.parse(w.endDate) - Date.parse(w.startDate)).toBe(24 * 3_600_000);
    expect(new Date(w.endDate).toISOString()).toBe('2026-08-14T14:00:00.000Z');
  });
});

describe('buildWaveRequestUrl', () => {
  it('monta o URL do getDatawellData para a boia (sem a key — vai no header)', () => {
    const url = buildWaveRequestUrl(2, {
      startDate: '2026-08-14T00:00:00.000Z',
      endDate: '2026-08-15T00:00:00.000Z',
    });
    expect(url).toContain('supportserver1.hidrografico.pt/geodata/buoys/getDatawellData');
    expect(url).toContain('stationId=2');
    expect(url).toContain('startDate=2026-08-14T00%3A00%3A00.000Z');
    expect(url).toContain('endDate=2026-08-15T00%3A00%3A00.000Z');
    // A key NUNCA viaja no URL (só no header X-API-KEY).
    expect(url).not.toMatch(/api[_-]?key/i);
  });

  it('aceita um waveBase alternativo (env WAVE_API_URL)', () => {
    const url = buildWaveRequestUrl(4, waveWindow(1), 'https://example.test/proxy/buoys');
    expect(url).toContain('https://example.test/proxy/buoys/getDatawellData');
    expect(url).toContain('stationId=4');
  });
});

describe('fetchBuoyWave / IhAuthError', () => {
  const resp = (status) =>
    new Response(JSON.stringify({ error: 'nope' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('lança IhAuthError tipado em 401 (key rejeitada)', async () => {
    const fetchMock = vi.fn(async () => resp(401));
    await expect(fetchBuoyWave('bad-key', 4, 'http://mock/wave', fetchMock, waveWindow(1, NOW))).rejects.toMatchObject(
      { name: 'IhAuthError', status: 401, stationId: 4 },
    );
  });

  it('lança IhAuthError tipado em 403', async () => {
    const fetchMock = vi.fn(async () => resp(403));
    await expect(fetchBuoyWave('bad-key', 19, 'http://mock/wave', fetchMock, waveWindow(1, NOW))).rejects.toMatchObject(
      { status: 403 },
    );
  });

  it('devolve null sem key e erro HTTP normal para outros status (outage ≠ auth)', async () => {
    expect(await fetchBuoyWave('', 4, 'http://mock/wave', vi.fn(), waveWindow(1, NOW))).toBeNull();
    const fetchMock = vi.fn(async () => resp(500));
    await expect(fetchBuoyWave('key', 4, 'http://mock/wave', fetchMock, waveWindow(1, NOW))).rejects.toThrow('HTTP 500');
  });

  it('isIhAuthError distingue o erro tipado de erros comuns', () => {
    expect(isIhAuthError(new IhAuthError(401, 4))).toBe(true);
    expect(isIhAuthError({ name: 'IhAuthError', status: 401 })).toBe(true);
    expect(isIhAuthError(new Error('HTTP 500 for buoy 4'))).toBe(false);
    expect(isIhAuthError(null)).toBe(false);
  });
});

describe('isFreshObservation', () => {
  it('aceita leitura dentro do TTL de 3h', () => {
    expect(isFreshObservation('2026-08-14T12:00:00Z', NOW)).toBe(true);
    expect(isFreshObservation('2026-08-14T11:00:01Z', NOW)).toBe(true);
  });

  it('rejeita leitura antiga, futura ou inválida', () => {
    expect(isFreshObservation('2026-08-14T10:59:59Z', NOW)).toBe(false);
    expect(isFreshObservation('2026-08-14T15:00:00Z', NOW)).toBe(false);
    expect(isFreshObservation(undefined, NOW)).toBe(false);
    expect(isFreshObservation('nope', NOW)).toBe(false);
  });

  it('usa 3h por omissão', () => {
    expect(MAX_OBS_AGE_HOURS).toBe(3);
  });
});

describe('mapSpotsToBuoys', () => {
  const stations = {
    4: { idEst: 4, name: 'CSA92/D', area: 'Leixões', lat: 41.3156, lon: -8.9825 },
    19: { idEst: 19, name: 'CSA83/1D', area: 'Sines', lat: 37.9211, lon: -8.9286 },
  };
  const spots = [
    { id: 'north', lat: 41.7, lon: -8.85 },
    { id: 'south', lat: 37.0, lon: -8.9 },
    { id: 'far', lat: 30.0, lon: -15.0 },
  ];

  it('mapeia cada spot à boia mais próxima dentro do raio', () => {
    const mapping = mapSpotsToBuoys(spots, stations);
    expect(mapping.north.idEst).toBe(4);
    expect(mapping.south.idEst).toBe(19);
    expect(mapping.far).toBeUndefined();
    expect(mapping.north.distanceKm).toBeCloseTo(44, 0);
  });

  it('respeita maxKm e o raio por omissão', () => {
    expect(MAX_BUOY_MAP_KM).toBe(250);
    const tight = mapSpotsToBuoys(spots, stations, 30);
    expect(tight.north).toBeUndefined();
  });

  it('ignora boias inactivas e cai para a activa mais próxima', () => {
    const mixed = {
      // Inactiva perto do spot, activa mais longe — deve escolher a activa.
      4: { idEst: 4, name: 'Funchal (inactiva)', area: 'Funchal', status: 'inactive', lat: 32.65, lon: -16.92 },
      33: { idEst: 33, name: 'Caniçal', area: 'Caniçal', status: 'active', lat: 32.74, lon: -16.74 },
    };
    const mapping = mapSpotsToBuoys([{ id: 'm', lat: 32.7, lon: -16.9 }], mixed);
    expect(mapping.m.idEst).toBe(33);
  });

  it('spots de ilha mapeiam até 280 km com flag island; continente fica em 250', () => {
    const bond5 = { 86: { idEst: 86, name: 'BOND5', area: 'Graciosa', status: 'active', lat: 39.08, lon: -27.96 } };
    // S. Miguel real: mosteiros 228 km · ribeira-quente 276 km · Sta Maria 344 km
    const ilhas = [
      { id: 'mosteiros', lat: 37.89, lon: -25.82 },
      { id: 'ribeira-quente', lat: 37.73, lon: -25.31 },
      { id: 'formosa-santa-maria', lat: 36.95, lon: -25.09 },
      { id: 'mainland', lat: 39.0, lon: -27.9 }, // mesmo ponto no oceano? não — continente falso
    ];
    const m = mapSpotsToBuoys(ilhas, bond5);
    expect(m.mosteiros).toMatchObject({ idEst: 86, island: true });
    expect(m['ribeira-quente']).toMatchObject({ idEst: 86, island: true });
    expect(m['formosa-santa-maria']).toBeUndefined(); // 344 km — honestamente fora
    // um spot continental a >250 km não ganha cap ilha
    const continental = mapSpotsToBuoys([{ id: 'sines', lat: 37.95, lon: -8.87 }], bond5);
    expect(continental.sines).toBeUndefined();
    expect(m.mosteiros.distanceKm).toBeGreaterThan(200);
  });
});

describe('observedWaveForSpot', () => {
  const mapping = { idEst: 19, distanceKm: 40 };
  const station = {
    idEst: 19,
    name: 'CSA83/1D',
    area: 'Sines',
    latest: { date: '2026-08-14T12:30:00Z', hm0: 1.8, tp: 11, thtp: 250, hmax: 2.6, temp: 19.1 },
  };

  it('constrói o payload observedWave quando fresca e dentro do raio', () => {
    const wave = observedWaveForSpot(mapping, station, { nowMs: NOW });
    expect(wave).toMatchObject({
      waveHeight: 1.8,
      wavePeriod: 11,
      waveDirection: 250,
      maxWaveHeight: 2.6,
      waterTemp: 19.1,
      stationName: 'CSA83/1D',
      stationArea: 'Sines',
      distanceKm: 40,
      source: 'ih-buoy',
      observedAt: '2026-08-14T12:30:00Z',
    });
  });

  it('mapping de ilha anexa até 280 km; acima ou sem flag fica no cap normal', () => {
    const islandMapping = { idEst: 86, distanceKm: 249, island: true };
    expect(observedWaveForSpot(islandMapping, station, { nowMs: NOW })).toMatchObject({
      distanceKm: 249,
      source: 'ih-buoy',
    });
    expect(
      observedWaveForSpot({ ...islandMapping, distanceKm: 281 }, station, { nowMs: NOW }),
    ).toBeNull();
    // sem a flag, 250 km continua fora (comportamento continental inalterado)
    expect(observedWaveForSpot({ idEst: 86, distanceKm: 249 }, station, { nowMs: NOW })).toBeNull();
  });

  it('devolve null quando está longe de mais, sem leitura, ou leitura velha', () => {
    expect(observedWaveForSpot({ idEst: 19, distanceKm: 250 }, station, { nowMs: NOW })).toBeNull();
    expect(observedWaveForSpot(mapping, { ...station, latest: undefined }, { nowMs: NOW })).toBeNull();
    expect(
      observedWaveForSpot(mapping, { ...station, latest: { ...station.latest, date: '2026-08-14T08:00:00Z' } }, { nowMs: NOW }),
    ).toBeNull();
    expect(observedWaveForSpot(null, station)).toBeNull();
  });

  it('nunca anexa uma leitura de fill (99.99 m) ao spot — o score não pode ver 99.99', () => {
    expect(
      observedWaveForSpot(mapping, { ...station, latest: { ...station.latest, hm0: 99.99 } }, { nowMs: NOW }),
    ).toBeNull();
    const stale = observedWaveForSpot(
      mapping,
      { ...station, latest: { ...station.latest, hmax: 99.99 } },
      { nowMs: NOW },
    );
    expect(stale.waveHeight).toBe(1.8);
    expect(stale.maxWaveHeight).toBeUndefined();
  });

  it('respeita o raio de attach por omissão', () => {
    expect(MAX_BUOY_ATTACH_KM).toBe(200);
  });
});

describe('fetch-ih-buoys.js (caminho real do pipeline)', () => {
  const MODULE_PATH = '../../fetch-ih-buoys.js';
  let tmpDir;

  function loadModule(overrides = {}) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ih-buoys-test-'));
    process.env.IH_API_URL = 'http://mock-ih.local';
    process.env.IH_BUOY_WAVE_API_URL = 'http://mock-ih.local/wave';
    process.env.IH_BUOY_OUTPUT_PATH = path.join(tmpDir, 'ih-buoys.json');
    delete process.env.IH_API_KEY;
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    const resolved = require.resolve(MODULE_PATH);
    delete require.cache[resolved];
    return require(resolved);
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const stationsDoc = () => ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id_est: 4, name: 'CSA92/D', area: 'Leixões', wmo_id: 6201077,
          depth: 81, status: 'active', nrt: 'near-real-time data available',
          last_pos: '2026-08-14T08:32:15+00:00', last_sea: '2026-08-14T13:32:15+00:00',
        },
        geometry: { type: 'Point', coordinates: [-8.9825, 41.3156] },
      },
      {
        type: 'Feature',
        properties: {
          id_est: 19, name: 'CSA83/1D', area: 'Sines', wmo_id: 6201078,
          depth: 97, status: 'active', nrt: 'near-real-time data available',
          last_sea: '2026-08-14T13:56:45+00:00',
        },
        geometry: { type: 'Point', coordinates: [-8.9286, 37.9211] },
      },
    ],
  });

  const waveDoc = (hm0) => [
    { date: '2026-08-14T13:00:00+00:00', hm0, tp: 12, thtp: 260, hmax: hm0 * 1.5, temp: 19 },
    { date: '2026-08-14T12:00:00+00:00', hm0: 0.9 },
  ];

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.IH_API_KEY;
  });

  it('com IH_API_KEY escreve estações + latest wave + spotMapping', async () => {
    const mod = loadModule({ IH_API_KEY: 'test-key' });
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/getDatawellData')) return json(waveDoc(1.6));
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const output = await mod.fetchIHBuoys();

    expect(Object.keys(output.stations)).toHaveLength(2);
    expect(output.stations['4'].latest).toMatchObject({ hm0: 1.6, tp: 12, thtp: 260 });
    expect(output.hasWaveData).toBe(true);
    expect(output.apiKeyConfigured).toBe(true);
    expect(Object.keys(output.spotMapping).length).toBeGreaterThan(0);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'ih-buoys.json'), 'utf8'));
    expect(onDisk.stations['4'].latest.hm0).toBe(1.6);
  });

  it('sem IH_API_KEY escreve só estações (sem latest) e hasWaveData=false', async () => {
    const mod = loadModule();
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const output = await mod.fetchIHBuoys();
    expect(output.stations['4'].latest).toBeUndefined();
    expect(output.hasWaveData).toBe(false);
    expect(output.apiKeyConfigured).toBe(false);
  });

  it('IH em baixo mantém o ficheiro anterior e sai com exit 0', async () => {
    const mod = loadModule();
    // Fixture "último ih-buoys.json conhecido" no caminho que o módulo usa.
    const outPath = process.env.IH_BUOY_OUTPUT_PATH;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify({ stations: { 4: { idEst: 4, name: 'CSA92/D' } }, fetchedAt: new Date().toISOString() }),
    );
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mod.run();
    expect(process.exitCode).toBeFalsy();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('Keeping previous'))).toBe(true);
    warnSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('key rejeitada (401) → fail-early: apiKeyStatus unauthorized + ::error:: + exit 1', async () => {
    const mod = loadModule({ IH_API_KEY: 'expired-key' });
    delete process.env.OPS_TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/getDatawellData')) return json({ error: 'unauthorized' }, 401);
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await mod.run();

    expect(process.exitCode).toBe(1);
    const onDisk = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(onDisk.apiKeyStatus).toBe('unauthorized');
    expect(onDisk.apiKeyConfigured).toBe(true);
    expect(onDisk.hasWaveData).toBe(false);
    expect(onDisk.authError.status).toBe(401);
    // Estações (OGC, sem key) continuam a ser gravadas — o diagnóstico não perde o catálogo.
    expect(Object.keys(onDisk.stations).length).toBe(2);
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('::error::IH_API_KEY rejeitada'))).toBe(true);

    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('notifyIhAuthFailure envia Telegram na transição (primeira rejeição)', async () => {
    const mod = loadModule();
    const send = vi.fn(async () => true);
    const log = vi.fn();
    const res = await mod.notifyIhAuthFailure(
      { name: 'IhAuthError', status: 401, previouslyUnauthorized: false },
      { send, chatId: '123', log },
    );
    expect(res).toEqual({ notified: true });
    expect(send).toHaveBeenCalledTimes(1);
    const [chatId, text] = send.mock.calls[0];
    expect(chatId).toBe('123');
    expect(text).toContain('IH_API_KEY rejeitada (HTTP 401)');
    expect(text).toContain('docs/IH_API_KEY.md');
    expect(log).not.toHaveBeenCalled();
  });

  it('notifyIhAuthFailure NÃO re-envia quando o run anterior já estava unauthorized', async () => {
    const mod = loadModule();
    const send = vi.fn(async () => true);
    const res = await mod.notifyIhAuthFailure(
      { name: 'IhAuthError', status: 401, previouslyUnauthorized: true },
      { send, chatId: '123' },
    );
    expect(res).toEqual({ notified: false, reason: 'already-reported' });
    expect(send).not.toHaveBeenCalled();
  });

  it('notifyIhAuthFailure sem OPS_TELEGRAM_CHAT_ID → dry-run (nunca envia)', async () => {
    const mod = loadModule();
    delete process.env.OPS_TELEGRAM_CHAT_ID;
    const send = vi.fn(async () => true);
    const log = vi.fn();
    const res = await mod.notifyIhAuthFailure(
      { name: 'IhAuthError', status: 401, previouslyUnauthorized: false },
      { send, log },
    );
    expect(res).toEqual({ notified: false, reason: 'no-chat-id' });
    expect(send).not.toHaveBeenCalled();
    expect(log.mock.calls.some((c) => String(c[0]).includes('dry-run'))).toBe(true);
  });
});

// ── Outage IH a montante (incidente 2026-10-23: HTTP 500 em todas as Datawell) ──
describe('classifyWaveFetch — outage vs regressão vs auth', () => {
  const {
    classifyWaveFetch,
    isTransientIhError,
    IhHttpError,
    IhAuthError: AuthErr,
    carryForwardWaveReadings,
  } = require('../ihBuoys.js');
  const ok = (v = { date: 'x', hm0: 1 }) => ({ status: 'fulfilled', value: v });
  const empty = () => ({ status: 'fulfilled', value: null });
  const fail = (reason) => ({ status: 'rejected', reason });
  const ids = [4, 19, 20, 33, 86];
  const all = (fn) => ids.map((idEst) => ({ idEst, result: fn(idEst) }));

  it('5xx em TODAS as boias → upstream-outage, não falha (avisa e mantém)', () => {
    const c = classifyWaveFetch(all((id) => fail(new IhHttpError(500, id))));
    expect(c.status).toBe('upstream-outage');
    expect(c.fail).toBe(false);
    expect(c.transient).toBe(5);
    expect(c.failures.map((f) => f.status)).toEqual([500, 500, 500, 500, 500]);
    expect(c.failures[0].error).toBe('HTTP 500 for buoy 4');
  });

  it('timeouts / erros de rede / 502–504 / 429 contam como outage transitório', () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const net = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const dns = Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' });
    const reasons = [timeout, net, dns, new IhHttpError(503, 20), new IhHttpError(429, 33)];
    const c = classifyWaveFetch(ids.map((idEst, i) => ({ idEst, result: fail(reasons[i]) })));
    expect(c.status).toBe('upstream-outage');
    expect(c.fail).toBe(false);
  });

  it('401/403 → auth, falha (mesmo misturado com 5xx)', () => {
    expect(classifyWaveFetch(all((id) => fail(new AuthErr(401, id)))).status).toBe('auth');
    const mixed = classifyWaveFetch(all((id) => fail(id === 19 ? new AuthErr(403, id) : new IhHttpError(500, id))));
    expect(mixed.status).toBe('auth');
    expect(mixed.fail).toBe(true);
    expect(isTransientIhError(new AuthErr(401, 4))).toBe(false);
  });

  it('key configurada + todas 2xx sem série → empty, falha (a regressão do gate)', () => {
    const c = classifyWaveFetch(all(() => empty()));
    expect(c.status).toBe('empty');
    expect(c.fail).toBe(true);
  });

  it('sucesso parcial → partial, não falha', () => {
    const c = classifyWaveFetch(all((id) => (id === 4 ? ok() : fail(new IhHttpError(500, id)))));
    expect(c.status).toBe('partial');
    expect(c.fail).toBe(false);
    expect(classifyWaveFetch(all(() => ok())).status).toBe('ok');
  });

  it('sem dados com mistura 2xx-vazio + 5xx ou 4xx não-auth → error, falha (não é outage puro)', () => {
    const mix = classifyWaveFetch(all((id) => (id === 4 ? empty() : fail(new IhHttpError(500, id)))));
    expect(mix.status).toBe('error');
    expect(mix.fail).toBe(true);
    const c404 = classifyWaveFetch(all((id) => fail(new IhHttpError(404, id))));
    expect(c404.status).toBe('error');
    expect(isTransientIhError(new IhHttpError(400, 4))).toBe(false);
    expect(isTransientIhError(new SyntaxError('Unexpected token <'))).toBe(false);
  });

  it('zero boias activas com key → no-active, falha; sem key → no-key', () => {
    expect(classifyWaveFetch([]).status).toBe('no-active');
    expect(classifyWaveFetch([]).fail).toBe(true);
    expect(classifyWaveFetch([], { apiKeyConfigured: false })).toMatchObject({ status: 'no-key', fail: false });
  });

  it('carryForwardWaveReadings mantém a hora REAL da leitura e larga > 24 h / inválidas', () => {
    const now = Date.UTC(2026, 9, 23, 17, 0);
    const iso = (h) => new Date(now - h * 3_600_000).toISOString();
    const prev = {
      stations: {
        4: { latest: { date: iso(4), hm0: 4.5 } },
        19: { latest: { date: iso(30), hm0: 1.7 } },
        20: { latest: { date: iso(2), hm0: 99.99 } },
      },
    };
    const fresh = { 4: { idEst: 4, lastSea: iso(0) }, 19: { idEst: 19 }, 20: { idEst: 20 }, 33: { idEst: 33 } };
    const out = carryForwardWaveReadings(fresh, prev, { nowMs: now });
    expect(out.kept).toBe(1);
    expect(out.stations['4'].latest).toEqual({ date: iso(4), hm0: 4.5 });
    expect(out.stations['4'].lastSea).toBe(iso(0));
    expect(out.stations['19'].latest).toBeUndefined();
    expect(out.stations['20'].latest).toBeUndefined();
    expect(out.newestKeptReadingAt).toBe(iso(4));
    // Não muta o catálogo de entrada.
    expect(fresh['4'].latest).toBeUndefined();
  });
});

describe('fetch-ih-buoys.js — outage IH a montante (HTTP 500)', () => {
  const MODULE_PATH = '../../fetch-ih-buoys.js';
  const { deriveBuoyLayerStatus } = require('../buoyLayerHealth.js');
  const { observedWaveForSpot: observedWave } = require('../ihBuoys.js');
  const { verifyIhBuoyLayer } = require('../../verify-ih-buoy-layer.js');
  let tmpDir;

  function loadModule(overrides = {}) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ih-buoys-outage-'));
    process.env.IH_API_URL = 'http://mock-ih.local';
    process.env.IH_BUOY_WAVE_API_URL = 'http://mock-ih.local/wave';
    process.env.IH_BUOY_OUTPUT_PATH = path.join(tmpDir, 'ih-buoys.json');
    delete process.env.IH_API_KEY;
    delete process.env.OPS_TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    const resolved = require.resolve(MODULE_PATH);
    delete require.cache[resolved];
    return require(resolved);
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const nowIso = (hBack) => new Date(Date.now() - hBack * 3_600_000).toISOString();

  const stationsDoc = () => ({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { id_est: 4, name: 'CSA92/D', area: 'Leixões', status: 'active', last_sea: nowIso(0.2) }, geometry: { type: 'Point', coordinates: [-8.9825, 41.3156] } },
      { type: 'Feature', properties: { id_est: 19, name: 'CSA83/1D', area: 'Sines', status: 'active', last_sea: nowIso(0.2) }, geometry: { type: 'Point', coordinates: [-8.9286, 37.9211] } },
      { type: 'Feature', properties: { id_est: 20, name: 'CSA82/D', area: 'Faro', status: 'active', last_sea: nowIso(0.2) }, geometry: { type: 'Point', coordinates: [-7.9, 36.9] } },
    ],
  });

  function writePrev(obj) {
    fs.writeFileSync(process.env.IH_BUOY_OUTPUT_PATH, JSON.stringify(obj));
  }

  const prevGood = () => ({
    stations: {
      4: { idEst: 4, name: 'CSA92/D', family: 'datawell', status: 'active', latest: { date: nowIso(4), hm0: 4.51, tp: 13.3 } },
      19: { idEst: 19, name: 'CSA83/1D', family: 'datawell', status: 'active', latest: { date: nowIso(8), hm0: 1.72 } },
    },
    spotMapping: {},
    fetchedAt: nowIso(3.5),
    apiKeyConfigured: true,
    hasWaveData: true,
  });

  function stubIh(waveResponse) {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/collections/')) return json({ type: 'FeatureCollection', features: [] });
      if (String(url).includes('/getDatawellData')) return waveResponse(url);
      return json({}, 404);
    }));
  }

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.IH_API_KEY;
    delete process.env.OPS_TELEGRAM_CHAT_ID;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('5xx em todas → mantém as leituras anteriores com a hora real, flag upstream-outage, ::warning::, exit 0', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    writePrev(prevGood());
    stubIh(() => json({ error: 'boom' }, 500));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await mod.run();

    expect(process.exitCode).toBeFalsy();
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out.waveFetchStatus).toBe('upstream-outage');
    expect(out.upstreamOutage.scope).toBe('wave');
    expect(out.upstreamOutage.failures.map((f) => f.status)).toEqual([500, 500, 500]);
    expect(out.upstreamOutage.keptReadings).toBe(2);
    // lastWaveOkAt = fetchedAt do último run com séries (o anterior, há 3,5 h).
    expect(Math.abs(Date.parse(out.upstreamOutage.lastWaveOkAt) - (Date.now() - 3.5 * 3_600_000))).toBeLessThan(60_000);
    // Catálogo fresco (3 estações) + leituras antigas com a hora REAL.
    expect(Object.keys(out.stations)).toEqual(['4', '19', '20']);
    expect(out.stations['4'].latest.hm0).toBe(4.51);
    expect(Date.now() - Date.parse(out.stations['4'].latest.date)).toBeGreaterThan(3.9 * 3_600_000);
    expect(out.stations['20'].latest).toBeUndefined();
    expect(out.hasWaveData).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('::warning::IH em baixo a montante'))).toBe(true);

    // Frescura a jusante: nada passa por fresco.
    expect(deriveBuoyLayerStatus(out)).toBe('stale');
    expect(observedWave({ idEst: 4, distanceKm: 10 }, out.stations['4'])).toBeNull();
    const v = verifyIhBuoyLayer(out);
    expect(v.ok).toBe(true);
    expect(v.outage).toBe(true);
    expect(v.freshDatawell).toEqual([]);
  });

  it('5xx sem ficheiro anterior → hasWaveData=false + flag de outage, exit 0', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    stubIh(() => json({}, 502));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await mod.run();
    expect(process.exitCode).toBeFalsy();
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out).toMatchObject({ hasWaveData: false, waveFetchStatus: 'upstream-outage' });
    expect(out.upstreamOutage.keptReadings).toBe(0);
    expect(deriveBuoyLayerStatus(out)).toBe('down');
    expect(verifyIhBuoyLayer(out).ok).toBe(true);
  });

  it('2xx sem séries em todas → waveFetchStatus empty, SEM flag de outage → verify falha', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    writePrev(prevGood());
    stubIh(() => json([]));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await mod.run();
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out.waveFetchStatus).toBe('empty');
    expect(out.hasWaveData).toBe(false);
    expect(out.upstreamOutage).toBeUndefined();
    // Nada de leituras antigas carregadas no caso da regressão.
    expect(out.stations['4'].latest).toBeUndefined();
    const v = verifyIhBuoyLayer(out);
    expect(v.ok).toBe(false);
    expect(v.problems[0]).toContain('hasWaveData=false');
  });

  it('401 continua a falhar cedo (exit 1), nunca vira outage', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    writePrev(prevGood());
    stubIh(() => json({}, 401));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await mod.run();
    expect(process.exitCode).toBe(1);
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out.apiKeyStatus).toBe('unauthorized');
    expect(out.waveFetchStatus).toBe('auth');
    expect(out.upstreamOutage).toBeUndefined();
  });

  it('parcial (1 boia ok, resto 500) → partial, sem flag, verify OK', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    stubIh((url) =>
      String(url).includes('stationId=4')
        ? json([{ date: nowIso(0.5), hm0: 2.1, tp: 11 }])
        : json({}, 500),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await mod.run();
    expect(process.exitCode).toBeFalsy();
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out.waveFetchStatus).toBe('partial');
    expect(out.upstreamOutage).toBeUndefined();
    expect(out.stations['4'].latest.hm0).toBe(2.1);
    expect(verifyIhBuoyLayer(out).ok).toBe(true);
  });

  it('zero boias listadas (2xx sem features) → ::error:: + exit 1, ficheiro anterior intacto', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    writePrev(prevGood());
    vi.stubGlobal('fetch', vi.fn(async () => json({ type: 'FeatureCollection', features: [] })));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await mod.run();
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls.some((c) => String(c[0]).includes('::error::IH buoy listing: zero boias'))).toBe(true);
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out.waveFetchStatus).toBeUndefined();
  });

  it('listagem OGC em 5xx com key → reescreve o anterior com flag scope=stations, exit 0', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    writePrev(prevGood());
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mod.run();
    expect(process.exitCode).toBeFalsy();
    const out = JSON.parse(fs.readFileSync(process.env.IH_BUOY_OUTPUT_PATH, 'utf8'));
    expect(out.waveFetchStatus).toBe('upstream-outage');
    expect(out.upstreamOutage.scope).toBe('stations');
    // Catálogo não refrescado → mantém o fetchedAt anterior (há 3,5 h).
    expect(Math.abs(Date.parse(out.fetchedAt) - (Date.now() - 3.5 * 3_600_000))).toBeLessThan(60_000);
    expect(out.stations['4'].latest.hm0).toBe(4.51);
    expect(verifyIhBuoyLayer(out).ok).toBe(true);
  });

  it('since sobrevive entre runs; Telegram UMA vez ao atingir 3 h e uma vez na recuperação', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    const send = vi.fn(async () => true);
    const prevOutage = {
      ...prevGood(),
      waveFetchStatus: 'upstream-outage',
      upstreamOutage: { scope: 'wave', since: nowIso(1), failures: [{ idEst: 4, status: 500, error: 'HTTP 500 for buoy 4', transient: true }], keptReadings: 2 },
    };
    // 1 h de outage → abaixo do limiar, sem alerta; since mantém-se.
    const p1 = mod.buildOutagePayload({ prev: prevOutage, stations: prevGood().stations, failures: prevOutage.upstreamOutage.failures, scope: 'wave' });
    expect(p1.upstreamOutage.since).toBe(prevOutage.upstreamOutage.since);
    expect(await mod.maybeNotifyIhOutage(p1, prevOutage, { send, chatId: 'c' })).toEqual({ notified: false, reason: 'below-threshold' });
    // 3,5 h → alerta único.
    const p2 = { ...p1, upstreamOutage: { ...p1.upstreamOutage, since: nowIso(3.5) } };
    expect(await mod.maybeNotifyIhOutage(p2, prevOutage, { send, chatId: 'c' })).toEqual({ notified: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toContain('API de boias IH em baixo');
    expect(send.mock.calls[0][1]).toContain('HTTP 500');
    expect(p2.upstreamOutage.alertedAt).toBeTruthy();
    // Run seguinte: alertedAt transportado → não repete.
    const p3 = mod.buildOutagePayload({ prev: p2, stations: prevGood().stations, failures: [], scope: 'wave' });
    expect(p3.upstreamOutage.alertedAt).toBe(p2.upstreamOutage.alertedAt);
    expect(await mod.maybeNotifyIhOutage(p3, p2, { send, chatId: 'c' })).toEqual({ notified: false, reason: 'already-reported' });
    // Recuperação depois de alerta → 1 mensagem; sem alerta prévio → nada.
    const recovered = { hasWaveData: true, waveFetchStatus: 'ok' };
    expect(await mod.maybeNotifyIhRecovery(recovered, p3, { send, chatId: 'c' })).toEqual({ notified: true });
    expect(send.mock.calls[1][1]).toContain('recuperou');
    expect(await mod.maybeNotifyIhRecovery(recovered, p1, { send, chatId: 'c' })).toEqual({ notified: false, reason: 'no-alerted-outage' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a duração conta desde a última leitura IH boa (lastWaveOkAt) quando é mais antiga que since', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    const send = vi.fn(async () => true);
    const p = mod.buildOutagePayload({ prev: prevGood(), stations: prevGood().stations, failures: [], scope: 'wave' });
    // Primeiro run em outage (since = agora), mas a última série boa foi há 3,5 h.
    expect(Date.now() - Date.parse(p.upstreamOutage.since)).toBeLessThan(60_000);
    expect(await mod.maybeNotifyIhOutage(p, prevGood(), { send, chatId: 'c' })).toEqual({ notified: true });
  });

  it('Telegram em baixo nunca rebenta o run (alertedAt fica por gravar → tenta de novo)', async () => {
    const mod = loadModule({ IH_API_KEY: 'k' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = mod.buildOutagePayload({ prev: null, stations: {}, failures: [], scope: 'wave' });
    p.upstreamOutage.since = nowIso(5);
    const send = vi.fn(async () => { throw new Error('telegram 502'); });
    expect(await mod.maybeNotifyIhOutage(p, null, { send, chatId: 'c' })).toEqual({ notified: false, reason: 'not-sent' });
    expect(p.upstreamOutage.alertedAt).toBeUndefined();
  });
});
