import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMeteoAlarmApiKeyTest, parseSpotsFromFile } = require('../../test-meteoalarm-api-key.js');

afterEach(() => {
  delete process.env.METEOALARM_API_KEY;
  vi.unstubAllGlobals();
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Bbox de Portugal (cobre todos os spots reais) — para o mapeamento spot→aviso. */
const PT_BBOX = [
  [-10, 43],
  [-6, 43],
  [-6, 36],
  [-10, 36],
  [-10, 43],
];

/** EDR locations doc: um aviso activo com link CAP (rel json) + bbox PT. */
const edrDoc = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'warning-1',
      properties: { alertId: 'pt-w-1', countryCode: 'PT' },
      geometry: { type: 'Polygon', coordinates: [PT_BBOX] },
      links: [
        {
          rel: 'json',
          type: 'application/json',
          href: 'https://storage.meteoalarm.org/cap/pt-w-1.json',
        },
      ],
    },
  ],
});

/** CAP Oasis 1.2 payload — Vento amarelo, vigência futura. */
const capDoc = () => ({
  identifier: 'pt-w-1',
  info: [
    {
      language: 'pt-PT',
      event: 'Vento',
      severity: 'Moderate',
      onset: new Date(Date.now() - 3_600_000).toISOString(),
      expires: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      description: 'Rajadas fortes na costa oeste.',
      area: [
        {
          areaDesc: 'Costa Oeste',
          parameter: [
            { valueName: 'awareness_type', value: '1' },
            { valueName: 'awareness_level', value: '2' },
          ],
        },
      ],
    },
  ],
});

/** Silent logger so PASS/FAIL output stays out of the test report. */
const silentLog = { log: () => {}, error: () => {}, warn: () => {} };

describe('runMeteoAlarmApiKeyTest — caminho PASS', () => {
  it('token → EDR → CAP → payload (source meteoalarm) → exit 0', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/warnings/locations/PT')) return json(edrDoc());
      return json(capDoc()); // signed CAP URL (storage) — sem auth
    });
    vi.stubGlobal('fetch', fetchMock);

    const code = await runMeteoAlarmApiKeyTest({
      apiKey: 'test-token',
      fetchImpl: fetchMock,
      log: silentLog,
    });

    expect(code).toBe(0);
    // O token é enviado como Bearer na consulta EDR (não no CAP).
    const edrCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/collections/warnings/locations/PT'));
    expect(edrCall).toBeTruthy();
    expect(edrCall[1]?.headers?.Authorization).toBe('Bearer test-token');
    const capCall = fetchMock.mock.calls.find(([u]) => String(u).includes('storage.meteoalarm.org'));
    expect(capCall).toBeTruthy();
    expect(capCall[1]?.headers?.Authorization ?? null).toBeNull();
  });

  it('dia calmo (features vazias) ainda passa — o token respondeu', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/warnings/locations/PT')) {
        return json({ type: 'FeatureCollection', features: [] });
      }
      return json({}, 404);
    });
    const code = await runMeteoAlarmApiKeyTest({
      apiKey: 'test-token',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(0);
  });

  it('parseSpotsFromFile devolve os spots reais com id/lat/lon', () => {
    const spots = parseSpotsFromFile();
    expect(spots.length).toBeGreaterThan(50);
    const guincho = spots.find((s) => s.id === 'guincho');
    expect(guincho?.lat).toBeCloseTo(38.732, 1);
    expect(guincho?.lon).toBeCloseTo(-9.472, 1);
  });
});

describe('runMeteoAlarmApiKeyTest — caminho FAIL', () => {
  it('sem METEOALARM_API_KEY → exit 1 com instruções', async () => {
    const code = await runMeteoAlarmApiKeyTest({ apiKey: null, log: silentLog });
    expect(code).toBe(1);
  });

  it('token rejeitado pela API EDR (401) → exit 1', async () => {
    const fetchMock = vi.fn(async () => json({}, 401));
    const code = await runMeteoAlarmApiKeyTest({
      apiKey: 'wrong-token',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('API EDR em baixo (500) → exit 1', async () => {
    const fetchMock = vi.fn(async () => json({}, 500));
    const code = await runMeteoAlarmApiKeyTest({
      apiKey: 'test-token',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('ERD OK mas CAP inacessível → ainda PASS (o token é o que o teste diagnostica)', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/collections/warnings/locations/PT')) return json(edrDoc());
      return json({}, 500); // storage CAP falha
    });
    const code = await runMeteoAlarmApiKeyTest({
      apiKey: 'test-token',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(0);
  });
});
