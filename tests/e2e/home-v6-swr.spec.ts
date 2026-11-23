import { test, expect } from '@playwright/test';
import { FORECASTS_MAQUETE, abreHome } from './helpers/homeV6';

/**
 * P2.2 — SWR da home sem o cookie `ventu_live`.
 *
 * Com bake, a home NÃO descarrega as ~19 séries de forecast no carregamento
 * (regressão do Lighthouse: `total-byte-weight` 2089 KB > 2048 KB quando o
 * tick imediato baixava tudo). A revalidação começa no intervalo de 15 min
 * ou no regresso ao visível — e só se o último refresh tiver ≥ 5 min.
 *
 * O padrão é o do map-stable-view: `Date.now` da página com offset de
 * +6 min (desvio constante — o tempo continua a andar) e um dispatch de
 * `visibilitychange`; a página já está visível em headless, não é preciso
 * forçar `hidden`/`visibilityState`.
 */

const RE_FORECASTS = /\/data\/forecasts\/([a-z0-9-]+)\.json(\?.*)?$/;

async function registaRotas(page: import('@playwright/test').Page) {
  const pedidos: string[] = [];
  await page.route(RE_FORECASTS, (route) => {
    const id = RE_FORECASTS.exec(route.request().url())![1];
    pedidos.push(id);
    const body = FORECASTS_MAQUETE[id];
    if (!body) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  return pedidos;
}

test.describe('Home v6 — SWR (P2.2)', { tag: '@core' }, () => {
  // O SW serve /data/* do cache e os pedidos nunca chegam ao page.route.
  test.use({ serviceWorkers: 'block' });

  test('sem fetch de forecasts no carregamento; regresso <5 min não revalida; ≥5 min revalida', async ({
    page,
  }) => {
    const pedidos = await registaRotas(page);
    await abreHome(page, '/pt/');

    // O bake já é o conteúdo «stale» do SWR: zero pedidos de série ao abrir.
    expect(pedidos).toEqual([]);

    // Regresso ao visível <5 min depois do mount (Date real) — sem revalidação.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    expect(pedidos).toEqual([]);

    // O mesmo regresso com o Date da página +6 min à frente já revalida
    // (desvio constante do map-stable-view — o tempo continua a andar).
    await page.evaluate(() => {
      const real = Date.now.bind(Date);
      Date.now = () => real() + 6 * 60 * 1000;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => pedidos.length, { timeout: 10_000 }).toBeGreaterThan(0);
  });
});
