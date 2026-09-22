/**
 * Paginação do PostgREST no evaluate-alerts (auditoria M6).
 *
 * O PostgREST corta ao default de 1000 rows sem header `Range` — sem
 * paginação, assinantes/alertas acima desse limite deixavam de ser servidos
 * em silêncio. Estes testes fixam: página completa -> pede a seguinte;
 * página incompleta -> para; 404 -> missing (só onde é permitido).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { fetchAllRows, SUPABASE_PAGE_SIZE } = require('../../evaluate-alerts.js');

function jsonRes(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const calls = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('evaluate-alerts — paginação PostgREST', () => {
  it('pagina até à última página incompleta e envia Range em cada pedido', async () => {
    const firstPage = Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => ({ id: i }));
    const secondPage = [{ id: SUPABASE_PAGE_SIZE }, { id: SUPABASE_PAGE_SIZE + 1 }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts = {}) => {
        calls.push({ url: String(url), range: opts.headers?.Range });
        return calls.length === 1 ? jsonRes(firstPage) : jsonRes(secondPage);
      }),
    );

    const { rows, missing } = await fetchAllRows('alert_subscriptions', 'active=eq.true&select=*');

    expect(missing).toBe(false);
    expect(rows).toHaveLength(SUPABASE_PAGE_SIZE + 2);
    expect(calls).toHaveLength(2);
    expect(calls[0].range).toBe(`0-${SUPABASE_PAGE_SIZE - 1}`);
    expect(calls[1].range).toBe(`${SUPABASE_PAGE_SIZE}-${2 * SUPABASE_PAGE_SIZE - 1}`);
  });

  it('uma página curta pára logo no primeiro pedido', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      calls.push({ url: String(url), range: opts.headers?.Range });
      return jsonRes([{ id: 1 }]);
    }));

    const { rows } = await fetchAllRows('user_alert_prefs', 'active=eq.true&select=*');

    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('404 devolve missing só quando allow404 (tabela opcional)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ message: 'not found' }, 404)));

    const optional = await fetchAllRows('user_alert_prefs', 'select=*', { allow404: true });
    expect(optional).toEqual({ rows: [], missing: true });

    await expect(fetchAllRows('alert_subscriptions', 'select=*')).rejects.toThrow(
      /Supabase fetch failed \(alert_subscriptions\): 404/,
    );
  });

  it('falha ruidosamente quando a resposta não é um array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ message: 'oops' })));
    await expect(fetchAllRows('alert_subscriptions', 'select=*')).rejects.toThrow(/não-array/);
  });
});
