import { test, expect } from '@playwright/test';
import { alignClockToForecast } from './helpers/conditions';

/** First entry in `src/lib/spots.ts` (static export order). */
const firstSlug = 'moledo';

test.describe('Spot detail hero gauge', { tag: '@core' }, () => {
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

/**
 * #204 (label-content-name-mismatch) — regressão do nome acessível do botão
 * de alerta no hero do spot. O scan axe completo é opt-in
 * (`npm run test:e2e:axe`), mas esta asserção corre SEMPRE no core: o nome
 * acessível tem de ser exactamente o rótulo visível por locale — um
 * aria-label diferente faz o controlo por voz falhar o botão.
 * moledo serve: os desportos compatíveis (surf/bodyboard/sup) têm todos
 * alertas, logo o botão renderiza independentemente do desporto escolhido.
 */
test.describe('Spot hero alert button accessible name (#204)', { tag: '@core' }, () => {
  const ALERT_ME_BY_LOCALE: Record<string, string> = {
    pt: 'Avisa-me',
    en: 'Alert me',
    es: 'Avísame',
    de: 'Benachrichtige mich',
    fr: 'Préviens-moi',
  };

  for (const [locale, label] of Object.entries(ALERT_ME_BY_LOCALE)) {
    test(`/${locale}/spots/moledo/ — «${label}» is the exact accessible name`, async ({ page }) => {
      await alignClockToForecast(page, firstSlug);
      await page.goto(`/${locale}/spots/${firstSlug}/`);
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    });
  }
});
