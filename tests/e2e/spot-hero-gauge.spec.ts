import { test, expect } from '@playwright/test';

/** First entry in `src/lib/spots.ts` (static export order). */
const firstSlug = 'moledo';

test.describe('Spot detail hero gauge', () => {
  test('hero meter and rating label are visible', async ({ page }) => {
    await page.goto(`/pt/spots/${firstSlug}/`);

    await expect(page.getByRole('meter')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Épico|Bom|Razoável|Fraco|N\/A/i).first()).toBeVisible();
  });
});
