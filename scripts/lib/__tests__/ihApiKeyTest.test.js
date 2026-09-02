import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runIhApiKeyTest, summarizeWave, MAX_FRESH_HOURS } = require('../../test-ih-api-key.js');

afterEach(() => {
  delete process.env.IH_API_KEY;
  vi.unstubAllGlobals();
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** OGC stations doc with one active buoy (Leixões, id_est 4). */
const stationsDoc = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id_est: 4, name: 'CSA92/D', area: 'Leixões', wmo_id: 6201077,
        depth: 81, status: 'active', nrt: 'near-real-time data available',
        last_pos: '2026-08-14T08:32:15+00:00', last_sea: new Date().toISOString(),
      },
      geometry: { type: 'Point', coordinates: [-8.9825, 41.3156] },
    },
    {
      type: 'Feature',
      properties: {
        id_est: 19, name: 'CSA83/1D', area: 'Sines', wmo_id: 6201078,
        depth: 97, status: 'inactive', nrt: 'nrt',
      },
      geometry: { type: 'Point', coordinates: [-8.9286, 37.9211] },
    },
  ],
});

const freshWaveDoc = () => [
  { date: new Date().toISOString(), hm0: 1.5, tp: 12.3, thtp: 270, hmax: 2.2, temp: 19.4 },
  { date: new Date(Date.now() - 3600_000).toISOString(), hm0: 0.9 },
];

/** Silent logger so PASS/FAIL output stays out of the test report. */
const silentLog = { log: () => {}, error: () => {}, warn: () => {} };

/** OGC stations doc including the Fugro Wavescan Nazaré Costeira (id_est 2). */
const stationsWithFugroDoc = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id_est: 4, name: 'CSA92/D', area: 'Leixões', wmo_id: 6201077,
        depth: 81, status: 'active', nrt: 'near-real-time data available',
        last_pos: '2026-08-14T08:32:15+00:00', last_sea: new Date().toISOString(),
      },
      geometry: { type: 'Point', coordinates: [-8.9825, 41.3156] },
    },
    {
      type: 'Feature',
      properties: {
        id_est: 2, name: 'CSA88/2', area: 'Boia Nazaré Costeira', wmo_id: 6200199,
        depth: '85', status: 'active', nrt: 'near-real-time data available',
        last_data: new Date().toISOString(),
      },
      geometry: { type: 'Point', coordinates: [-9.2, 39.55] },
    },
  ],
});

/** Mock fetch that serves the Fugro collection (stations) + wave series per station. */
function fugroFetchMock({ waveStatus = 200, waveBody } = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/collections/buoys_datawell/items') || u.includes('/collections/buoys_Fugro_oceanor_wavescan/items')) {
      return json(stationsWithFugroDoc());
    }
    if (u.includes('/getDatawellData')) {
      if (waveStatus !== 200) return json({}, waveStatus);
      return json(waveBody ?? freshWaveDoc());
    }
    return json({}, 404);
  });
}

describe('runIhApiKeyTest — caminho PASS', () => {
  it('key válida + estação activa + leitura fresca → exit 0', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/getDatawellData')) return json(freshWaveDoc());
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      log: silentLog,
    });

    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
    const waveCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/getDatawellData'));
    expect(waveCall).toBeTruthy();
    expect(String(waveCall[0])).toContain('stationId=4');
  });

  it('--station filtra para a boia pedida', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/getDatawellData')) return json(freshWaveDoc());
      return json({}, 404);
    });
    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      stationId: 4,
      log: silentLog,
    });
    expect(code).toBe(0);
  });

  it('Fugro Wavescan (Nazaré Costeira, id_est 2): getDatawellData devolve leituras → exit 0', async () => {
    const fetchMock = fugroFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      stationId: 2,
      log: silentLog,
    });

    expect(code).toBe(0);
    const waveCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/getDatawellData'));
    expect(String(waveCall[0])).toContain('stationId=2');
  });

  it('--family fugro filtra para as boias Fugro activas e pergunta a getDatawellData', async () => {
    const fetchMock = fugroFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      family: 'fugro',
      log: silentLog,
    });

    expect(code).toBe(0);
    // Só a Fugro (2) é chamada na série — nunca a Datawell (4).
    const waveCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/getDatawellData'));
    expect(waveCalls.length).toBeGreaterThan(0);
    for (const [u] of waveCalls) expect(String(u)).toContain('stationId=2');
  });

  it('sem --family: Fugro activa mais recente mas série vazia → tenta Datawell e PASS', async () => {
    // O cenário real do api-keys.yml (2026-09-02): 2/1010/1011 Fugro à frente
    // por last_data, série vazia; Leixões/Sines/Faro/Caniçal respondem.
    const now = Date.now();
    const mixedDoc = () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id_est: 4, name: 'CSA92/D', area: 'Leixões', wmo_id: 6201077,
            status: 'active', nrt: 'near-real-time data available',
            last_sea: new Date(now - 3_600_000).toISOString(),
          },
          geometry: { type: 'Point', coordinates: [-8.9825, 41.3156] },
        },
        {
          type: 'Feature',
          properties: {
            id_est: 2, name: 'CSA88/2', area: 'Boia Nazaré Costeira', wmo_id: 6200199,
            status: 'active', nrt: 'near-real-time data available',
            last_data: new Date(now).toISOString(),
          },
          geometry: { type: 'Point', coordinates: [-9.2, 39.55] },
        },
      ],
    });
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/collections/buoys_datawell/items')) {
        return json({
          type: 'FeatureCollection',
          features: mixedDoc().features.filter((f) => f.properties.id_est === 4),
        });
      }
      if (u.includes('/collections/buoys_Fugro_oceanor_wavescan/items')) {
        return json({
          type: 'FeatureCollection',
          features: mixedDoc().features.filter((f) => f.properties.id_est === 2),
        });
      }
      if (u.includes('/getDatawellData')) {
        if (u.includes('stationId=2')) return json([]);
        if (u.includes('stationId=4')) return json(freshWaveDoc());
        return json([]);
      }
      return json({}, 404);
    });

    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      log: silentLog,
    });

    expect(code).toBe(0);
    const waveCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/getDatawellData'));
    expect(waveCalls.some(([u]) => String(u).includes('stationId=4'))).toBe(true);
    expect(waveCalls.some(([u]) => String(u).includes('stationId=2'))).toBe(false);
  });
});

describe('runIhApiKeyTest — caminho FAIL', () => {
  it('sem IH_API_KEY → exit 1 com instruções', async () => {
    delete process.env.IH_API_KEY;
    const code = await runIhApiKeyTest({ apiKey: null, log: silentLog });
    expect(code).toBe(1);
  });

  it('key presente mas lista de boias inacessível (rede/500) → exit 1', async () => {
    const fetchMock = vi.fn(async () => json({}, 500));
    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('nenhuma boia activa → exit 1', async () => {
    const inactiveDoc = () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id_est: 4, name: 'CSA92/D', status: 'inactive', nrt: 'nrt' },
          geometry: { type: 'Point', coordinates: [-8.98, 41.31] },
        },
      ],
    });
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(inactiveDoc());
      return json({}, 404);
    });
    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('key rejeitada pela API de ondas (401) → exit 1', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/getDatawellData')) return json({}, 401);
      return json({}, 404);
    });
    const code = await runIhApiKeyTest({
      apiKey: 'wrong-key',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('API de ondas OK mas sem leituras na janela → exit 1', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/getDatawellData')) return json([]);
      return json({}, 404);
    });
    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('Fugro: getDatawellData rejeita a boia 2 (400/500) → exit 1 (Fugro não servida pela API)', async () => {
    const fetchMock = fugroFetchMock({ waveStatus: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      stationId: 2,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('Fugro: getDatawellData responde mas sem leituras na janela → exit 1', async () => {
    const fetchMock = fugroFetchMock({ waveBody: [] });
    vi.stubGlobal('fetch', fetchMock);

    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      stationId: 2,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('--family fugro sem boias Fugro activas → exit 1 com diagnóstico', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsDoc());
      if (String(url).includes('/collections/buoys_Fugro_oceanor_wavescan/items')) return json({ type: 'FeatureCollection', features: [] });
      return json({}, 404);
    });
    const code = await runIhApiKeyTest({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
      family: 'fugro',
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('--url (dry-run, sem key): imprime o curl exacto e nunca toca a rede', async () => {
    let calls = 0;
    const lines = [];
    const log = { log: (m) => lines.push(m), error: () => {}, warn: () => {} };
    const fetchMock = vi.fn(async (url) => {
      calls += 1;
      if (String(url).includes('/collections/buoys_datawell/items')) return json(stationsWithFugroDoc());
      if (String(url).includes('/collections/buoys_Fugro_oceanor_wavescan/items')) return json(stationsWithFugroDoc());
      return json({}, 404);
    });
    const code = await runIhApiKeyTest({
      apiKey: null,
      fetchImpl: fetchMock,
      family: 'fugro',
      urlOnly: true,
      log,
    });
    expect(code).toBe(0);
    // Só os 2 fetches de estações (datawell + fugro, sem key); nenhum à série de onda.
    expect(calls).toBe(2);
    const curl = lines.find((l) => l.includes('curl -s'));
    const urlLine = lines.find((l) => l.includes('supportserver1.hidrografico.pt'));
    expect(curl).toBeTruthy();
    expect(curl).toContain('X-API-KEY');
    expect(urlLine).toContain('supportserver1.hidrografico.pt/geodata/buoys/getDatawellData');
    expect(urlLine).toContain('stationId=2');
  });
});

describe('summarizeWave', () => {
  it('resume os parâmetros da leitura', () => {
    expect(summarizeWave({ hm0: 1.5, tp: 12.3, thtp: 270, hmax: 2.2, temp: 19.4 })).toBe(
      'hm0 1.50 m · tp 12.3 s · dir 270° · hmax 2.20 m · SST 19.4°C',
    );
  });

  it('ignora parâmetros ausentes', () => {
    expect(summarizeWave({ hm0: 1.5 })).toBe('hm0 1.50 m');
  });

  it('janela de frescura do diagnóstico é 6h (manual, mais larga que os 3h do attach)', () => {
    expect(MAX_FRESH_HOURS).toBe(6);
  });
});
