import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { retryFailedSpots, RETRY_PASS_DELAY_MS, MAX_RETRY_PASSES } = require('../updateConditionsRetryPass.js');

const silentSleep = () => vi.fn(async () => {});
const silentLog = () => ({ warn: vi.fn(), log: vi.fn() });

describe('retryFailedSpots', () => {
  it('sem falhas → não há sleep nem pedidos', async () => {
    const sleep = silentSleep();
    const run = vi.fn(async () => {});
    const out = await retryFailedSpots({ ids: [], run, sleep, log: silentLog() });
    expect(out).toEqual([]);
    expect(sleep).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('tudo recupera na 1.ª passagem → devolve [] e não há 2.ª passagem', async () => {
    const sleep = silentSleep();
    const run = vi.fn(async () => {});
    const out = await retryFailedSpots({ ids: ['a', 'b'], run, sleep, log: silentLog() });
    expect(out).toEqual([]);
    expect(run.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b']);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(RETRY_PASS_DELAY_MS);
  });

  it('parte recupera na 2.ª passagem → só repete os que falharam (sem pedidos extra)', async () => {
    const sleep = silentSleep();
    const log = silentLog();
    const flaky = new Set(['a']); // 'a' falha na 1.ª, recupera na 2.ª
    const run = vi.fn(async (id) => {
      if (flaky.has(id)) {
        flaky.delete(id);
        throw new Error('fetch failed');
      }
    });
    const out = await retryFailedSpots({ ids: ['a', 'b'], run, sleep, log });
    expect(out).toEqual([]);
    // 'a' é pedido 2× (1.ª e 2.ª passagem); 'b' só 1× — nunca se repete quem já passou.
    expect(run.mock.calls.filter(([id]) => id === 'a')).toHaveLength(2);
    expect(run.mock.calls.filter(([id]) => id === 'b')).toHaveLength(1);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(log.log).toHaveBeenCalledWith(expect.stringContaining('🔁 Repetição 1/2'));
    expect(log.log).toHaveBeenCalledWith(expect.stringContaining('🔁 Repetição 2/2'));
  });

  it('nada recupera → devolve os ids ainda em falha (o carry-over trata deles)', async () => {
    const sleep = silentSleep();
    const run = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const out = await retryFailedSpots({ ids: ['a', 'b'], run, sleep, log: silentLog() });
    expect(out).toEqual(['a', 'b']);
    expect(run).toHaveBeenCalledTimes(2 * MAX_RETRY_PASSES);
  });

  it('nunca ultrapassa maxPasses mesmo com tudo em falha', async () => {
    const sleep = silentSleep();
    const run = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const out = await retryFailedSpots({ ids: ['a'], run, sleep, maxPasses: MAX_RETRY_PASSES, log: silentLog() });
    expect(out).toEqual(['a']);
    expect(run).toHaveBeenCalledTimes(MAX_RETRY_PASSES);
    expect(sleep).toHaveBeenCalledTimes(MAX_RETRY_PASSES);
  });
});
