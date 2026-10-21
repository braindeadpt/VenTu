import { test, expect } from '@playwright/test';

/**
 * Home map-first (#183, home v6): o mapa da costa vive ao lado do «VAI.» no desktop e numa
 * faixa depois do top 3 no telemóvel. MapLibre 3D lazy com fallback plano; o selector é só
 * Kite · Surf. #273 (v7 «Porta do mapa»): o cartão inteiro é a porta do /mapa («Explorar o
 * mapa da costa →», com o contexto da home no URL); sem diálogo de ecrã inteiro.
 */
test.describe('Home map-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/');
  });

  test('map hero region with interactive map', async ({ page }) => {
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero).toBeVisible({ timeout: 15_000 });
    await expect(hero.getByLabel(/A costa portuguesa em 3D/i)).toBeVisible({ timeout: 20_000 });
    // o poster dá lugar ao 3D (WebGL2) ou ao mapa plano: nunca fica vazio
    await expect(hero.locator('figure')).toHaveAttribute('data-modo', /^(3d|plano)$/, { timeout: 20_000 });
    await expect(hero.locator('figure')).toHaveAttribute('data-pronto', '1', { timeout: 30_000 });
    await expect(hero.getByTestId('home-rotulos').locator('.rot').first()).toBeVisible({ timeout: 20_000 });
  });

  test('single sport filter row in map hero', async ({ page }) => {
    const sportGroup = page.getByTestId('home-modo').getByRole('group', { name: /Modalidade|Sport/i });
    await expect(sportGroup).toBeVisible({ timeout: 15_000 });
    await expect(sportGroup.getByRole('button')).toHaveCount(2);
    await expect(sportGroup.getByRole('button', { name: 'Kite', exact: true })).toBeVisible();
    await expect(sportGroup.getByRole('button', { name: 'Surf', exact: true })).toBeVisible();
    // sem filtros de região na home
    await expect(page.getByRole('button', { name: 'Algarve', exact: true })).toHaveCount(0);
  });

  test('explorar mapa CTA links to /mapa', async ({ page }) => {
    // #273: a ligação é o próprio cartão do mapa (já não o rodapé da home)
    const link = page.getByTestId('home-mapa').getByRole('link', { name: 'Explorar o mapa da costa' });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute('href', /^\/pt\/mapa\/\?sport=(kitesurf|surf)&.*&de=home$/);
    await expect(page.getByTestId('home-v6-rodape').getByRole('link', { name: /Mapa da costa/i })).toHaveCount(0);
  });
});

test.describe('Home map-first (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('featured hero map strip is not covered and leads to /mapa', async ({ page }) => {
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    const fig = hero.locator('figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-modo', /^(3d|plano)$/, { timeout: 20_000 });
    const box = await fig.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(250);
    // faixa: min(46svh, 380px), mín. 250 (maquete v7)
    expect(box?.height ?? 0).toBeLessThanOrEqual(381);
    // a faixa é uma entrada única: tocar nela leva ao /mapa com o contexto (sem diálogo)
    await expect(hero.getByRole('button', { name: 'Abrir mapa' })).toHaveCount(0);
    const porta = hero.getByRole('link', { name: 'Explorar o mapa da costa' });
    await expect(porta).toHaveAttribute('href', /^\/pt\/mapa\/\?sport=(kitesurf|surf)&.*&z=6\.5&de=home$/);
    await Promise.all([
      page.waitForURL(/\/pt\/mapa\/\?sport=/, { timeout: 30_000 }),
      page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 60),
    ]);
    await expect(page.getByRole('dialog', { name: /Mapa interactivo da costa/i })).toHaveCount(0);
  });
});

test.describe('Home map-first: arranque diferido do 3D (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Lighthouse (run 38819063476): com o MapLibre + relevo a arrancar no load, o 1.º ecrã do
  // desktop pagava 2,7 MB de tiles e ~9 s de main thread (TBT 7,9 s, LCP 4,3 s). O mapa fica
  // em poster até o visitante mexer na página (ou até a página assentar), no mesmo sítio.
  test('poster no carregamento; o 3D arranca quando o visitante mexe, sem mudar de caixa', async ({ page }) => {
    const pesados: string[] = [];
    page.on('request', (r) => {
      if (/elevation-tiles-prod|\/geo\/costa-home\.json|maplibre-gl-worker/.test(r.url())) pesados.push(r.url());
    });
    await page.goto('/pt/', { waitUntil: 'load' });
    await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
    const fig = page.getByRole('region', { name: /Mapa interactivo/i }).locator('figure');
    const antes = await fig.boundingBox();
    await page.waitForTimeout(1000);
    await expect(fig).toHaveAttribute('data-modo', 'poster');
    expect(pesados).toEqual([]);
    await page.mouse.move(720, 450);
    await expect(fig).toHaveAttribute('data-modo', /^(3d|plano)$/, { timeout: 20_000 });
    await expect(fig).toHaveAttribute('data-pronto', '1', { timeout: 30_000 });
    expect(await fig.boundingBox()).toEqual(antes);
    expect(pesados.length).toBeGreaterThan(0);
  });
});
