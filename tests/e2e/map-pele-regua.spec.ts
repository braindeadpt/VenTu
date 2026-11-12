import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { interceptMapHours } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';
import { MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa, PR B3 — régua de 48 h na pele v6: células com a nota /10 no
 * fill da banda, «–» em #56677B pelos `null` do motor e a pill «Noite · …» com a
 * lua. O range invisível e os `data-map-hours-*` não mudam (paridade #17/#56);
 * sem a pele, a régua de hoje, sem um único `data-mr`.
 */

// 16 passos de 3 h ancorados em Lisboa (o mesmo desenho do harness de paridade).
const lisboa = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  })
    .formatToParts(new Date())
    .filter((x) => x.type !== 'literal')
    .map((x) => [x.type, x.value]),
);
const diaLisboa = (desvio: number) =>
  new Date(Date.UTC(Number(lisboa.year), Number(lisboa.month) - 1, Number(lisboa.day) + desvio))
    .toISOString()
    .slice(0, 10);
const horaAgora = Number(lisboa.hour) % 24;
const recua = (horaAgora - 2 + 24) % 3;
const TIMES_48H = Array.from({ length: 16 }, (_, i) => {
  const total = horaAgora - recua + i * 3;
  const dia = Math.floor(total / 24);
  return `${diaLisboa(dia)}T${String(((total % 24) + 24) % 24).padStart(2, '0')}:00`;
});
/** Guincho: kitesurf 6/10 em todos os passos menos o 4.º (noite, `null`). */
const KITE = TIMES_48H.map((_, i) => (i === 3 ? null : 60));
const HOURS_STUB = {
  generatedAt: new Date().toISOString(),
  stepHours: 3,
  times: TIMES_48H,
  sports: ['surf', 'kitesurf'],
  spots: { guincho: { best: KITE, surf: KITE, kitesurf: KITE } },
};

async function abre(page: Page, on: boolean): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ key, on }) => {
      if (on) localStorage.setItem(key, 'v6');
      else localStorage.setItem(key, 'off');
      localStorage.setItem('ventu.map.cluster', '0');
      localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
    },
    { key: MAP_PELE_LS_KEY, on },
  );
  await interceptMapHours(page, HOURS_STUB);
  await page.goto('/pt/mapa/?sport=kitesurf&hours=1&lat=38.73&lon=-9.47&z=11', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await expect(page.locator('[data-map-time-track-mode="hours"]')).toBeVisible({ timeout: 20_000 });
}

const barras = (page: Page) => page.locator('[data-map-hours-scrubber] [data-mr="r-bar"]');

for (const vp of [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: '390', viewport: { width: 390, height: 844 } },
]) {
  test.describe(`/mapa pele v6 — régua de 48 h (B3), ${vp.nome}`, () => {
    test.describe.configure({ timeout: 90_000 });
    test.use({ viewport: vp.viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('células /10 na banda, «–» de noite em #56677B, passo seleccionado', async ({ page }) => {
      await abre(page, true);
      const b = barras(page);
      await expect(b).toHaveCount(16, { timeout: 15_000 });
      await expect(b.nth(0)).toHaveText('6');
      await expect(b.nth(0)).toHaveAttribute('data-tier', 'fair');
      await expect(b.nth(3)).toHaveText('–');
      await expect(b.nth(3)).toHaveAttribute('data-noite', '');
      expect(await b.nth(3).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(86, 103, 123)');
      // altura cheia e opaca (a régua de hoje desenha a barra por % e a 0,32 fora do passo)
      const [alt, op] = await b.nth(5).evaluate((el) => [
        el.getBoundingClientRect().height,
        getComputedStyle(el).opacity,
      ]);
      expect(alt).toBeGreaterThanOrEqual(vp.nome === '390' ? 34 : 42);
      expect(op).toBe('1');
      const range = page.locator('[data-map-hours-scrubber] input[type="range"]');
      await expect(page.locator('[data-mr="r-c"]').nth(0)).toHaveAttribute('data-on', '');
      await range.fill('5');
      await expect(page.locator('[data-mr="r-c"][data-on]')).toHaveCount(1);
      await expect(page.locator('[data-mr="r-c"]').nth(5)).toHaveAttribute('data-on', '');
      await expect(range).toHaveAttribute('aria-valuetext', /melhor score na vista 6$/);
    });

    test('pill «Noite · …» com a lua no passo de noite', async ({ page }) => {
      await abre(page, true);
      const pill = page.locator('[data-map-time-pill]');
      await expect(pill.locator('[data-mr="pl-noite"]')).toHaveCount(0);
      await page.locator('[data-map-hours-scrubber] input[type="range"]').fill('3');
      await expect(pill.locator('[data-mr="pl-noite"]')).toHaveText('Noite', { timeout: 10_000 });
      await expect(pill).toHaveText(/Noite · .*\d/);
      await expect(page.locator('[data-map-hours-scrubber] input[type="range"]')).toHaveAttribute(
        'aria-valuetext',
        /noite, sem nota$/,
      );
    });

    test('sem a pele: a régua de hoje, sem ganchos data-mr', async ({ page }) => {
      await abre(page, false);
      await expect(page.locator('[data-map-hours-scrubber] input[type="range"]')).toHaveAttribute('max', '15');
      await expect(page.locator('[data-mr]')).toHaveCount(0);
      await page.locator('[data-map-hours-scrubber] input[type="range"]').fill('3');
      await expect(page.locator('[data-map-time-pill]')).not.toContainText('Noite');
    });
  });
}

/* B3.5 — os passos agrupados por dia («HOJE · AMANHÃ · …»), com o 1.º grupo no passo 0, e o
   triângulo espuma sobre o passo seleccionado (só desktop). Sem a pele, nenhum dos dois. */
for (const vp of [
  { nome: 'desktop', viewport: { width: 1440, height: 900 }, triangulo: true },
  { nome: '390', viewport: { width: 390, height: 844 }, triangulo: false },
]) {
  test.describe(`/mapa pele v6 — régua por dia (B3.5), ${vp.nome}`, () => {
    test.describe.configure({ timeout: 90_000 });
    test.use({ viewport: vp.viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });

    test('rótulos de dia por cima das células e triângulo no passo', async ({ page }) => {
      await abre(page, true);
      await expect(barras(page)).toHaveCount(16, { timeout: 15_000 });
      const dias = page.locator('[data-map-hours-scrubber] [data-mr="r-dn"]');
      const nDias = new Set(TIMES_48H.map((x) => x.slice(0, 10))).size;
      await expect(dias).toHaveCount(nDias);
      await expect(dias.nth(0)).toHaveText(/hoje/i);
      if (nDias > 1) await expect(dias.nth(1)).toHaveText(/amanhã/i);
      // Cada rótulo começa por cima da 1.ª célula do seu dia (mesma grelha de 16 colunas).
      const cel = page.locator('[data-map-hours-scrubber] [data-mr="r-c"]');
      const x0 = (await dias.nth(0).boundingBox())!.x;
      const c0 = (await cel.nth(0).boundingBox())!.x;
      expect(Math.abs(x0 - c0)).toBeLessThanOrEqual(2);
      const tri = await page
        .locator('[data-map-hours-scrubber] [data-mr="r-c"][data-on]')
        .evaluate((el) => getComputedStyle(el, '::before').display);
      if (vp.triangulo) expect(tri).not.toBe('none');
      else expect(tri).toBe('none');
    });

    test('sem a pele: sem rótulos de dia', async ({ page }) => {
      await abre(page, false);
      await expect(page.locator('[data-map-hours-scrubber]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-mr="r-dn"]')).toHaveCount(0);
    });
  });
}
