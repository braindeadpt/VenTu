import { test, expect, type Page } from '@playwright/test';
import { spots } from '../../src/lib/spots';
import { spotTimeZone } from '../../src/lib/spotTimeZone';
import {
  findCurrentHourIndex,
  hourKeyFromInstantInTz,
} from '../../src/lib/openMeteoTime';

/**
 * REGRA DO PRODUTO: a hora é SEMPRE a local do spot — nunca UTC nem a do
 * browser. Regressões cobertas:
 *  1. Açores (lon < −24) pedidos/mostrados em Europe/Lisbon — 1 h à frente
 *     todo o ano (pipeline passa timezone=Atlantic/Azores ao Open-Meteo).
 *  2. Marés/«agora»/tabela horária parseados no fuso do BROWSER
 *     (new Date(isoNaive)) — visitante fora de Portugal via extremos
 *     trocados e «agora» deslocado.
 *
 * Prova: a mesma página lida com timezoneId Lisboa/Auckland/Nova Iorque
 * mostra o mesmo «agora» e a mesma próxima maré; e o «agora» de um spot
 * dos Açores cai na hora local dos Açores (não na de Lisboa).
 */

interface HourRow {
  time: string;
  tideHeight?: number;
}

const CONTINENT = spots.find((s) => s.id === 'guincho')!;
const AZORES = spots.find((s) => s.id === 'mosteiros')!;
expect(spotTimeZone(CONTINENT)).toBe('Europe/Lisbon');
expect(spotTimeZone(AZORES)).toBe('Atlantic/Azores');

/** Altura da maré mostrada como «agora» + texto do próximo extremo. */
async function readTideCard(page: Page) {
  const card = page.locator('[data-instrument="tide"]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const big = (await card.locator('[data-role="big"]').innerText()).trim();
  const subs = await card.locator('span').allInnerTexts();
  const nextText = subs.find((s) => /\d{1,2}[:h]\d{2}/.test(s)) ?? '';
  return { big, nextText };
}

/** Forecast horário do spot tal como o site o serve. */
async function fetchForecast(request: import('@playwright/test').APIRequestContext, spotId: string) {
  const res = await request.get(`/data/forecasts/${spotId}.json`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as HourRow[];
}

const BROWSER_TZ = ['Europe/Lisbon', 'Pacific/Auckland', 'America/New_York'] as const;

// Playwright: timezoneId é por contexto — um describe por fuso do browser.
for (const tz of BROWSER_TZ) {
  test.describe(`browser ${tz}`, () => {
    test.use({ serviceWorkers: 'block', timezoneId: tz });

    for (const spot of [CONTINENT, AZORES]) {
      test(`${spot.id}: «agora» e próxima maré = hora local do spot`, async ({ page, request }) => {
        const forecast = await fetchForecast(request, spot.id);
        const tzSpot = spotTimeZone(spot);
        const times = forecast.map((r) => r.time);

        const rowsFetched = page
          .waitForResponse((r) => r.url().includes('/data/forecasts/'), { timeout: 15_000 })
          .catch(() => null);
        await page.goto(`/pt/spots/${spot.slug}/`);
        await expect(
          page.getByRole('heading', { level: 1 }).first(),
        ).toBeVisible({ timeout: 20_000 });
        await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
        // Espera o fetch das linhas — o TideCard faz primeiro paint com o
        // snapshot de conditions e depois mostra a série horária.
        await rowsFetched;
        await expect
          .poll(async () =>
            page.locator('[data-instrument="tide"] [data-tide-extrema-source]').first()
              .getAttribute('data-tide-extrema-source'),
          )
          .toBeTruthy();

        const now = new Date();
        const idx = findCurrentHourIndex(times, now, tzSpot);
        const expectedKey = hourKeyFromInstantInTz(now.getTime(), tzSpot);
        // A série está em wall-time do fuso do spot: a row[idx] É a hora
        // local actual do spot.
        expect(times[idx]).toContain(expectedKey);

        // TideCard: altura «agora» = tideHeight da row do índice «agora».
        // (fmt pt: «−0,4 m» / «+0,2 m» — minus U+2212, vírgula, sinal sempre.)
        const { big, nextText } = await readTideCard(page);
        const shown = Number(
          big.replace('−', '-').replace('+', '').replace(',', '.').replace(/[^\d.-]/g, ''),
        );
        const expectedH = forecast[idx]?.tideHeight;
        if (typeof expectedH === 'number') {
          expect(Math.abs(shown - expectedH)).toBeLessThanOrEqual(0.05);
        }
        // A próxima maré tem de ser uma hora wall-time da série, formatada.
        expect(nextText).toMatch(/\d{1,2}[:h]\d{2}/);
      });
    }
  });
}

// Invariância cross-browser-TZ: corre tudo de novo em 2 fusos extremos e
// compara o DOM textual (altura «agora», próxima maré, células de hora).
test.describe('invariância browser-TZ', () => {
  const pairs: Array<[string, string]> = [
    ['Pacific/Auckland', 'Europe/Lisbon'],
    ['America/New_York', 'Europe/Lisbon'],
  ];

  for (const [tzA, tzB] of pairs) {
    for (const spot of [CONTINENT, AZORES]) {
      test(`${spot.id}: DOM igual em ${tzA} e ${tzB}`, async ({ browser, request }) => {
        const forecast = await fetchForecast(request, spot.id);
        // Relógio fixo — sem isto, um cruzamento da viragem de hora entre os
        // dois contextos mudaria o «agora» por razões temporais, não de fuso.
        const fixedNow = new Date(Math.floor(Date.now() / 60000) * 60000);

        const read = async (tz: string) => {
          const ctx = await browser.newContext({
            serviceWorkers: 'block',
            timezoneId: tz,
          });
          const page = await ctx.newPage();
          await page.clock.install();
          await page.clock.setFixedTime(fixedNow);
          try {
            const rowsFetched = page
              .waitForResponse((r) => r.url().includes('/data/forecasts/'), { timeout: 15_000 })
              .catch(() => null);
            await page.goto(`/pt/spots/${spot.slug}/`);
            await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
              timeout: 20_000,
            });
            await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
            await rowsFetched;
            // Estabiliza: o cartão alterna do snapshot conditions para a série.
            await expect
              .poll(async () =>
                page.locator('[data-instrument="tide"] [data-tide-extrema-source]').first()
                  .getAttribute('data-tide-extrema-source'),
              )
              .toBeTruthy();
            const tide = await readTideCard(page);
            // Primeiras células de hora da tabela de previsão — texto wall.
            const hourCells = await page
              .locator('table >> text=/^\\d{1,2}[:h]\\d{2}$/')
              .allInnerTexts();
            // Faixa «Quando ir»/forecast do hero — a hora mostrada no topo.
            return { tide, hourCells: hourCells.slice(0, 8) };
          } finally {
            await ctx.close();
          }
        };

        const a = await read(tzA);
        const b = await read(tzB);

        // A hora local do spot não depende do fuso do visitante.
        expect(a.tide.big).toBe(b.tide.big);
        expect(a.tide.nextText).toBe(b.tide.nextText);
        if (a.hourCells.length && b.hourCells.length) {
          expect(a.hourCells).toEqual(b.hourCells);
        }

        // Sanity: a row «agora» continua a ser a hora local do spot
        // (no instante fixo partilhado pelos dois contextos).
        const tzSpot = spotTimeZone(spot);
        const idx = findCurrentHourIndex(
          forecast.map((r) => r.time),
          fixedNow,
          tzSpot,
        );
        expect(forecast[idx].time).toContain(hourKeyFromInstantInTz(fixedNow.getTime(), tzSpot));
      });
    }
  }
});
