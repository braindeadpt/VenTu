import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const slug = process.argv[2] || 'baleal';
const OUT = 'audit-screenshots/review';
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173';

mkdirSync(OUT, { recursive: true });

const shots = [
  { name: `spot-${slug}-desktop`, vp: { width: 1440, height: 900 } },
  {
    name: `spot-${slug}-mobile`,
    vp: { width: 390, height: 844, isMobile: true, hasTouch: true },
  },
];

const browser = await chromium.launch();
for (const s of shots) {
  const context = await browser.newContext({
    viewport: { width: s.vp.width, height: s.vp.height },
    isMobile: !!s.vp.isMobile,
    hasTouch: !!s.vp.hasTouch,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/pt/spots/${slug}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector(`[data-spot-slug="${slug}"]`, { timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
  console.log('OK', s.name);
  await context.close();
}
await browser.close();
