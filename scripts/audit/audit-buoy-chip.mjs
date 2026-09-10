/**
 * One-off hit-testing audit: buoy chip + popover + layer-toggle state parity
 * on /pt/mapa/ (desktop 1280x720 mouse + mobile 390x844 touch), against the
 * static export served on AUDIT_BASE. Read-only: mutates only localStorage in
 * its own browser contexts; captures no screenshots.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173';
const IH_NO_KEY = {
  fetchedAt: new Date().toISOString(),
  apiKeyConfigured: false,
  hasWaveData: false,
  stations: {},
};
const WMO_DOWN = { buoys: {}, hasWaveData: false, day: '20260815' };

async function openMapa(ctx, { mobile = false } = {}) {
  const page = await ctx.newPage();
  await page.route('**/data/ih-buoys.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(IH_NO_KEY) }));
  await page.route('**/data/wmo-buoys.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(WMO_DOWN) }));
  await page.addInitScript(() => localStorage.setItem('ventu.map.cluster', '0'));
  await page.goto(`${BASE}/pt/mapa/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  // hud-collapsed=true é setado por React no primeiro render client; esperar
  // pelo estado, não pelo atributo sem valor.
  await page.waitForSelector('[data-map-hud-collapsed="true"]', { timeout: 20_000 }).catch(() => {});
  return page;
}

const results = [];
function report(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

// ── Desktop (mouse) ──────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await openMapa(ctx);

  const chip = page.locator('[data-buoy-layer-chip="true"]');
  await chip.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (!(await chip.isVisible().catch(() => false))) {
    report('desktop: buoy chip visível com IH no-key', false, 'chip não apareceu');
  } else {
    // 1. Alvo do chip ≥44px
    const box = await chip.boundingBox();
    report('desktop: chip ≥44px', box.width >= 44 && box.height >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`);

    // 2. aria-expanded sincronizado
    report('desktop: aria-expanded=false fechado', (await chip.getAttribute('aria-expanded')) === 'false');

    // 3. Popover abre e é o elemento de topo no botão de dispensa
    await chip.click();
    const pop = page.locator('[data-buoy-chip-popover="true"]');
    await pop.waitFor({ state: 'visible', timeout: 5_000 });
    report('desktop: aria-expanded=true aberto', (await chip.getAttribute('aria-expanded')) === 'true');
    const geo = await page.evaluate(() => {
      const p = document.querySelector('[data-buoy-chip-popover="true"]');
      const r = p.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, vw: innerWidth, vh: innerHeight };
    });
    report('desktop: popover dentro do viewport', geo.left >= 0 && geo.right <= geo.vw, JSON.stringify(geo));
    const dismiss = pop.getByRole('button', { name: 'Dispensar este aviso' });
    await dismiss.scrollIntoViewIfNeeded();
    const top = await page.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(at) || at === el;
    }, await dismiss.elementHandle());
    report('desktop: dispensa é elemento de topo', top);

    // 4. Escape fecha
    await page.keyboard.press('Escape');
    await pop.waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {});
    report('desktop: Escape fecha', !(await pop.isVisible().catch(() => false)));
  }

  // 5. Paridade de estado dos toggles de camadas (desktop: MapControls no topo direito)
  const state = await page.evaluate(() => {
    const r = {};
    const toggles = document.querySelectorAll('[data-map-currents-toggle],[data-map-sst-toggle],[data-map-isobaths-toggle],[data-map-radar-toggle]');
    for (const t of toggles) {
      const k = t.getAttribute('data-map-currents-toggle') !== null ? 'currents'
        : t.getAttribute('data-map-sst-toggle') !== null ? 'sst'
        : t.getAttribute('data-map-isobaths-toggle') !== null ? 'isobaths'
        : 'radar';
      r[k] = { pressed: t.getAttribute('aria-pressed'), disabled: t.disabled ?? null };
    }
    return r;
  });
  report('desktop: toggles presentes com aria-pressed', Object.keys(state).length >= 2, JSON.stringify(state));

  await ctx.close();
}

// ── Mobile (touch) ───────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await openMapa(ctx, { mobile: true });

  const chip = page.locator('[data-buoy-layer-chip="true"]');
  await chip.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (!(await chip.isVisible().catch(() => false))) {
    report('mobile: buoy chip visível com IH no-key', false, 'chip não apareceu');
  } else {
    const box = await chip.boundingBox();
    report('mobile: chip ≥44px', box.width >= 44 && box.height >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`);

    await chip.tap();
    const pop = page.locator('[data-buoy-chip-popover="true"]');
    await pop.waitFor({ state: 'visible', timeout: 5_000 });
    const geo = await page.evaluate(() => {
      const p = document.querySelector('[data-buoy-chip-popover="true"]');
      const r = p.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
    });
    report('mobile: popover dentro do viewport', geo.left >= 0 && geo.right <= geo.vw && geo.top >= 0, JSON.stringify(geo));

    const dismiss = pop.getByRole('button', { name: 'Dispensar este aviso' });
    const top = await page.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(at) || at === el;
    }, await dismiss.elementHandle());
    report('mobile: dispensa é elemento de topo', top);

    // Clique fora fecha (tap no mapa)
    await page.mouse.click(200, 300);
    await pop.waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {});
    report('mobile: clique fora fecha', !(await pop.isVisible().catch(() => false)));

    // Dispensar persiste entre recargas
    await chip.tap();
    await pop.waitFor({ state: 'visible', timeout: 5_000 });
    await dismiss.tap();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    const gone = await page.locator('[data-buoy-layer-chip="true"]').isVisible().catch(() => false);
    report('mobile: dispensa persiste após recarga', !gone);
  }
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
process.exit(failed.length ? 1 : 0);
