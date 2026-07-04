/**
 * Visual audit: VenTu wind ring markers — 4 distinct captures on current static build.
 *
 * Prereq: npm run build && npx serve out -l 4173
 * Run: node scripts/audit-wind-markers.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'docs', 'wind-ring-audit');
const PORT = process.env.AUDIT_PORT || '4173';
const URL = process.argv[2] ?? `http://127.0.0.1:${PORT}/pt/mapa/`;
const NEW_LEGEND = /offshore\/onshore\/cross/i;

const TILE_SCENARIOS = [
  { id: 'light-map', basemap: 'map', theme: 'light', label: 'Light map tiles' },
  { id: 'dark-map', basemap: 'map', theme: 'dark', label: 'Dark map tiles' },
  { id: 'satellite', basemap: 'satellite', theme: 'dark', label: 'Satellite tiles' },
];

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

async function waitForMapReady(page) {
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await page.waitForSelector('.ventu-wind-ring', { timeout: 30_000 });
  await page.getByText(NEW_LEGEND).waitFor({ state: 'visible', timeout: 20_000 });
}

async function waitForTileSrc(page, pattern) {
  await page.waitForFunction(
    (p) => {
      const imgs = document.querySelectorAll('.leaflet-tile-pane img');
      return Array.from(imgs).some((img) => img.src.includes(p));
    },
    pattern,
    { timeout: 25_000 },
  );
}

async function ensureTheme(page, theme) {
  const wantLight = theme === 'light';
  const themeBtn = page.getByRole('button', {
    name: /Alternar para tema|Switch to (dark|light) theme/i,
  });

  for (let attempt = 0; attempt < 6; attempt++) {
    const isLight = await page.evaluate(
      () => document.documentElement.classList.contains('theme-ocean'),
    );
    if (isLight === wantLight) break;
    await themeBtn.click();
    await page.waitForTimeout(500);
  }

  const isLight = await page.evaluate(
    () => document.documentElement.classList.contains('theme-ocean'),
  );
  if (isLight !== wantLight) {
    throw new Error(`Failed to apply ${theme} theme (theme-ocean=${isLight})`);
  }
}

async function ensureBasemap(page, basemap) {
  const label = basemap === 'satellite' ? /^Satélite$|^Sat$/i : /^Mapa$|^Map$/i;
  const radio = page.getByRole('radio', { name: label }).first();
  if ((await radio.getAttribute('aria-checked')) !== 'true') {
    await radio.click();
  }
  await page.waitForTimeout(1200);
  if (basemap === 'satellite') {
    await waitForTileSrc(page, 'arcgisonline.com');
  } else {
    const isLight = await page.evaluate(
      () => document.documentElement.classList.contains('theme-ocean'),
    );
    await waitForTileSrc(page, isLight ? 'light_all' : 'dark_all');
  }
  await page.evaluate((mode) => {
    const map = window.L?.map?.get?.();
    if (map) map.getContainer().dataset.basemap = mode;
  }, basemap);
}

async function zoomPeniche(page) {
  await page.evaluate(() => {
    const map = window.L?.map?.get?.();
    if (map) map.setView([39.36, -9.38], 11);
  });
  await page.waitForTimeout(2000);
}

async function waitForClusterMarkers(page, minClusters = 3) {
  for (let zoom = 8; zoom >= 4; zoom--) {
    await page.evaluate((z) => {
      const map = window.L?.map?.get?.();
      if (map) map.setView([39.5, -9.0], z);
    }, zoom);
    await page.waitForTimeout(2000);
    const count = await page.locator('.ventu-cluster-icon').count();
    if (count >= minClusters) return count;
  }
  throw new Error(`Expected at least ${minClusters} .ventu-cluster-icon clusters`);
}

async function captureScenario(page, scenario) {
  await ensureTheme(page, scenario.theme);
  await ensureBasemap(page, scenario.basemap);
  await zoomPeniche(page);

  const stats = await page.evaluate(() => {
    const halo = document.querySelector('.ventu-wind-ring-halo');
    return {
      ringCount: document.querySelectorAll('.ventu-wind-ring').length,
      clusterCount: document.querySelectorAll('.ventu-cluster-icon').length,
      legend: document.body.innerText.includes('offshore/onshore/cross'),
      themeOcean: document.documentElement.classList.contains('theme-ocean'),
      basemap: document.querySelector('.leaflet-container')?.getAttribute('data-basemap'),
      haloVisible: halo ? getComputedStyle(halo).display !== 'none' : false,
      tileSample: document.querySelector('.leaflet-tile-pane img')?.src ?? '',
    };
  });

  if (!stats.legend) {
    throw new Error(`${scenario.id}: new wind legend not visible`);
  }

  const filename = `wind-ring-${scenario.id}.png`;
  const filePath = path.join(OUT, filename);
  await page.locator('.leaflet-container').screenshot({ path: filePath });
  const hash = md5(await readFile(filePath));
  return { ...scenario, filename, filePath, hash, stats };
}

async function captureClusters(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.wind', '1');
    localStorage.setItem('ventu.map.cluster', '0');
  });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 45_000 });
  await page.waitForTimeout(3000);

  const clusterBtn = page.getByRole('button', { name: /^Agrupar spots$|^Cluster spots$/i });
  if ((await page.locator('[data-map-cluster]').getAttribute('data-map-cluster')) !== 'true') {
    await clusterBtn.click();
    await page.waitForSelector('[data-map-cluster="true"]', { timeout: 25_000 });
  }
  await page.waitForSelector('[data-map-wind="false"]', { timeout: 15_000 });

  const clusterCount = await waitForClusterMarkers(page);
  const stats = await page.evaluate(() => ({
    clusterCount: document.querySelectorAll('.ventu-cluster-icon').length,
    ringCount: document.querySelectorAll('.ventu-wind-ring').length,
    dataMapCluster: document.querySelector('[data-map-cluster]')?.getAttribute('data-map-cluster'),
    dataMapWind: document.querySelector('[data-map-wind]')?.getAttribute('data-map-wind'),
    clusterHint: document.body.innerText.includes('Desligue cluster') ||
      document.body.innerText.includes('Turn off clustering'),
  }));

  if (stats.ringCount > 0) {
    throw new Error('Clusters capture must not show wind rings on markers');
  }

  const filename = 'wind-ring-clusters.png';
  const filePath = path.join(OUT, filename);
  await page.locator('.leaflet-container').screenshot({ path: filePath });
  const hash = md5(await readFile(filePath));
  await page.close();
  return {
    id: 'clusters',
    label: 'Cluster zoom (no wind rings)',
    filename,
    filePath,
    hash,
    stats: { ...stats, clusterCount },
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.wind', '1');
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('windspot:theme', 'dark');
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await waitForMapReady(page);

  const captures = [];
  for (const scenario of TILE_SCENARIOS) {
    const shot = await captureScenario(page, scenario);
    captures.push(shot);
    console.log(`✓ ${scenario.label} → ${shot.filename} md5=${shot.hash}`, shot.stats);
  }

  const clusterPage = await captureClusters(browser);
  captures.push(clusterPage);
  console.log(`✓ ${clusterPage.label} → ${clusterPage.filename} md5=${clusterPage.hash}`, clusterPage.stats);

  const hashes = captures.map((c) => c.hash);
  const unique = new Set(hashes);
  if (unique.size !== captures.length) {
    const dupes = hashes.filter((h, i) => hashes.indexOf(h) !== i);
    throw new Error(`Duplicate screenshot hashes: ${[...new Set(dupes)].join(', ')}`);
  }

  const report = {
    capturedAt: new Date().toISOString(),
    url: URL,
    hashes: Object.fromEntries(captures.map((c) => [c.id, c.hash])),
    captures,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n✅ ${captures.length} distinct captures → ${OUT}`);
  console.log(JSON.stringify(report.hashes, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
