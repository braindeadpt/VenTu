import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runResendApiKeyTest, RESEND_API } = require('../../test-resend-api-key.js');

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  vi.unstubAllGlobals();
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const silentLog = { log: () => {}, error: () => {}, warn: () => {} };

describe('runResendApiKeyTest — caminho PASS', () => {
  it('GET /domains 200 (full-access) → exit 0, key enviada como Bearer', async () => {
    const fetchMock = vi.fn(async () =>
      json({ data: [{ name: 'ventu.surf', status: 'verified' }] }),
    );
    const code = await runResendApiKeyTest({
      apiKey: 're_test123',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${RESEND_API}/domains`);
    expect(init?.headers?.Authorization).toBe('Bearer re_test123');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('GET /domains 401 + send probe 200 (key sending-only) → exit 0 para delete@resend.dev', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith('/domains')) return json({}, 401);
      return json({ id: 'probe-id' }, 200);
    });
    const code = await runResendApiKeyTest({
      apiKey: 're_sendingonly',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(0);
    // O probe vai para o endereço de teste da Resend (descartado, nunca um humano).
    const sendCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/emails'));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse(sendCall[1].body);
    expect(body.to).toEqual(['delete@resend.dev']);
    expect(sendCall[1].headers.Authorization).toBe('Bearer re_sendingonly');
  });
});

describe('runResendApiKeyTest — caminho FAIL', () => {
  it('sem RESEND_API_KEY → exit 1 com instruções', async () => {
    const code = await runResendApiKeyTest({ apiKey: null, log: silentLog });
    expect(code).toBe(1);
  });

  it('GET /domains 401 e send probe 401 (key inválida/expirada) → exit 1', async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/domains') ? json({}, 401) : json({}, 401),
    );
    const code = await runResendApiKeyTest({
      apiKey: 're_expired',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('GET /domains 500 (API em baixo) → exit 1', async () => {
    const fetchMock = vi.fn(async () => json({}, 500));
    const code = await runResendApiKeyTest({
      apiKey: 're_test123',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });

  it('rede falha (fetch lança) → exit 1', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network unreachable');
    });
    const code = await runResendApiKeyTest({
      apiKey: 're_test123',
      fetchImpl: fetchMock,
      log: silentLog,
    });
    expect(code).toBe(1);
  });
});
