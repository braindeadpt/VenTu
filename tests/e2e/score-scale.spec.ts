import { test, expect, type Page } from '@playwright/test';
import { waitHydrated } from './helpers/hydration';

/**
 * #210 — escala única da nota /10. Em nenhuma superfície pública pode aparecer
 * «/100» nem um número > 10 colado a um rótulo de banda ou a «/10».
 */
const ROUTES = [
  '/pt/',
  '/en/',
  '/pt/spots/carcavelos/',
  '/en/spots/carcavelos/',
  '/pt/mapa/',
  '/pt/compare/',
  '/pt/explorar/',
  '/pt/spots/',
  '/pt/modalidades/',
  '/pt/sazonalidade/',
];

const BAND = '(?:Muito bom|Bom|Dá|Fraco|Não dá|Very good|Good|OK|Poor|No go)';
const NUM_THEN_BAND = new RegExp(`(?<![\\d.,])(\\d{2,3})\\s*(?:·|—|-)?\\s*${BAND}(?![\\p{L}])`, 'giu');
const BAND_THEN_NUM = new RegExp(`(?<![\\p{L}])${BAND}\\s*(?:·|—|:)?\\s*(\\d{2,3})(?![\\d.,]|\\s*(?:km|m\\b|kt|°|%|h\\b|s\\b|min))`, 'giu');
const OVER_TEN = /(?<![\d.,])(\d{2,3})\s*\/\s*10(?!\d)/g;

function offenders(text: string): string[] {
  const out: string[] = [];
  if (/\/\s*100(?!\d)/.test(text)) out.push('«/100»');
  for (const re of [NUM_THEN_BAND, BAND_THEN_NUM, OVER_TEN]) {
    for (const m of text.matchAll(re)) {
      if (Number(m[1]) > 10) out.push(m[0]);
    }
  }
  return out;
}

async function scoreSurfaceText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [document.body.innerText];
    for (const el of document.querySelectorAll('[aria-label], [aria-valuetext], [title]')) {
      for (const a of ['aria-label', 'aria-valuetext', 'title']) {
        const v = el.getAttribute(a);
        if (v) parts.push(v);
      }
    }
    return parts.join('\n');
  });
}

test.describe('Nota /10 em todo o site (#210)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  for (const route of ROUTES) {
    test(`${route}: sem «/100» nem nota > 10`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitHydrated(page);
      await page.waitForTimeout(1_500);
      expect(offenders(await scoreSurfaceText(page))).toEqual([]);

      const meters = page.locator('[role="meter"], [role="progressbar"][aria-valuemax]');
      for (const m of await meters.all()) {
        const max = Number(await m.getAttribute('aria-valuemax'));
        const now = Number(await m.getAttribute('aria-valuenow'));
        if ((await m.getAttribute('aria-valuetext'))?.includes('/10') || max === 10) {
          expect(max).toBe(10);
          expect(now).toBeLessThanOrEqual(10);
        }
      }
    });
  }
});
