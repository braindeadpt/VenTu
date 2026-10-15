import { test, expect } from '@playwright/test';
import { alignClockToForecast } from './helpers/conditions';

/** First entry in `src/lib/spots.ts` (static export order). */
const firstSlug = 'moledo';

test.describe('Spot detail hero gauge', () => {
  test('hero meter /10 and band word are visible', async ({ page }) => {
    // Hora de sol fixa: de noite a nota v6 (#184) passa à lua (sem meter).
    await alignClockToForecast(page, firstSlug);
    await page.goto(`/pt/spots/${firstSlug}/`);

    const hero = page.locator('#agora');
    const meter = hero.getByRole('meter');
    await expect(meter).toBeVisible({ timeout: 15_000 });
    await expect(meter).toHaveAttribute('aria-valuemax', '10');
    const n = Number(await meter.getAttribute('aria-valuenow'));
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(10);
    await expect(meter).toContainText(/^(10|\d)\/10$/);
    await expect(hero.getByText(/^(Muito bom|Bom|Dá|Fraco|Não dá)$/)).toBeVisible();
  });
});
