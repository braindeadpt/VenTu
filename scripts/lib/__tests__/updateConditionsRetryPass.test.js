import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { retryFailedSpots, RETRY_PASS_DELAY_MS, MAX_RETRY_PASSES, MAX_RETRY_FAILED_SHARE, EARLY_ABORT_STREAK } = require('../updateConditionsRetryPass.js');

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

  it('acima de MAX_RETRY_FAILED_SHARE → falha generalizada: sem sleep nem pedidos, tudo segue para carry-over', async () => {
    const sleep = silentSleep();
    const log = silentLog();
    const run = vi.fn(async () => {});
    // totalPrimarios=8 → teto = ceil(8·0,25) = 2; 3 falhados está acima.
    const ids = Array.from({ length: Math.ceil(8 * MAX_RETRY_FAILED_SHARE) + 1 }, (_, i) => `s${i}`);
    const out = await retryFailedSpots({ ids, run, sleep, totalPrimarios: 8, log });
    expect(out).toEqual(ids);
    expect(sleep).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(`Falha generalizada: 3/8`));
  });

  it('no limite exato (ceil) a repetição corre normalmente', async () => {
    const sleep = silentSleep();
    const run = vi.fn(async () => {});
    // totalPrimarios=8 → teto = 2; 2 falhados está no limite.
    const out = await retryFailedSpots({ ids: ['a', 'b'], run, sleep, totalPrimarios: 8, log: silentLog() });
    expect(out).toEqual([]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('5 falhas seguidas no início da passagem → aborta sem esgotar a lista nem fazer a 2.ª passagem', async () => {
    const sleep = silentSleep();
    const log = silentLog();
    const run = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const out = await retryFailedSpots({ ids, run, sleep, totalPrimarios: 40, log });
    // Aborta ao 5.º pedido — 'f' e 'g' nunca são pedidos.
    expect(run).toHaveBeenCalledTimes(EARLY_ABORT_STREAK);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(out).toEqual(ids);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Outage ainda ativo'));
    expect(log.log).not.toHaveBeenCalledWith(expect.stringContaining('Repetição 2/2'));
  });

  it('aborto precoce não dispara se houver recuperação antes da 5.ª falha', async () => {
    const sleep = silentSleep();
    const run = vi.fn(async (id) => {
      if (id !== 'ok') throw new Error('fetch failed');
    });
    const ids = ['a', 'ok', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const out = await retryFailedSpots({ ids, run, sleep, totalPrimarios: 40, maxPasses: 1, log: silentLog() });
    // 'ok' recupera — os 8 pedidos restantes correm todos na única passagem.
    expect(run).toHaveBeenCalledTimes(ids.length);
    expect(out).toEqual(ids.filter((id) => id !== 'ok'));
  });
});
