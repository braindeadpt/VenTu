/**
 * Screenshots for wind-ring legend audit (desktop popover + mobile sheet, both themes).
 * Prereq: npm run build && npx serve out -l 4173
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173';
const OUT = path.join(process.cwd(), 'docs', 'wind-ring-legend-audit');

async function prepMap(page) {
  await page.goto(`${BASE}/pt/mapa/`);
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.removeItem('ventu:windRingLegendSeen');
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.wind', '1');
  });
  await page.reload();
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await page.getByRole('dialog', { name: /Ler o arco de vento/i }).waitFor({ timeout: 15_000 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Desktop light
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await prepMap(page);
    await page.screenshot({ path: path.join(OUT, 'legend-desktop-light.png') });
    await ctx.close();
  }

  // Desktop dark
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${BASE}/pt/mapa/`);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await prepMap(page);
    await page.screenshot({ path: path.join(OUT, 'legend-desktop-dark.png') });
    await ctx.close();
  }

  // Mobile sheet
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await prepMap(page);
    await page.screenshot({ path: path.join(OUT, 'legend-mobile-light.png') });
    await ctx.close();
  }

  await browser.close();
  console.log(`Wind ring legend audit saved to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
