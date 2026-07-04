/**
 * Visual audit: VenTu compound wind markers.
 * Run: node scripts/audit-wind-markers.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), '.screenshots', 'wind-audit');
const URL = process.argv[2] ?? 'http://localhost:3000/pt/mapa/';

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.wind', '1');
    localStorage.setItem('ventu.map.cluster', '0');
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const L = window.L;
    const map = L?.map?.get?.();
    if (map) map.setView([39.36, -9.38], 11);
  });
  await page.waitForTimeout(2000);

  const stats = await page.evaluate(() => {
    const rays = document.querySelectorAll('.ventu-wind-ray');
    const compounds = document.querySelectorAll('.ventu-compound-marker');
    const old = document.querySelectorAll('.ventu-spot-wind');
    const line = document.querySelector('.ventu-wind-ray line:nth-of-type(3)');
    const lineLen = line
      ? Math.hypot(
          line.x2.baseVal.value - line.x1.baseVal.value,
          line.y2.baseVal.value - line.y1.baseVal.value,
        )
      : 0;
    return {
      dataMapWind: document.querySelector('[data-map-wind]')?.getAttribute('data-map-wind'),
      rayCount: rays.length,
      compoundCount: compounds.length,
      legacyArrowCount: old.length,
      sampleRayLen: lineLen,
      sampleTitle: document.querySelector('.ventu-compound-marker-wrap')?.getAttribute('title'),
    };
  });

  await page.locator('.leaflet-container').screenshot({ path: path.join(OUT, 'compound-marker-peniche.png') });

  const report = { capturedAt: new Date().toISOString(), url: URL, stats };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
