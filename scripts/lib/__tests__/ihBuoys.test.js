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
  buildWaveRequestUrl,
  MAX_BUOY_MAP_KM,
  MAX_BUOY_ATTACH_KM,
  MAX_OBS_AGE_HOURS,
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

  it('devolve null quando está longe de mais, sem leitura, ou leitura velha', () => {
    expect(observedWaveForSpot({ idEst: 19, distanceKm: 250 }, station, { nowMs: NOW })).toBeNull();
    expect(observedWaveForSpot(mapping, { ...station, latest: undefined }, { nowMs: NOW })).toBeNull();
    expect(
      observedWaveForSpot(mapping, { ...station, latest: { ...station.latest, date: '2026-08-14T08:00:00Z' } }, { nowMs: NOW }),
    ).toBeNull();
    expect(observedWaveForSpot(null, station)).toBeNull();
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
});
