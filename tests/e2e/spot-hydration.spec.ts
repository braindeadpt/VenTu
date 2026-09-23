import { test, expect, type Page } from '@playwright/test';

/**
 * Z0 — a página de spot hidrata sem desencontros (React #418/#423) em qualquer
 * variante e fuso do visitante. O primeiro render no cliente reproduz o bake
 * (bakedAtMs); leituras de relógio real só aparecem depois de montar.
 * Regressão: «Corrigido pela boia <nome>» perdia o nome da boia na hidratação
 * porque resolveScoreWaveCorrection lia Date.now() sem o relógio baked.
 */

const HYDRATION_ERROR = /#418|#423|#425|Hydration failed|hydration mismatch|Hydrat/i;

function collectHydrationErrors(page: Page, errors: string[]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' && HYDRATION_ERROR.test(msg.text())) {
      errors.push(`console: ${msg.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => {
    if (HYDRATION_ERROR.test(err.message)) {
      errors.push(`pageerror: ${err.message.slice(0, 300)}`);
    }
  });
}

const LOCALES = ['pt', 'en'] as const;
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;
const TIMEZONES = ['Pacific/Auckland', 'Europe/Lisbon'] as const;

for (const locale of LOCALES) {
  for (const vp of VIEWPORTS) {
    for (const timezoneId of TIMEZONES) {
      test.describe(`spot hydration — ${locale} ${vp.name} ${timezoneId}`, () => {
        test.use({
          serviceWorkers: 'block',
          timezoneId,
          viewport: { width: vp.width, height: vp.height },
        });

        test(`hidratou sem #418/#423 (${locale} ${vp.name} ${timezoneId})`, async ({ page }) => {
          const errors: string[] = [];
          collectHydrationErrors(page, errors);

          await page.goto(`/${locale}/spots/guincho/`);
          await expect(
            page.getByRole('heading', { level: 1, name: /Guincho/i }),
          ).toBeVisible({ timeout: 20_000 });
          // React montado — qualquer desencontro já teria sido registado.
          await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });

          expect(errors).toEqual([]);
        });
      });
    }
  }
}
