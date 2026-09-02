import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runEcowittApiKeyTest } = require('../../test-ecowitt-api-key.js');

afterEach(() => {
  delete process.env.ECOWITT_APPLICATION_KEY;
  delete process.env.ECOWITT_API_KEY;
  delete process.env.ECOWITT_MAC;
  vi.unstubAllGlobals();
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const silentLog = { log: () => {}, error: () => {}, warn: () => {} };

const NOW = new Date().toISOString();

/** Resposta típica do /device/info (application_key válida resolve a estação). */
const infoDoc = () => ({
  code: 0,
  data: { latitude: 38.732, longitude: -9.472, name: 'Casa Teste' },
});

/** Resposta típica do /device/real_time (wind + outdoor, timestamp fresco). */
const realTimeDoc = () => ({
  code: 0,
  time: NOW,
  data: {
    wind: {
      wind_speed: { value: 4.2 },
      wind_direction: { value: 315 },
    },
    outdoor: { temperature: { value: 19.5 } },
  },
});

const CREDS = {
  application_key: 'app-key',
  api_key: 'api-key',
  mac: 'AA:BB:CC:DD:EE:FF',
};

/** Mock fetch que responde /device/info e /device/real_time. */
function ecowittFetchMock({ info = infoDoc(), realTime = realTimeDoc() } = {}) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/device/info')) return json(info);
    if (u.includes('/device/real_time')) return json(realTime);
    return json({}, 404);
  });
}

describe('runEcowittApiKeyTest — caminho PASS', () => {
  it('credenciais → device/info → real_time fresco → exit 0', async () => {
    const fetchMock = ecowittFetchMock();
    const code = await runEcowittApiKeyTest({
      creds: CREDS,
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(0);
    // As credenciais foram enviadas nos dois endpoints (application_key + api_key).
    for (const call of fetchMock.mock.calls) {
      const u = String(call[0]);
      expect(u).toContain('application_key=app-key');
      expect(u).toContain('api_key=api-key');
    }
    expect(String(fetchMock.mock.calls[0][0])).toContain('/device/info');
  });

  it('real_time com vento a 0 m/s (calmaria) ainda passa', async () => {
    const realTime = {
      code: 0,
      time: NOW,
      data: {
        wind: {
          wind_speed: { value: 0 },
          wind_direction: { value: 0 },
        },
      },
    };
    const code = await runEcowittApiKeyTest({
      creds: CREDS,
      fetchImpl: ecowittFetchMock({ realTime }),
      log: silentLog,
    });
    expect(code).toBe(0);
  });

  it('real_time sem vento → exit 0 (key válida; estação sem sensor de vento)', async () => {
    const realTime = { code: 0, time: NOW, data: { outdoor: { temperature: { value: 19 } } } };
    const warn = vi.fn();
    const code = await runEcowittApiKeyTest({
      creds: CREDS,
      fetchImpl: ecowittFetchMock({ realTime }),
      log: { ...silentLog, warn },
    });
    expect(code).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('leitura antiga (>3h) → exit 0 (key válida; payload velho, fallback IPMA/METAR)', async () => {
    const stale = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const warn = vi.fn();
    const code = await runEcowittApiKeyTest({
      creds: CREDS,
      fetchImpl: ecowittFetchMock({
        realTime: {
          code: 0,
          time: stale,
          data: { wind: { wind_speed: { value: 3 }, wind_direction: { value: 90 } } },
        },
      }),
      log: { ...silentLog, warn },
    });
    expect(code).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe('runEcowittApiKeyTest — caminho FAIL', () => {
  it('sem ECOWITT_* → exit 1 com instruções', async () => {
    const code = await runEcowittApiKeyTest({ creds: null, log: silentLog });
    expect(code).toBe(1);
  });

  it('application_key inválida (code ≠ 0) → exit 1', async () => {
    const code = await runEcowittApiKeyTest({
      creds: CREDS,
      fetchImpl: ecowittFetchMock({ info: { code: 4002, msg: 'Invalid key' } }),
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('MAC errado (device/info 401) → exit 1', async () => {
    const code = await runEcowittApiKeyTest({
      creds: CREDS,
      fetchImpl: ecowittFetchMock({ info: json({}, 401) }),
      log: silentLog,
    });
    expect(code).toBe(1);
  });
});
