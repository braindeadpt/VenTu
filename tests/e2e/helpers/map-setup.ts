import { expect, type Page } from '@playwright/test';
import { WIND_RING_LEGEND_LS_KEY } from '../../../src/lib/windRingLegend';

/**
 * Suppress the wind-ring legend first-visit coach before any navigation.
 *
 * The coach (SpotMapInteractive, first visit) shows a one-time inline hint
 * after the first marker interaction (non-modal, 12s auto-hide) — see
 * ONBOARDING-MAP.md for the contract. On /mapa and the homepage map-first
 * embed it can cover map UI and intercept clicks, so specs that are NOT
 * testing the coach itself must mark it seen before the first goto; this
 * helper is the single place that does it. (mobile-playtest has its own
 * test that deliberately does NOT preseed, to exercise the first-visit flow.)
 *
 * The key is IMPORTED from src/lib/windRingLegend, so the magic string never
 * diverges between the app and the specs (a hard-coded 'ventu:windRingLegendSeen'
 * here would silently break the preseed if the app key ever changed).
 *
 * Call BEFORE page.goto — addInitScript applies to the next navigation.
 */
export async function preseedWindRingLegend(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* noop — private mode / quota */
    }
  }, WIND_RING_LEGEND_LS_KEY);
}

/**
 * Auditoria 2026-09-16 (C4): as camadas de dados do mapa vivem no menu
 * «Camadas» — abrir o menu antes de aceder a `data-map-*-toggle` das
 * camadas secundárias (hs, sst, correntes, boias, isóbatas, batimetria,
 * seamarks, avisos à navegação, horas no desktop). Há dois triggers no DOM
 * (toolbar do topo + strip do HUD) — `:visible` apanha o da superfície
 * activa. No-op quando o popover já está aberto.
 */
export async function openMapLayersMenu(page: Page): Promise<void> {
  const popover = page.locator('[data-map-layers-popover="true"]');
  if (await popover.isVisible()) return;
  const trigger = page.locator('[data-map-layers-menu]:visible');
  if ((await trigger.count()) === 0) {
    // Sheet mobile (MapExploreSheet): não há menu — as camadas vivem
    // sempre visíveis no estado «half».
    const sheet = page.locator('[data-explore-sheet]');
    if (!(await sheet.count())) return;
    if ((await sheet.getAttribute('data-explore-sheet')) === 'peek') {
      await page.getByRole('button', { name: /Mostrar filtros|Show filters/i }).click();
      await expect(sheet).toHaveAttribute('data-explore-sheet', 'half');
    }
    return;
  }
  await trigger.first().click();
  await popover.waitFor({ state: 'visible', timeout: 10_000 });
}
