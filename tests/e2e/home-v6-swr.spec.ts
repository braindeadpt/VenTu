import { test, expect } from '@playwright/test';
import { FORECASTS_MAQUETE, AGORA_MAQUETE, abreHome } from './helpers/homeV6';

/**
 * P2.2 — SWR da home sem o cookie `ventu_live`.
 *
 * Com bake, a home NÃO descarrega as ~19 séries de forecast no carregamento
 * (regressão do Lighthouse: `total-byte-weight` 2089 KB > 2048 KB quando o
 * tick imediato baixava tudo). A revalidação começa no intervalo de 15 min
 * ou no regresso ao visível — e só se o último refresh tiver ≥ 5 min.
 *
 * O relógio do Playwright (`page.clock`) controla Date e timers da página,
 * pelo que a cadência é testada de forma determinística; `visibilityState`
 * é forçado via defineProperty porque o browser não o expõe a escrita.
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

async function voltaAoVisivel(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Home v6 — SWR (P2.2)', { tag: '@core' }, () => {
  test('sem fetch de forecasts no carregamento; regresso <5 min não revalida; ≥5 min revalida', async ({
    page,
  }) => {
    const pedidos = await registaRotas(page);
    await page.clock.setFixedTime(AGORA_MAQUETE);
    await abreHome(page, '/pt/');

    // O bake já é o conteúdo «stale» do SWR: zero pedidos de série ao abrir.
    expect(pedidos).toEqual([]);

    // Regresso ao visível com <5 min desde o mount — ainda nada.
    await page.clock.tick(4 * 60 * 1000);
    await voltaAoVisivel(page);
    await page.waitForTimeout(300);
    expect(pedidos).toEqual([]);

    // Passados ≥5 min, o regresso dispara a revalidação das séries.
    await page.clock.tick(2 * 60 * 1000);
    await voltaAoVisivel(page);
    await expect.poll(() => pedidos.length, { timeout: 10_000 }).toBeGreaterThan(0);
  });
});
