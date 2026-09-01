import type { Page } from '@playwright/test';
import { WIND_RING_LEGEND_LS_KEY } from '../../../src/lib/windRingLegend';

/**
 * Suppress the wind-ring legend first-visit coach before any navigation.
 *
 * The coach (SpotMapInteractive, first visit) auto-opens as a fixed centred
 * modal after an idle callback once wind rings are visible — on /mapa and the
 * homepage map-first embed (desktop), where it can cover map UI and intercept
 * clicks (drag, carousel pause, polygon clicks). Every map spec must mark it
 * seen before the first goto; this helper is the single place that does it.
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
