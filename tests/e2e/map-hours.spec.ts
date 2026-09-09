import { test, expect } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';

const SPORTS = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const;

/** 16 steps × 3 h from 08:00 Lisbon. Index 0 = 08h, index 3 = 17h (nearest to 18h). */
const TIMES = Array.from({ length: 16 }, (_, i) => {
  const h = 8 + i * 3;
  const day = 3 + Math.floor(h / 24);
  const hh = String(h % 24).padStart(2, '0');
  return `2026-09-${String(day).padStart(2, '0')}T${hh}:00`;
});

function series(at: Record<number, number>): number[] {
  return TIMES.map((_, i) => at[i] ?? 40);
}

function spotRow(at: Record<number, number>) {
  const s = series(at);
  const row: Record<string, number[]> = { best: s };
  for (const sport of SPORTS) row[sport] = s;
  return row;
}

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 20, 3: 88 }),
  },
};

async function openMapHours(page: import('@playwright/test').Page, query = '?hours=1') {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

async function nazareScore(page: import('@playwright/test').Page) {
  const marker = page.locator('.leaflet-marker-icon.spot-marker[aria-label="Nazaré"]');
  await expect(marker).toBeVisible({ timeout: 20_000 });
  return marker.locator('[data-spot-score]').getAttribute('data-spot-score');
}

test.describe('Map 48h score timeline', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('deep link ?hours=1 liga o trilho; 08h→17h muda o score da Nazaré', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapHours(page);

    await expect(page.locator('[data-map-hours="true"]')).toBeVisible();
    const track = page.locator('[data-map-time-track-mode="hours"]');
    await expect(track).toBeVisible({ timeout: 15_000 });
    await expect(track).toContainText('08h');

    expect(await nazareScore(page)).toBe('20');

    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await slider.fill('3');
    await expect(track).toContainText('17h');
    expect(await nazareScore(page)).toBe('88');
  });

  test('deep link ?t=18 parte no passo mais próximo (17h)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapHours(page, '?hours=1&t=18');

    const track = page.locator('[data-map-time-track-mode="hours"]');
    await expect(track).toBeVisible({ timeout: 15_000 });
    await expect(track).toContainText('17h');
    expect(await nazareScore(page)).toBe('88');
  });
});

test.describe('Map 48h — time track em ecrãs estreitos', () => {
  test.use({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  test.describe.configure({ timeout: 60_000 });

  test('slider das horas não ultrapassa o cartão do HUD (regressão min-w-0)', async ({ page }) => {
    await openMapHours(page);
    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await expect(slider).toBeVisible({ timeout: 15_000 });

    // Auditoria 2026-09-10: em 360px, a linha do time track (play + relógio +
    // chip da maré + slider) estourava o slider 7px para fora do cartão — o
    // flex-1 não encolhia abaixo do min-content do input. Fix: min-w-0.
    const geo = await page.evaluate(() => {
      const region = document.querySelector('[aria-label="Modo explorar"]');
      const card = region?.querySelector('div');
      const s = document.querySelector<HTMLElement>(
        '[data-map-hours-scrubber] input[type="range"]',
      );
      if (!card || !s) return null;
      const cb = card.getBoundingClientRect();
      const sb = s.getBoundingClientRect();
      return {
        sliderRight: Math.round(sb.right),
        cardRight: Math.round(cb.right),
        inside: sb.right <= cb.right + 1 && sb.left >= cb.left - 1,
      };
    });
    expect(geo).not.toBeNull();
    expect(geo!.inside).toBe(true);
    expect(geo!.sliderRight).toBeLessThanOrEqual(geo!.cardRight + 1);
  });
});

test.describe('Map 48h: prefers-reduced-motion', () => {
  test.use({
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  test.describe.configure({ timeout: 60_000 });

  test('não anima sozinho — o scrubber continua a mudar a hora', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapHours(page);

    const track = page.locator('[data-map-time-track-mode="hours"]');
    await expect(track).toBeVisible({ timeout: 15_000 });
    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await slider.fill('0');
    await expect(track).toContainText('08h');
    await expect(page.locator('[data-map-hours-play]')).toBeVisible();
    expect(await nazareScore(page)).toBe('20');

    await slider.fill('3');
    await expect(track).toContainText('17h');
    expect(await nazareScore(page)).toBe('88');
  });
});

test.describe('Map 48h: mobile', () => {
  test.use({
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  test.describe.configure({ timeout: 60_000 });

  test('HUD no telemóvel: 08h→17h muda o mapa', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapHours(page);

    await expect(page.locator('[data-map-hours-toggle]')).toBeVisible({ timeout: 15_000 });
    const track = page.locator('[data-map-time-track-mode="hours"]');
    await expect(track).toBeVisible({ timeout: 15_000 });
    await expect(track).toContainText('08h');

    const slider = page.locator('[data-map-hours-scrubber] input[type="range"]');
    await slider.fill('3');
    await expect(track).toContainText('17h');
  });
});
