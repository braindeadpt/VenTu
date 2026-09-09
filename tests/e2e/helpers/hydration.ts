import type { Page } from '@playwright/test';

/**
 * Wait until React has hydrated the app shell (header, drawer, theme toggle
 * and form handlers attached). Pre-hydration taps are silently swallowed —
 * the onClick handlers don't exist yet — which produced CI-only flakes:
 * local hydration beats the first tap, a loaded 2-core runner does not.
 * `domcontentloaded` says nothing about hydration; the beacon does
 * (src/components/HydrationBeacon.tsx sets html[data-hydrated] on commit).
 *
 * Call after every page.goto()/reload() that is followed by an interaction.
 */
export async function waitHydrated(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 30_000 });
}
