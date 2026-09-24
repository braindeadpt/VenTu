import { test, expect } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';
import { preseedWindRingLegend } from './helpers/map-setup';

const SPORTS = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as const;

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

const wSpd = TIMES.map(() => 8); // ~15 kt — campo bem visível
const wDir = TIMES.map(() => 0); // de norte → sopra para sul

const MAP_HOURS_STUB = {
  generatedAt: '2026-09-03T07:00:00.000Z',
  stepHours: 3,
  times: TIMES,
  sports: SPORTS,
  spots: {
    nazare: spotRow({ 0: 60 }),
  },
  wind: {
    nazare: { spd: wSpd, dir: wDir },
  },
};

async function openMap(page: import('@playwright/test').Page) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.wind', '1');
    localStorage.setItem('ventu.mapdebug', '1');
  });
  await interceptMapHours(page, MAP_HOURS_STUB);
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
}

test.describe('Map wind field', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 60_000 });

  test('o toggle Vento liga o canvas do campo; desligar remove-o', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(page.locator('[data-map-wind="true"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(1);

    // desligar o toggle remove o canvas e marca o atributo a false.
    // UX v3 §0.3: o toggle chama-se «Vento» e o estado vai em aria-pressed —
    // já não existe o botão de acção «Ocultar vento» do cromo antigo.
    const windToggle = page.locator('[data-map-wind-toggle]');
    await expect(windToggle).toHaveAttribute('aria-pressed', 'true');
    await windToggle.click();
    await expect(windToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(map).toHaveAttribute('data-map-windfield', 'false');
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(0);
  });

  test('sem bloco wind no ficheiro o campo não abre (graceful)', async ({ page }) => {
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.wind', '1');
    });
    const { wind: _omit, ...noWind } = MAP_HOURS_STUB;
    await interceptMapHours(page, noWind);
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    const map = page.locator('.leaflet-container');
    await page.waitForTimeout(3000);
    await expect(map).toHaveAttribute('data-map-windfield', 'false');
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(0);
  });
});

test.describe('Map wind field — animado (sem reduced-motion)', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });
  test.describe.configure({ timeout: 90_000 });

  async function framesDrawn(page: import('@playwright/test').Page) {
    const v = await page
      .locator('.leaflet-container')
      .getAttribute('data-map-windfield-frames');
    return v ? Number(v) : 0;
  }

  test('o canvas fica a DPR 1 e o loop pinta a ~30fps', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-windfield-paused', 'false');

    // acorda o relógio de inactividade — a pausa de 8s não pode congelar
    // o contador a meio da medição
    await page.mouse.move(720, 450);
    const canvas = page.locator('canvas.ventu-windfield-canvas');
    const box = await canvas.boundingBox();
    const width = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
    expect(box).not.toBeNull();
    // DPR 1 — o backing store acompanha o tamanho CSS, não o devicePixelRatio.
    expect(width).toBeLessThanOrEqual(Math.ceil(box!.width));

    // ~30fps: mede a taxa real (frames/tempo) — independente da lentidão
    // do CI. Sem cap seriam ~60fps; com cap nunca passa de ~30.
    await page.waitForTimeout(2000);
    const t0 = Date.now();
    const f0 = await framesDrawn(page);
    // prova que está a animar mesmo sob contenção (10 frames em até 20s)
    await expect
      .poll(async () => framesDrawn(page), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(f0 + 10);
    const fps = ((await framesDrawn(page)) - f0) / ((Date.now() - t0) / 1000);
    expect(fps).toBeLessThanOrEqual(45); // cap ~30fps + margem
  });

  test('pausa ao fim de ~8s sem interacção e acorda com gesto no mapa', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });

    // sem qualquer gesto, o campo congela e o rAF deixa de ser agendado
    await expect(map).toHaveAttribute('data-map-windfield-paused', 'true', { timeout: 20_000 });
    const fPaused = await framesDrawn(page);
    await page.waitForTimeout(1200);
    expect(await framesDrawn(page)).toBe(fPaused);

    // interacção no mapa acorda o campo
    await page.mouse.move(720, 450);
    await page.mouse.move(760, 470);
    await expect(map).toHaveAttribute('data-map-windfield-paused', 'false');
    await expect
      .poll(async () => framesDrawn(page), { timeout: 5000 })
      .toBeGreaterThan(fPaused);
  });

  test('a cor do campo segue a mudança de tema', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-windfield-color', '167 139 250');

    await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
    await expect(map).toHaveAttribute('data-map-windfield-color', '109 40 217');
  });

  test('§9 — fade-out durante o pan (opacity 0) e retoma ao assentar', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });
    await expect(map).toHaveAttribute('data-map-windfield-visible', 'true', { timeout: 10_000 });
    const canvas = page.locator('canvas.ventu-windfield-canvas');

    // Gesto real do Leaflet via flyTo — dispara os mesmos
    // movestart/zoomstart/moveend/zoomend de um arrasto, mas sem depender
    // do hit-test do rato sintético (um mousedown sobre um marcador ou
    // chrome podia nunca iniciar o drag sob carga — flake observado).
    await page.evaluate(() => {
      const m = (window as unknown as {
        __VENTU_MAP__?: {
          getCenter(): { lat: number; lng: number };
          getZoom(): number;
          flyTo(c: [number, number], z: number, o: { duration: number }): void;
        };
      }).__VENTU_MAP__;
      if (!m) throw new Error('__VENTU_MAP__ ausente (ventu.mapdebug)');
      const c = m.getCenter();
      m.flyTo([c.lat - 1.2, c.lng - 1.8], m.getZoom(), { duration: 1.2 });
    });
    // Durante o gesto o canvas vai a 0 (e a hidden depois do fade).
    await expect(map).toHaveAttribute('data-map-windfield-visible', 'false', {
      timeout: 10_000,
    });
    await expect(canvas).toHaveCSS('opacity', '0', { timeout: 10_000 });

    // Assenta → após ~600 ms + fade de 300 ms volta a 1 e continua a
    // desenhar. Folga larga: sob paralelismo o rAF/timer atrasam.
    await expect(map).toHaveAttribute('data-map-windfield-visible', 'true', {
      timeout: 15_000,
    });
    await expect(canvas).toHaveCSS('opacity', '1', { timeout: 10_000 });
  });

  test('§9 — a densidade de partículas sobe com o zoom', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });

    const lowTarget = await page.evaluate(() =>
      document
        .querySelector('.leaflet-container')
        ?.getAttribute('data-map-windfield-target'),
    );
    expect(lowTarget).not.toBeNull();

    await page.evaluate(() => {
      const m = (window as unknown as {
        __VENTU_MAP__?: { setZoom(z: number): void };
      }).__VENTU_MAP__;
      if (!m) throw new Error('__VENTU_MAP__ ausente (ventu.mapdebug)');
      m.setZoom(10);
    });
    // Confirma que o zoom aconteceu — sem isto um no-op silencioso lia-se
    // como «densidade não subiu».
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            (window as unknown as { __VENTU_MAP__?: { getZoom(): number } })
              .__VENTU_MAP__?.getZoom(),
          ),
        { timeout: 15_000 },
      )
      .toBe(10);
    // O alvo novo é publicado quando o loop retoma depois do zoom.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            document
              .querySelector('.leaflet-container')
              ?.getAttribute('data-map-windfield-target'),
          ),
        { timeout: 30_000 },
      )
      .not.toBe(lowTarget);
    const highTarget = await page.evaluate(() =>
      Number(
        document
          .querySelector('.leaflet-container')
          ?.getAttribute('data-map-windfield-target'),
      ),
    );
    expect(highTarget).toBeGreaterThan(Number(lowTarget));
  });

  test('mudar para reduced-motion a meio congela o loop', async ({ page }) => {
    await openMap(page);
    const map = page.locator('.leaflet-container');
    await expect(map).toHaveAttribute('data-map-windfield', 'true', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    const f0 = await framesDrawn(page);
    expect(f0).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(1500);
    const f1 = await framesDrawn(page);
    await page.waitForTimeout(1200);
    // modo estático: o contador deixa de subir (o paintStatic não incrementa)
    expect(await framesDrawn(page)).toBe(f1);
    // e o campo continua desenhado (canvas presente)
    await expect(page.locator('canvas.ventu-windfield-canvas')).toHaveCount(1);
  });
});
