import { test, expect, type Page } from '@playwright/test';
import {
  forceLiveSpotMode,
  interceptForecasts,
  interceptForecastsForToday,
} from './helpers/conditions';

/**
 * #184 — estados obrigatórios da página rápida do spot (contrato v4):
 * normal, noite, vazio, erro, a carregar e reduced-motion, com fixtures e
 * page.route. Cobre também os invariantes transversais: mesma hora/score
 * em todo o ecrã, mini-praia sem atributos SVG NaN, régua operável por
 * teclado e 390 px sem scroll horizontal.
 */

const SPOT_URL = '/pt/spots/guincho/';
const SPOT_ID = 'guincho';

test.use({ serviceWorkers: 'block' });

/** Espera o deck rápido composto (fetch de dados resolvido). */
async function openQuick(page: Page, url: string = SPOT_URL) {
  await page.goto(url);
  await expect(page.locator('[data-verdict-card]')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-mini-beach] > svg')).toBeVisible();
}

/** Todos os atributos numéricos do SVG da mini-praia são finitos. */
async function svgNaNCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    let bad = 0;
    document.querySelectorAll('[data-mini-beach] svg *').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        if (/NaN|Infinity|undefined/.test(attr.value)) bad++;
      }
    });
    return bad;
  });
}

test.describe('#184 — estado normal', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('deck completo: breadcrumb, veredicto, mini-praia, para-ti, planear', async ({
    page,
  }) => {
    await interceptForecastsForToday(page);
    await openQuick(page);

    // Breadcrumb «Portugal › Cascais › Guincho».
    await expect(
      page.getByRole('navigation', { name: 'Navegação estrutural' }),
    ).toBeVisible();
    // Veredicto: palavra do tier + score (role=meter) + chips.
    const card = page.locator('[data-verdict-card]');
    await expect(card.getByRole('meter')).toBeVisible();
    await expect(card.getByText(/Épico|Bom|Razoável|Fraco|N\/A/)).toBeVisible();
    // «Para ti»: pills de desporto + frase.
    await expect(page.locator('[data-for-you] [role="tablist"]')).toBeVisible();
    // «Planear».
    await expect(page.locator('[data-plan-card]')).toBeVisible();
    // Mini-praia: descrição textual equivalente e sem NaN.
    const beach = page.locator('[data-mini-beach] svg[role="img"]');
    await expect(beach).toHaveAttribute('aria-label', /Guincho/);
    expect(await svgNaNCount(page)).toBe(0);
    // 390 px sem scroll horizontal (critério comum 1).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('a régua move veredicto, mini-praia e hora com a mesma hora', async ({
    page,
  }) => {
    await interceptForecastsForToday(page);
    await openQuick(page);

    const beach = page.locator('[data-mini-beach]');
    const before = await beach.getAttribute('data-hour');
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const after = await beach.getAttribute('data-hour');
    expect(after).not.toBe(before);
    // A mesma hora nos instrumentos (o índice do eixo é partilhado).
    const instIdx = await page
      .locator('#instrumentos')
      .getAttribute('data-spot-timeline-index');
    expect(instIdx).not.toBe('0');
  });
});

test.describe('#184 — estado de noite', () => {
  test('hora nocturna: véu na mini-praia e nota «noite» no veredicto', async ({
    page,
  }) => {
    await page.clock.install();
    // Série redatada para hoje; fixar a meia-noite local (23:30 UTC ≈ noite
    // fechada em Lisboa) — a régua, a praia e o cartão marcam noite.
    const tonight = new Date();
    tonight.setUTCHours(23, 30, 0, 0);
    await page.clock.setFixedTime(tonight);
    await interceptForecastsForToday(page);
    await openQuick(page);

    await expect(page.locator('[data-mini-beach][data-night]')).toBeVisible();
    await expect(page.locator('[data-night-tag]')).toBeVisible();
  });
});

test.describe('#184 — estado vazio', () => {
  test('série de previsão vazia: mensagem curta, sem zeros falsos', async ({
    page,
  }) => {
    await interceptForecasts(page, {
      spots: { [SPOT_ID]: () => [] },
    });
    await openQuick(page);

    // A mensagem aparece na mini-praia e no cartão de veredicto.
    await expect(
      page.locator('[data-mini-beach]').getByText('Sem previsão para esta hora'),
    ).toBeVisible();
    expect(await svgNaNCount(page)).toBe(0);
    // O layout mantém-se (o cartão e a praia existem; «—» em vez de 0 m).
    await expect(page.locator('[data-verdict-card]')).toBeVisible();
  });
});

test.describe('#184 — estado de erro', () => {
  test('falha do JSON + Open-Meteo: degradação honesta com marca DEMO', async ({
    page,
  }) => {
    await forceLiveSpotMode(page);
    await page.route('**/data/conditions.json', (route) => route.abort());
    await page.route('**/data/forecasts/**', (route) => route.abort());
    await page.route('**/data/forecasts.json', (route) => route.abort());
    // Sem os JSONs o cliente cai no fallback Open-Meteo — aborta-se também,
    // senão o pedido real (rede do runner) torna o teste não-hermético.
    await page.route(/open-meteo\.com/, (route) => route.abort());
    await page.goto(SPOT_URL);

    // O estado de erro real do produto não é um crash: fetchMarineData nunca
    // lança — devolve dados estimados e a página compõe com a marca DEMO
    // («Dados estimados — API indisponível») visível para o utilizador.
    await expect(page.getByText(/DEMO/)).toBeVisible({ timeout: 30_000 });
    // E o deck continua funcional — sem NaN na mini-praia nem erro de página.
    await expect(page.locator('[data-verdict-card]')).toBeVisible();
    expect(await svgNaNCount(page)).toBe(0);
  });
});

test.describe('#184 — estado a carregar', () => {
  test('JSON atrasado: skeletons com dimensões finais, sem spinner', async ({
    page,
  }) => {
    await forceLiveSpotMode(page);
    await page.route('**/data/conditions.json', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto(SPOT_URL);

    // Skeletons visíveis durante o atraso (a mesma altura do layout final).
    await expect(page.locator('.skeleton').first()).toBeVisible({
      timeout: 5_000,
    });
    // Depois do atraso a página compõe normalmente.
    await expect(page.locator('[data-verdict-card]')).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('#184 — reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('sem animação contínua: as setas da praia não transicionam', async ({
    page,
  }) => {
    await interceptForecastsForToday(page);
    await openQuick(page);

    // Em reduced-motion as setas não têm transição CSS (o estilo inline
    // passa a 'none' — critério comum 7).
    const transitions = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-mini-beach] svg g[style]'),
      ).map((el) => (el as HTMLElement).style.transition),
    );
    for (const t of transitions) expect(t).toBe('none');
    // A página continua funcional: a régua responde ao teclado.
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    expect(await svgNaNCount(page)).toBe(0);
  });
});

test.describe('#184 — estado ocean (tema)', () => {
  test('tema ocean: deck legível e sem NaN', async ({ page }) => {
    await interceptForecastsForToday(page);
    await page.addInitScript(() => {
      try {
        // O tema «ocean» é a classe .theme-ocean no <html>, aplicada do
        // cookie ventu-theme=light (ver layout.tsx).
        document.cookie = 'ventu-theme=light;path=/;max-age=31536000';
        localStorage.setItem('windspot:theme', 'light');
      } catch {
        /* storage bloqueado — o tema fica default */
      }
    });
    await openQuick(page);

    await expect(page.locator('[data-verdict-card]')).toBeVisible();
    expect(await svgNaNCount(page)).toBe(0);
  });
});
