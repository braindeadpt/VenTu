import { test, expect } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * Vento nos marcadores — UX v3 (M4).
 *
 * No /mapa o anel `.ventu-wind-ring` foi substituído pelo tique compacto
 * `[data-wind-tick]` da maquete aprovada: uma seta pequena que sopra PARA a
 * direcção indicada, desenhada no marcador completo. O tique só aparece
 * quando o toggle «Vento nos marcadores» está ligado E o zoom é ≥ 8.5 —
 * abaixo disso o marcador de 34 px não tem espaço para o indicador.
 *
 * Os anéis clássicos continuam a existir nos marcadores fora do modo
 * Explorar (embeds), cobertos indirectamente pelas specs do hero.
 */
test.describe('Map wind tick markers (v3)', () => {
  test.describe.configure({ timeout: 60_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  async function openMapa(
    page: import('@playwright/test').Page,
    wind: string,
  ): Promise<void> {
    await preseedWindRingLegend(page);
    await page.addInitScript((w) => {
      localStorage.setItem('ventu.mapdebug', '1');
      localStorage.setItem('ventu.map.wind', w);
    }, wind);
    await page.goto('/pt/mapa/?sport=all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('[data-v3spot]', { timeout: 30_000 });
    await page.waitForFunction(
      () => (window as unknown as { __VENTU_MAP__?: unknown }).__VENTU_MAP__ != null,
      undefined,
      { timeout: 20_000 },
    );
  }

  async function zoomToPeniche(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => {
      const map = (window as unknown as {
        __VENTU_MAP__?: { setView(c: [number, number], z: number): void; once(ev: string, cb: () => void): void };
      }).__VENTU_MAP__;
      return new Promise<void>((resolve) => {
        map?.once('zoomend', () => resolve());
        map?.setView([39.36, -9.38], 11);
        setTimeout(resolve, 4000);
      });
    });
    // O LOD re-corre no zoomend — espera os tiques aparecerem.
    await page.waitForTimeout(500);
  }

  test('o tique de vento aparece nos marcadores completos a zoom ≥8.5', async ({ page }) => {
    await openMapa(page, '1');

    // Zoom nacional (<8.5): sem tique — o marcador de 34 px não tem espaço.
    await page.waitForTimeout(500);
    expect(await page.locator('[data-wind-tick]').count()).toBe(0);
    // Sem anéis nem setas do desenho anterior nesta superfície.
    expect(await page.locator('.ventu-wind-ring').count()).toBe(0);
    expect(await page.locator('.ventu-wind-wedge').count()).toBe(0);

    await zoomToPeniche(page);
    const ticks = page.locator('[data-wind-tick]');
    await expect(ticks.first()).toBeAttached({ timeout: 15_000 });
    const count = await ticks.count();
    expect(count).toBeGreaterThan(5);

    // Cada tique vive num marcador completo e tem uma rotação definida.
    const sample = await page.evaluate(() => {
      const tick = document.querySelector<HTMLElement>('[data-wind-tick]');
      const marker = tick?.closest<HTMLElement>('[data-v3spot]');
      if (!tick || !marker) return null;
      return {
        kind: marker.dataset.v3kind ?? '',
        rotate: /rotate\(\s*-?\d+(?:\.\d+)?deg\)/.test(tick.style.transform),
        hasScore: Number(marker.dataset.spotScore) >= 0,
      };
    });
    expect(sample).not.toBeNull();
    expect(sample!.kind).toBe('full');
    expect(sample!.rotate).toBe(true);
    expect(sample!.hasScore).toBe(true);
  });

  test('com o toggle desligado não há tiques mesmo a zoom alto', async ({ page }) => {
    await openMapa(page, '0');
    await zoomToPeniche(page);
    await page.waitForTimeout(500);
    expect(await page.locator('[data-wind-tick]').count()).toBe(0);
  });
});
