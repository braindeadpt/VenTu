import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:3000';
const OUT = 'audit-screenshots/review';
mkdirSync(OUT, { recursive: true });

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// discover a spot slug from the spots page links
async function firstSpotSlug(page) {
  await page.goto(`${BASE}/pt/spots/`, { waitUntil: 'networkidle' });
  const href = await page.locator('a[href*="/pt/spots/"]').nth(1).getAttribute('href').catch(() => null);
  if (href) {
    const m = href.match(/\/pt\/spots\/([^/]+)\//);
    if (m && m[1]) return m[1];
  }
  return 'moledo';
}

const shots = [
  { name: 'home-desktop', url: '/pt/', vp: desktop, full: true },
  { name: 'home-mobile', url: '/pt/', vp: mobile, full: true },
  { name: 'mapa-desktop', url: '/pt/mapa/', vp: desktop, full: false },
  { name: 'mapa-mobile', url: '/pt/mapa/', vp: mobile, full: false },
];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: desktop });
  const page = await ctx.newPage();
  const slug = await firstSpotSlug(page);
  await ctx.close();
  shots.push({ name: 'spot-desktop', url: `/pt/spots/${slug}/`, vp: desktop, full: true });
  shots.push({ name: 'spot-mobile', url: `/pt/spots/${slug}/`, vp: mobile, full: true });

  for (const s of shots) {
    const context = await browser.newContext({ viewport: { width: s.vp.width, height: s.vp.height }, isMobile: !!s.vp.isMobile, hasTouch: !!s.vp.hasTouch, deviceScaleFactor: s.vp.deviceScaleFactor || 1 });
    const p = await context.newPage();
    try {
      await p.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle', timeout: 45000 });
      await p.waitForTimeout(2500); // let map/animations settle
      await p.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: s.full });
      console.log('OK', s.name);
    } catch (e) {
      console.log('FAIL', s.name, e.message);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log('DONE ->', OUT);
