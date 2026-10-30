import { test, expect, type Locator, type Page } from '@playwright/test';
import { abreHome, fixtureMaquete } from './helpers/homeV6';

/**
 * Créditos de foto no telemóvel (home e spot v6).
 *
 *  - < 640 px: a linha «Foto: … / …» tapava a foto; fica uma pílula «©» (24 × 24, área de toque
 *    ≥ 44 × 44, nome acessível a partir do rótulo) no mesmo canto; tocar abre o mesmo crédito,
 *    com as duas ligações (utm no Unsplash), dentro do contentor; a linha antiga fica escondida;
 *  - ≥ 640 px: tudo como antes (a linha de texto visível, sem pílula).
 */

const URL_G = '/pt/spots/guincho/';

async function abreSpot(page: Page, url = URL_G) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
  await expect(page.getByTestId('spot-v6')).toBeVisible();
}

/** A pílula está visível, tem o tamanho certo e abre um crédito com 2 ligações dentro do contentor. */
async function verificaPilula(cred: Locator, contentor: Locator) {
  const summary = cred.locator('summary');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAccessibleName(/^Foto: \S/);
  await expect(cred.getByRole('link')).toHaveCount(0); // fechado: sem ligações à vista nem na árvore
  const toque = (await summary.boundingBox())!;
  expect(toque.width, 'área de toque ≥ 44').toBeGreaterThanOrEqual(44);
  expect(toque.height, 'área de toque ≥ 44').toBeGreaterThanOrEqual(44);
  const pil = (await summary.locator('span').boundingBox())!;
  expect(Math.round(pil.width)).toBe(24);
  expect(Math.round(pil.height)).toBe(24);
  await expect(summary).toHaveText('©');
  await summary.click();
  await expect(cred).toHaveAttribute('open', '');
  const painel = cred.locator('p');
  await expect(painel).toBeVisible();
  await expect(painel).toContainText(/^Foto: .+ \/ .+/);
  await expect(cred.getByRole('link')).toHaveCount(2);
  for (const a of await cred.getByRole('link').all()) {
    await expect(a).toBeVisible();
    const href = (await a.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https:\/\//);
    // Unsplash pede a atribuição com utm; no Commons a ligação é a página do ficheiro
    const host = new URL(href).hostname;
    if (host === 'unsplash.com' || host.endsWith('.unsplash.com')) expect(href).toMatch(/utm_source=ventu&utm_medium=referral/);
    await expect(a).toHaveAttribute('target', '_blank');
  }
  const p = (await painel.boundingBox())!;
  const c = (await contentor.boundingBox())!;
  expect(p.x, 'painel dentro do contentor (esq.)').toBeGreaterThanOrEqual(c.x);
  expect(p.x + p.width, 'painel dentro do contentor (dir.)').toBeLessThanOrEqual(c.x + c.width + 0.5);
  expect(p.width).toBeLessThanOrEqual(260.5);
  // tocar outra vez fecha
  await summary.click();
  await expect(cred).not.toHaveAttribute('open', '');
}

test.describe('créditos de foto — 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('home: pílula «©» no hero e nos cartões, abre o crédito com ligações; a linha antiga fica escondida', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    const hero = page.getByTestId('home-hero');
    await expect(hero.getByTestId('foto-credito')).toBeHidden();
    await verificaPilula(hero.getByTestId('foto-credito-m'), hero);
    await expect(hero.getByTestId('foto-credito-m')).toContainText('Alvesgaspar');
    const cartoes = await page.getByTestId('home-cartao').all();
    expect(cartoes.length).toBeGreaterThan(0);
    for (const c of cartoes) {
      await expect(c.getByTestId('foto-credito')).toBeHidden();
      await verificaPilula(c.getByTestId('foto-credito-m'), c);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('home: a pílula do cartão não abre o spot (o toque fica no crédito)', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    const url = page.url();
    const cred = page.getByTestId('home-cartao').first().getByTestId('foto-credito-m');
    await cred.locator('summary').click();
    await expect(cred).toHaveAttribute('open', '');
    expect(page.url()).toBe(url);
  });

  test('spot: pílula «©» no hero, abre o crédito com ligações (Commons no kite, Unsplash no surf)', async ({ page }) => {
    await abreSpot(page, `${URL_G}?d=kite`);
    const hero = page.locator('[data-testid="spot-v6"] .hero');
    await expect(hero.getByTestId('foto-credito')).toBeHidden();
    const cred = hero.getByTestId('foto-credito-m');
    await verificaPilula(cred, hero);
    await expect(cred).toContainText('CC BY-SA 3.0');
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Surf' }).click();
    await cred.locator('summary').click();
    await expect(cred).toContainText('Unsplash');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('a pílula tem foco visível pelo teclado e abre com Enter', async ({ page }) => {
    await abreSpot(page);
    const cred = page.locator('[data-testid="spot-v6"] .hero').getByTestId('foto-credito-m');
    await cred.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(cred).toHaveAttribute('open', '');
    const outline = await cred.locator('summary span').evaluate((e) => getComputedStyle(e).outlineStyle);
    expect(outline).toBe('solid');
  });
});

test.describe('créditos de foto — ≥ 640 px sem mudança', () => {
  for (const w of [640, 1440]) {
    test(`${w}: a linha de texto de sempre, sem pílula`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await fixtureMaquete(page);
      await abreHome(page, '/pt/', { maquete: true });
      const hero = page.getByTestId('home-hero');
      await expect(hero.getByTestId('foto-credito')).toBeVisible();
      await expect(hero.getByTestId('foto-credito')).toContainText('Foto: Alvesgaspar / Commons, CC BY-SA 3.0');
      await expect(hero.getByTestId('foto-credito-m')).toBeHidden();
      for (const c of await page.getByTestId('home-cartao').all()) {
        await expect(c.getByTestId('foto-credito')).toBeVisible();
        await expect(c.getByTestId('foto-credito-m')).toBeHidden();
      }
      await abreSpot(page);
      const sh = page.locator('[data-testid="spot-v6"] .hero');
      await expect(sh.getByTestId('foto-credito')).toBeVisible();
      await expect(sh.getByTestId('foto-credito-m')).toBeHidden();
    });
  }
});
