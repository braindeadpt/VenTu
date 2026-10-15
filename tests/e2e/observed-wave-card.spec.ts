import { test, expect } from '@playwright/test';
import {
  interceptConditions,
  interceptForecastsForToday,
  interceptWaveBias,
  freshObservedWave,
  type ConditionsTransform,
} from './helpers/conditions';

/**
 * Página de spot v6 (#184) com uma leitura de boia fresca no conditions.json.
 *
 * O antigo cartão «Onda observada» (ObservedWaveCard), os chips IH vs WMO e
 * os selos «Corrigido pela boia» viviam no painel «Agora», na tabela «Hora a
 * hora» e em «Como sabemos», retirados com os duplicados da v6. Fica o que a
 * v6 garante com a fonte observada carregada: régua e selector únicos e
 * operáveis, nota /10, e uma só onda da hora (a do Porquê).
 * (A interceptação vive em tests/e2e/helpers/conditions.ts.)
 */

const SPOT_SLUG = 'guincho';

/** Boia IH fresca (vencedora) + runner-up WMO: o cenário mais carregado do conditions.json. */
const COM_BOIA: ConditionsTransform = {
  spots: {
    guincho: (entry) => ({
      ...entry,
      observedWave: freshObservedWave(),
      observedWaveAlt: {
        waveHeight: 1.6,
        wavePeriod: 10,
        waveDirection: 300,
        stationName: 'Cabo Silleiro',
        stationArea: 'Galiza',
        distanceKm: 56,
        observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
        source: 'wmo-buoy',
      },
      observedWaveMeta: {
        winner: 'ih',
        reason: 'ih-fresh',
        ihAgeHours: 1,
        wmoAgeHours: 5,
        ihDistanceKm: 60,
        wmoDistanceKm: 56,
      },
    }),
  },
};

/**
 * Scroll to the true bottom AFTER the layout settles. The spot page keeps
 * growing after the data fetch lands (measured: scrollHeight grows ~580px
 * after the observed-wave card appears — late images/sections below the
 * hero). Scrolling against a moving `document.body.scrollHeight` targets a
 * page that is still growing, so the hero may not be fully out of view when
 * the sticky bar's IntersectionObserver first fires. Wait for two
 * consecutive stable height samples (250ms apart), then scroll — the hero is
 * then genuinely out of view and the sticky bar activates on merit.
 */
async function scrollToSettledBottom(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const h = document.body.scrollHeight;
      // Sample twice: resolve only when the height is identical across the
      // two reads (layout stopped growing), not merely stable once.
      return new Promise<boolean>((resolve) => {
        const first = h;
        setTimeout(() => resolve(document.body.scrollHeight === first), 250);
      });
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

/**
 * Página de spot v6 (#184): a régua de 48 h substitui a barra unificada. No
 * telemóvel é fixa em baixo (visível em toda a página, por isso desce-se até
 * ao fim); no desktop é sticky no topo enquanto a página v6 está no ecrã, por
 * isso desce-se até logo depois do hero. Devolve a régua já presa.
 */
async function scrollToPinnedRegua(page: import('@playwright/test').Page) {
  const desktop = (page.viewportSize()?.width ?? 1280) >= 1024;
  if (desktop) {
    await page.evaluate(() => {
      const h = document.querySelector('#agora') as HTMLElement;
      window.scrollTo(0, h.getBoundingClientRect().bottom + window.scrollY + 80);
    });
  } else {
    await scrollToSettledBottom(page);
  }
  const regua = page.getByTestId('regua-48h');
  await expect(regua).toBeInViewport({ timeout: 15_000 });
  return regua;
}

async function gotoSpot(page: import('@playwright/test').Page) {
  await interceptConditions(page, COM_BOIA);
  // Hermético: o wave-bias.json REAL existe no build e cobre Cascais — sem
  // este stub o fallback client-side do viés regional entrava no cenário.
  await interceptWaveBias(page, { fetchedAt: null, regions: {} });

  await page.goto(`/pt/spots/${SPOT_SLUG}/`);
  await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Página de spot v6 com leitura de boia no conditions.json', () => {
  // O site regista um service worker (public/sw.js) que serve /data/* do cache
  // e BURLA o page.route — as injecções de conditions.json tornam-se
  // intermitentes quando o SW activa antes do fetch. Bloquear o SW garante
  // que a rota intercepta sempre (causa raiz da flakiness histórica deste spec).
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page }) => {
    await interceptForecastsForToday(page);
  });

  test('régua v6 desktop: selector e nota estáveis e uma só onda da hora (sem duplicados)', async ({ page }) => {
    // Página de spot v6 (#184): a barra unificada deu lugar à régua de 48 h
    // (sticky no topo no desktop) e ao selector Kite · Surf da barra de topo.
    // Com a retirada dos duplicados, «Agora» (#instrumentos), «Hora a hora»
    // (#previsao) e «Como sabemos» (#como-sabemos) saíram: a onda da hora
    // vive só no Porquê, mesmo com a leitura da boia no conditions.json.
    await gotoSpot(page);
    await page.evaluate(() => window.scrollTo(0, 1600));

    // Uma ÚNICA régua e um ÚNICO selector de modalidade — sem duplicação, e
    // nenhum tablist antigo.
    await expect(page.getByRole('slider')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Modalidade', exact: true })).toHaveCount(1);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    // A nota do veredicto continua /10 com a fonte observada carregada.
    const nota = page.locator('#agora [data-testid="spot-veredicto"] .nota');
    await expect(nota).toHaveCount(1);
    await expect(page.locator('#agora').getByText('/100')).toHaveCount(0);

    // Regra de ouro: um só cartão de onda (o do Porquê) e nenhuma das secções antigas.
    await expect(page.locator('[data-fator="onda"]')).toHaveCount(1);
    await expect(page.locator('[data-fator="onda"] .val')).toHaveText(/^\d+,\d/);
    for (const antigo of ['#instrumentos', '#previsao', '#como-sabemos']) {
      await expect(page.locator(antigo)).toHaveCount(0);
    }
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
  });

  test('régua v6 continua presa e operável após scroll (desktop); o selector troca a modalidade', async ({
    page,
  }) => {
    // O que importa ao utilizador: com a régua presa, a hora continua a
    // mudar (nada a cobre) e o selector Kite · Surf continua a trocar a
    // modalidade. O Playwright só completa o clique se o alvo for accionável.
    await gotoSpot(page);
    // Espera pela página viva (hidratada, com os dados do conditions.json
    // interceptado) antes de prender a régua.
    await expect(page.locator('[data-testid="spot-v6"].vivo')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-fator="onda"]')).toBeVisible();

    const regua = await scrollToPinnedRegua(page);
    const box = await regua.boundingBox();
    expect(Math.round(box!.y)).toBe(0); // sticky no topo
    const slider = regua.getByRole('slider');
    const antes = Number(await slider.getAttribute('aria-valuenow'));
    await regua.getByRole('button', { name: 'Hora seguinte' }).click();
    await expect(slider).toHaveAttribute('aria-valuenow', String(antes + 1));

    const grupo = page.getByRole('group', { name: 'Modalidade', exact: true });
    const botoes = grupo.getByRole('button');
    const n = await botoes.count();
    expect(n).toBe(2);
    let activeIdx = -1;
    let targetIdx = -1;
    for (let i = 0; i < n; i++) {
      const p = await botoes.nth(i).getAttribute('aria-pressed');
      if (p === 'true' && activeIdx === -1) activeIdx = i;
      else if (p !== 'true') targetIdx = i;
    }
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const target = botoes.nth(targetIdx);
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect(botoes.nth(activeIdx)).toHaveAttribute('aria-pressed', 'false');
  });
});
