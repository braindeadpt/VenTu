import { test, expect, type Locator } from '@playwright/test';

// 12 frames newest-first @ 5 min (01:00 → 00:05).
const FRAMES = Array.from({ length: 12 }, (_, i) => {
  const minutes = 60 - i * 5;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return {
    frameTime: `2026-08-15T${hh}:${mm}:00.000Z`,
    framePath: `pcr-2026-08-15T${hh}${mm}.png`,
    imagePath: `radar/frames/pcr-2026-08-15T${hh}${mm}.png`,
  };
});

const RADAR_STUB = {
  source: 'ipma-radar',
  fetchedAt: '2026-08-15T01:05:00.000Z',
  frameTime: FRAMES[0].frameTime,
  framePath: FRAMES[0].framePath,
  imagePath: 'radar/ipma-radar.png',
  frames: FRAMES,
  bounds: { south: 34.011513, west: -12.454795, north: 43.792862, east: -4.345465 },
  attribution: 'IPMA',
};

test.describe('IPMA radar carousel', () => {
  // Mesmo motivo do observed-wave-card: o SW serve radar.json do cache e
  // burla o page.route usado para injectar os frames sintéticos.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    // Expõe o mapa (__RADAR_MAP__) para os testes de sobreposição de movimentos
    // dispararem eventos Leaflet de forma determinística. Tem de ser registado
    // ANTES do page.goto (addInitScript após navegação não se aplica à página).
    await page.addInitScript(() => {
      (window as any).__RADAR_TEST__ = true;
    });
    await page.route('**/data/radar.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RADAR_STUB),
      });
    });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  });

  test('atribuição Open-Meteo junto ao overlay do radar e aos controlos', async ({ page }) => {
    // Controlo de atribuição do mapa (Leaflet, bottom-left) — sempre visível.
    const attribution = page.locator('.leaflet-control-attribution');
    await expect(attribution).toContainText('Weather data by Open-Meteo.com', {
      timeout: 15_000,
    });
    await expect(attribution).toContainText('CC BY 4.0');
    await expect(attribution.locator('a[href="https://open-meteo.com/"]')).toBeVisible();

    // Com o radar ligado, o badge mostra a atribuição junto ao overlay.
    await page.click('button[aria-label="Radar IPMA"]');
    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText('Weather data by Open-Meteo.com');
    await expect(badge).toContainText('CC BY 4.0');

    // Desligar esconde o badge (a atribuição do mapa mantém-se).
    await page.click('button[aria-label="Ocultar radar"]');
    await expect(badge).not.toBeVisible();
    await expect(attribution).toContainText('Weather data by Open-Meteo.com');
  });

  test('anima os 12 frames com indicador de hora e progresso', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');

    const badge = page.locator('[data-radar-badge="true"]');
    const slider = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Pausa o carrossel (pointerdown) antes de inspeccionar o frame inicial
    // — sem pausa, a animação a 1 frame/s pode ultrapassar as asserções sob
    // carga (workers paralelos atrasam os timers) e o 01:00 escapa.
    await slider.dispatchEvent('pointerdown');
    // Começa no frame mais recente: relógio 01:00 e progresso 1/12.
    await expect(badge).toContainText('1/12');
    await expect(badge).toContainText('01:00');
    // O tooltip do badge mostra data + hora exactas do frame (não só HH:mm),
    // para distinguir frames de dias diferentes.
    await expect(badge).toHaveAttribute(
      'title',
      'Precipitação real (radar IPMA, 5 min) · 2026-08-15 01:00',
    );
    await slider.dispatchEvent('pointerup');

    // O carrossel avança (5-min cadence simulado a 1 frame/s): o relógio
    // deixa de ser o do primeiro frame (a volta completa são 12 s, por isso
    // não volta a 01:00 dentro da janela de 5 s).
    await expect(badge).not.toContainText('01:00', { timeout: 5000 });

    // Desligar o radar esconde o badge.
    await page.click('button[aria-label="Ocultar radar"]');
    await expect(badge).not.toBeVisible();
  });

  test('scrubber percorre os frames manualmente e pausa o carrossel', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');

    const badge = page.locator('[data-radar-badge="true"]');
    const scrubber = page.locator('[data-radar-scrubber="true"]');
    const slider = scrubber.locator('input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(scrubber).toBeVisible();
    await expect(slider).toHaveAttribute('max', '11');

    // Interagir (pointer down → frame 5) pausa o carrossel e mostra a hora do frame.
    await slider.dispatchEvent('pointerdown');
    await slider.fill('5');
    await expect(badge).toContainText('6/12');
    await expect(badge).toContainText('00:35');
    // Tooltip actualizado para o frame escolhido (data + hora).
    await expect(badge).toHaveAttribute('title', /· 2026-08-15 00:35$/);

    // Em pausa, o carrossel não avança sozinho (2,5 s ≈ 2 ticks).
    await page.waitForTimeout(2500);
    await expect(badge).toContainText('6/12');

    // Soltar retoma o carrossel a partir do frame escolhido.
    await slider.dispatchEvent('pointerup');
    await expect(badge).toContainText('7/12', { timeout: 5000 });
  });

  test('pausa o carrossel durante drag do mapa e retoma ao parar', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Arrasta o mapa pelo centro e segura (dragstart/movestart → pausa).
    const map = page.locator('.leaflet-container');
    const box = await map.boundingBox();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 50, { steps: 6 });
    await page.waitForTimeout(400); // deixa os eventos de drag propagarem

    const clockDuringDrag = /(\d{2}:\d{2})/.exec((await badge.textContent()) ?? '')![1];

    // Estado visual «Pausado» enquanto o mapa se move — não parece avariado.
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    await expect(badge).toContainText('Pausado');

    // Enquanto o drag está segurado, o carrossel não avança (2,5 s ≈ 2 ticks).
    await page.waitForTimeout(2500);
    await expect(badge).toContainText(clockDuringDrag);

    // Soltar retoma a partir do frame actual (o relógio muda no próximo tick)
    // e o estado «Pausado» desaparece.
    await page.mouse.up();
    await expect(badge).not.toContainText(clockDuringDrag, { timeout: 5000 });
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('movimentos sobrepostos (drag + zoom) só retomam quando o ÚLTIMO termina', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Atira move + zoom a sobreporem-se: começa um movimento e, ainda activo,
    // lança um zoom. Um boolean retomaria logo que o 1º terminasse; o contador
    // (Set de fontes) tem de manter pausado até o ÚLTIMO evento-fim.
    const started = await page.evaluate(() => {
      const map = (window as any).__RADAR_MAP__;
      if (!map) return false;
      map.fire('movestart'); // fonte 'move'
      map.fire('zoomstart'); // fonte 'zoom' sobreposta
      return true;
    });
    expect(started).toBe(true);

    // Ambas activas → badge «Pausado» e imóvel.
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    const frozen = /(\d{2}:\d{2})/.exec((await badge.textContent()) ?? '')![1];
    await page.waitForTimeout(2500);
    await expect(badge).toContainText(frozen);

    // Termina SÓ o move (o zoom continua activo) → não retoma cedo de mais.
    await page.evaluate(() => (window as any).__RADAR_MAP__.fire('moveend'));
    await page.waitForTimeout(2500);
    await expect(badge).toContainText(frozen);
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');

    // Termina o zoom (última fonte) → retoma, mas só a partir do próximo tick.
    await page.evaluate(() => (window as any).__RADAR_MAP__.fire('zoomend'));
    await expect(badge).not.toContainText(frozen, { timeout: 5000 });
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('botão play/pause congela o frame sem manter o foco no slider', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');

    const badge = page.locator('[data-radar-badge="true"]');
    const toggle = page.locator('[data-radar-toggle="true"]');
    const slider = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeVisible();

    // A correr, o botão oferece «Pausar radar» e o relógio avança.
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    const runningClock = /(\d{2}:\d{2})/.exec((await badge.textContent()) ?? '')![1];
    await expect(badge).not.toContainText(runningClock, { timeout: 5000 });

    // Pausa manual — congela sem qualquer interacção com o slider. O badge
    // ganha o estado visual «Pausado» (não parece avariado).
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    await expect(badge).toContainText('Pausado');
    await page.waitForTimeout(300); // deixa o React processar a pausa
    const frozenClock = /(\d{2}:\d{2})/.exec((await badge.textContent()) ?? '')![1];
    await page.waitForTimeout(2500);
    await expect(badge).toContainText(frozenClock);

    // Mesmo depois de largar o slider (fim do scrub), o carrossel continua
    // pausado — a pausa manual não é desfeita pelo slider.
    await slider.dispatchEvent('pointerdown');
    await slider.fill('5');
    await slider.dispatchEvent('pointerup');
    await expect(badge).toContainText('00:35'); // frame escolhido (6/12)
    await page.waitForTimeout(2500);
    await expect(badge).toContainText('00:35'); // ainda congelado

    // Reproduzir retoma a partir do frame actual — o estado «Pausado» some.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await expect(badge).not.toContainText('00:35', { timeout: 5000 });
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('restaura a pausa e o frame escolhido após recarregar a página', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');

    const badge = page.locator('[data-radar-badge="true"]');
    const toggle = page.locator('[data-radar-toggle="true"]');
    const slider = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeVisible();

    // Pausa manual + escolhe o frame 6/12 (00:35) — ambos ficam persistidos.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await slider.dispatchEvent('pointerdown');
    await slider.fill('5');
    await slider.dispatchEvent('pointerup');
    await expect(badge).toContainText('6/12');
    await expect(badge).toContainText('00:35');

    // A preferência está no localStorage.
    const saved = await page.evaluate(() => localStorage.getItem('ventu.radar.state'));
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!)).toMatchObject({ paused: true, frame: 5 });

    // Recarrega a página → o radar (desligado por defeito) liga pausado no
    // frame escolhido.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.click('button[aria-label="Radar IPMA"]');
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await expect(badge).toContainText('6/12');
    await expect(badge).toContainText('00:35');

    // Continua congelado (2,5 s ≈ 2 ticks sem avançar).
    await page.waitForTimeout(2500);
    await expect(badge).toContainText('6/12');
  });
});

test.describe('IPMA radar no mapa da homepage (hero)', () => {
  test.use({ serviceWorkers: 'block' });

  /** Relógio actual do badge (HH:MM). */
  const badgeClock = async (badge: Locator) =>
    /(\d{2}:\d{2})/.exec((await badge.textContent()) ?? '')![1];

  test('botão de radar no hero liga o carrossel partilhado com a página de spot', async ({ page }) => {
    await page.route('**/data/radar.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RADAR_STUB),
      });
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });

    // O hero tem o seu próprio botão de radar (não o HUD fullscreen).
    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();

    const badge = page.locator('[data-radar-badge="true"]');
    const scrubber = page.locator('[data-radar-scrubber="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(scrubber).toBeVisible();

    // Mesmo componente partilhado: progresso (N/12) + atribuição Open-Meteo.
    // (O frame inicial exacto é assegurado pelo teste de spot — aqui a página
    // de entrada é pesada e o instante de arranque é inerentemente sujeito a
    // carga; o que importa é o carrossel partilhado animar e ter o HUD.)
    await expect(badge).toContainText('/12');
    await expect(badge).toContainText('Weather data by Open-Meteo.com');

    // Anima (o relógio deixa de ser o do primeiro instante observado).
    const clockBefore = await badgeClock(badge);
    await expect(badge).not.toContainText(clockBefore, { timeout: 5000 });

    // Desligar esconde o carrossel.
    await page.click('button[aria-label="Ocultar radar"]');
    await expect(badge).not.toBeVisible();
  });

  test('pausa quando o separador fica invisível e retoma ao voltar', async ({ page }) => {
    await page.route('**/data/radar.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RADAR_STUB),
      });
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });

    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).not.toContainText('01:00', { timeout: 5000 }); // a animar

    // Separador escondido → o carrossel pausa. Deixa o React processar a
    // pausa antes de capturar a baseline (evita corrida com um tick em voo).
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    const clockBefore = await badgeClock(badge);

    // Em pausa, o carrossel não avança (2,5 s ≈ 2 ticks).
    await page.waitForTimeout(2500);
    await expect(badge).toContainText(clockBefore);

    // Voltar ao separador retoma a partir do frame actual.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(badge).not.toContainText(clockBefore, { timeout: 5000 });
  });

  test('pausa quando o mapa sai do viewport e retoma ao voltar', async ({ page }) => {
    await page.route('**/data/radar.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RADAR_STUB),
      });
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });

    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).not.toContainText('01:00', { timeout: 5000 }); // a animar

    // Scroll até ao fim → o hero (e o carrossel) sai do viewport.
    await page.evaluate(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant' as ScrollBehavior,
      });
    });

    // Guarda honesta: o carrossel ficou mesmo fora do viewport (senão o IO
    // nunca dispararia e o teste falharia com causa clara).
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector('[data-radar-carousel="true"]');
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.bottom < 0 || r.top > window.innerHeight;
        }),
      )
      .toBe(true);

    await page.waitForTimeout(400); // deixa o IO + React processarem
    const clockBefore = await badgeClock(badge);

    // Fora do viewport, o carrossel não avança (2,5 s ≈ 2 ticks).
    await page.waitForTimeout(2500);
    await expect(badge).toContainText(clockBefore);

    // Voltar ao topo retoma a animação.
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    });
    await expect(badge).not.toContainText(clockBefore, { timeout: 5000 });
  });
});
