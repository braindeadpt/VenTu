import { test, expect, type Locator } from '@playwright/test';
import { interceptRadar } from './helpers/conditions';

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

/**
 * Fecha o relógio do browser (page.clock) ANTES da navegação: o carrossel usa
 * setInterval(tickMs=1000), e com o fake clock instalado nenhum tick corre até
 * o teste o avançar explicitamente. Elimina a corrida residual entre ligar o
 * radar e as asserções do frame inicial (o 01:00 / 1/12 escapava sob carga
 * com workers paralelos a atrasarem os timers) — o frame inicial é agora
 * garantidamente 01:00 até `runFor(1000)`.
 */
const FROZEN_TIME = new Date('2026-08-15T01:06:00.000Z');

/** Relógio actual do badge (HH:MM). */
const badgeClock = (badge: Locator) =>
  badge.textContent().then((t) => /(\d{2}:\d{2})/.exec(t ?? '')![1]);

test.describe('IPMA radar carousel', () => {
  // Mesmo motivo do observed-wave-card: o SW serve radar.json do cache e
  // burla o page.route usado para injectar os frames sintéticos.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    // Expõe o mapa (__RADAR_MAP__) para os testes de sobreposição de movimentos
    // dispararem eventos Leaflet de forma determinística. Tem de ser registado
    // ANTES do page.goto (addInitScript após navegação não se aplica à página).
    // O mesmo setup dos specs de mapa (map-popup-ver-spot, mar-perigoso): sem o
    // windRingLegendSeen, a legend coach abre como modal fixo centrado (idle,
    // até 4s) e o mouse.down do drag acerta no modal — o mapa nunca arranca o
    // drag e o carrossel não pausa (flake histórico deste teste).
    await page.addInitScript(() => {
      (window as any).__RADAR_TEST__ = true;
      localStorage.setItem('ventu:windRingLegendSeen', '1');
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await interceptRadar(page, RADAR_STUB);
    // Relógio congelado ANTES da navegação: desde o arranque a página vive sob
    // fake timers — o setInterval(1000) do carrossel não corre até runFor.
    await page.clock.install({ time: FROZEN_TIME });
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    // Deixa a hidratação/efeitos do mapa assentarem com o relógio parado.
    await page.clock.runFor(500);
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
    await page.clock.runFor(100); // deixa o React montar o badge
    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText('Weather data by Open-Meteo.com');
    await expect(badge).toContainText('CC BY 4.0');

    // A atribuição OBRIGATÓRIA do IPMA (dados de radar) aparece lado a lado
    // com a do Open-Meteo, cada uma com o seu link — o radar são frames reais
    // do IPMA, por isso não basta o crédito do modelo.
    const attribs = badge.locator('[data-radar-attributions="true"]');
    await expect(attribs).toBeVisible();
    await expect(attribs).toContainText('Dados IPMA');
    await expect(attribs).toContainText('Weather data by Open-Meteo.com');
    await expect(attribs.locator('a[href="https://www.ipma.pt/"]')).toBeVisible();
    await expect(attribs.locator('a[href="https://open-meteo.com/"]')).toBeVisible();

    // Desligar esconde o badge (a atribuição do mapa mantém-se).
    await page.click('button[aria-label="Ocultar radar"]');
    await page.clock.runFor(100);
    await expect(badge).not.toBeVisible();
    await expect(attribution).toContainText('Weather data by Open-Meteo.com');
  });

  test('deep link ?radar=1 liga o radar à entrada no mapa fullscreen', async ({ page }) => {
    // Vindo do botão de imersão do carrossel (spot/hero) — o /mapa entra com
    // o radar já ligado, sem qualquer clique no HUD.
    await page.goto('/pt/mapa/?radar=1', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.clock.runFor(500);

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText('/12');
    await expect(badge).toContainText('Weather data by Open-Meteo.com');

    // O HUD reflecte o estado ligado (toggle pressionado).
    await expect(page.getByRole('button', { name: 'Ocultar radar' })).toBeVisible();
  });

  test('anima os 12 frames com indicador de hora e progresso', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');
    await page.clock.runFor(100); // monta o badge

    const badge = page.locator('[data-radar-badge="true"]');
    const slider = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Relógio congelado: o frame inicial é determinístico — NENHUM tick correu
    // desde ligar, por isso o 01:00 / 1/12 não pode escapar (corrida eliminada;
    // já nem é preciso pausar o carrossel com pointerdown).
    await expect(badge).toContainText('1/12');
    await expect(badge).toContainText('01:00');
    // O tooltip do badge mostra data + hora exactas do frame (não só HH:mm),
    // para distinguir frames de dias diferentes.
    await expect(badge).toHaveAttribute(
      'title',
      'Precipitação real (radar IPMA, 5 min) · 2026-08-15 01:00',
    );
    await expect(slider).toHaveValue('0');

    // Um tick (1 s) → frame 2 · 00:55 — avanço granular e determinístico.
    await page.clock.runFor(1000);
    await expect(badge).toContainText('2/12');
    await expect(badge).toContainText('00:55');
    await expect(slider).toHaveValue('1');

    // Desligar o radar esconde o badge.
    await page.click('button[aria-label="Ocultar radar"]');
    await page.clock.runFor(100);
    await expect(badge).not.toBeVisible();
  });

  test('scrubber percorre os frames manualmente e pausa o carrossel', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    const scrubber = page.locator('[data-radar-scrubber="true"]');
    const slider = scrubber.locator('input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(scrubber).toBeVisible();
    await expect(slider).toHaveAttribute('max', '11');

    // Interagir (pointer down → frame 5) pausa o carrossel e mostra a hora do frame.
    await slider.dispatchEvent('pointerdown');
    await slider.fill('5');
    await page.clock.runFor(50);
    await expect(badge).toContainText('6/12');
    await expect(badge).toContainText('00:35');
    // Tooltip actualizado para o frame escolhido (data + hora).
    await expect(badge).toHaveAttribute('title', /· 2026-08-15 00:35$/);

    // Em pausa, o carrossel não avança mesmo depois de 2 ticks avançarem.
    await page.clock.runFor(2500);
    await expect(badge).toContainText('6/12');

    // Soltar retoma o carrossel a partir do frame escolhido.
    await slider.dispatchEvent('pointerup');
    await page.clock.runFor(1000);
    await expect(badge).toContainText('7/12');
  });

  test('pausa o carrossel durante drag do mapa e retoma ao parar', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');
    await page.clock.runFor(100);

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
    await page.clock.runFor(400); // deixa os eventos de drag propagarem

    const clockDuringDrag = await badgeClock(badge);

    // Estado visual «Pausado» enquanto o mapa se move — não parece avariado.
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    await expect(badge).toContainText('Pausado');

    // Enquanto o drag está segurado, o carrossel não avança (2 ticks avançam).
    await page.clock.runFor(2500);
    await expect(badge).toContainText(clockDuringDrag);

    // Soltar retoma a partir do frame actual (o relógio muda no próximo tick)
    // e o estado «Pausado» desaparece.
    await page.mouse.up();
    await page.clock.runFor(1200); // Leaflet fire moveend + 1 tick
    await expect(badge).not.toContainText(clockDuringDrag);
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('movimentos sobrepostos (drag + zoom) só retomam quando o ÚLTIMO termina', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');
    await page.clock.runFor(100);

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
    await page.clock.runFor(50);

    // Ambas activas → badge «Pausado» e imóvel.
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    const frozen = await badgeClock(badge);
    await page.clock.runFor(2500);
    await expect(badge).toContainText(frozen);

    // Termina SÓ o move (o zoom continua activo) → não retoma cedo de mais.
    await page.evaluate(() => (window as any).__RADAR_MAP__.fire('moveend'));
    await page.clock.runFor(2500);
    await expect(badge).toContainText(frozen);
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');

    // Termina o zoom (última fonte) → retoma, mas só a partir do próximo tick.
    await page.evaluate(() => (window as any).__RADAR_MAP__.fire('zoomend'));
    await page.clock.runFor(1200);
    await expect(badge).not.toContainText(frozen);
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('botão play/pause congela o frame sem manter o foco no slider', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    const toggle = page.locator('[data-radar-toggle="true"]');
    const slider = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeVisible();

    // A correr, o botão oferece «Pausar radar»; um tick avança o relógio.
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await page.clock.runFor(1000);
    await expect(badge).toContainText('2/12');

    // Pausa manual — congela sem qualquer interacção com o slider. O badge
    // ganha o estado visual «Pausado» (não parece avariado).
    await toggle.click();
    await page.clock.runFor(50);
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    await expect(badge).toContainText('Pausado');
    const frozenClock = await badgeClock(badge);
    await page.clock.runFor(2500);
    await expect(badge).toContainText(frozenClock);

    // Mesmo depois de largar o slider (fim do scrub), o carrossel continua
    // pausado — a pausa manual não é desfeita pelo slider.
    await slider.dispatchEvent('pointerdown');
    await slider.fill('5');
    await slider.dispatchEvent('pointerup');
    await page.clock.runFor(50);
    await expect(badge).toContainText('00:35'); // frame escolhido (6/12)
    await page.clock.runFor(2500);
    await expect(badge).toContainText('00:35'); // ainda congelado

    // Reproduzir retoma a partir do frame actual — o estado «Pausado» some.
    await toggle.click();
    await page.clock.runFor(1200);
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await expect(badge).not.toContainText('00:35');
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('restaura a pausa e o frame escolhido após recarregar a página', async ({ page }) => {
    await page.click('button[aria-label="Radar IPMA"]');
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    const toggle = page.locator('[data-radar-toggle="true"]');
    const slider = page.locator('[data-radar-scrubber="true"] input[type="range"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeVisible();

    // Pausa manual + escolhe o frame 6/12 (00:35) — ambos ficam persistidos.
    await toggle.click();
    await page.clock.runFor(50);
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await slider.dispatchEvent('pointerdown');
    await slider.fill('5');
    await slider.dispatchEvent('pointerup');
    await page.clock.runFor(50);
    await expect(badge).toContainText('6/12');
    await expect(badge).toContainText('00:35');

    // A preferência está no localStorage (radar ligado + pausado + frame).
    const saved = await page.evaluate(() => localStorage.getItem('ventu.radar.state'));
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!)).toMatchObject({ enabled: true, paused: true, frame: 5 });

    // Recarrega a página → o radar fica LIGADO (persistência) e pausado no
    // frame escolhido, sem novo clique. A navegação reinicia os fake timers;
    // o carrossel monta já pausado (estado em localStorage), por isso não
    // precisa de relógio para ficar imóvel.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.clock.install({ time: FROZEN_TIME }); // re-fecha após o reload
    await page.clock.runFor(100);
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await expect(badge).toContainText('6/12');
    await expect(badge).toContainText('00:35');

    // Continua congelado (2 ticks avançam sem efeito — está pausado).
    await page.clock.runFor(2500);
    await expect(badge).toContainText('6/12');
  });
});

test.describe('IPMA radar no mapa da homepage (hero)', () => {
  test.use({ serviceWorkers: 'block' });

  // Mesmo setup de mapa do describe anterior: a legend coach (windRingLegend)
  // abre como modal centrado no grid /pt/spots/ e pode cobrir o botão do radar
  // ou interceptar cliques — determinístico com o flag visto (padrão da suite).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ventu:windRingLegendSeen', '1');
      localStorage.setItem('ventu.map.cluster', '0');
    });
  });

  test('attribution control está visível no hero (Open-Meteo CC BY) sem ligar o radar', async ({ page }) => {
    // Homepage featured hero: o mapa embebido (embedMode="hero") NÃO mostrara
    // controlo de atribuição antes — o Leaflet era criado com attributionControl:
    // false e o controlo só era adicionado fora do hero. A cadeia obrigatória
    // tem de aparecer sempre, com ou sem o radar ligado.
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    const attribution = page.locator('.leaflet-control-attribution');
    // Controlo de atribuição presente no hero do mapa embebido.
    await expect(attribution).toBeVisible({ timeout: 15_000 });
    await expect(attribution).toContainText('Weather data by Open-Meteo.com');
    await expect(attribution).toContainText('CC BY 4.0');
    await expect(attribution.locator('a[href="https://open-meteo.com/"]')).toBeVisible();
    // O basemap Carto/OSM também aparece (atribuição do tile layer recolhida).
    await expect(attribution).toContainText('OpenStreetMap');
  });

  test('botão de radar no hero liga o carrossel partilhado com a página de spot', async ({ page }) => {
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, RADAR_STUB);
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.clock.runFor(500); // hidratação do hero

    // O hero tem o seu próprio botão de radar (não o HUD fullscreen).
    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    const scrubber = page.locator('[data-radar-scrubber="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(scrubber).toBeVisible();

    // Mesmo componente partilhado: progresso (N/12) + atribuição Open-Meteo.
    await expect(badge).toContainText('/12');
    await expect(badge).toContainText('Weather data by Open-Meteo.com');

    // Anima determinístico: arranca em 01:00 e avança um tick → 00:55.
    await expect(badge).toContainText('01:00');
    await page.clock.runFor(1000);
    await expect(badge).toContainText('00:55');

    // Desligar esconde o carrossel.
    await page.click('button[aria-label="Ocultar radar"]');
    await page.clock.runFor(100);
    await expect(badge).not.toBeVisible();
  });

  test('mostra aviso discreto de frames em falta quando a cadência tem gaps >5 min', async ({ page }) => {
    // Stub com bruto: o mais recente 01:00 e o seguinte 00:45 (gap de 15 min =
    // 2 cadências de 5 min que o IPMA não publicou). O carrossel salta para o
    // último frame válido e o badge avisa com a contagem, em vez de saltar mudo.
    const GAP_STUB = {
      ...RADAR_STUB,
      frameTime: '2026-08-15T01:00:00.000Z',
      framePath: 'pcr-2026-08-15T0100.png',
      imagePath: 'radar/ipma-radar.png',
      frames: [
        { frameTime: '2026-08-15T01:00:00.000Z', framePath: 'pcr-2026-08-15T0100.png', imagePath: 'radar/frames/pcr-2026-08-15T0100.png' },
        { frameTime: '2026-08-15T00:45:00.000Z', framePath: 'pcr-2026-08-15T0045.png', imagePath: 'radar/frames/pcr-2026-08-15T0045.png' },
        { frameTime: '2026-08-15T00:40:00.000Z', framePath: 'pcr-2026-08-15T0040.png', imagePath: 'radar/frames/pcr-2026-08-15T0040.png' },
      ],
    };
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, GAP_STUB);
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.clock.runFor(500);

    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText('01:00');

    // Aviso discreto com a contagem (2 frames em falta entre 01:00 e 00:45).
    const gap = page.locator('[data-radar-gap="true"]');
    await expect(gap).toBeVisible();
    await expect(gap).toContainText('2 frames em falta');

    // Um tick salta para o último frame válido depois do gap → 00:45.
    await page.clock.runFor(1000);
    await expect(badge).toContainText('00:45');

    // A cadência contígua seguinte (00:45 → 00:40) já não avisa.
    await expect(gap).not.toBeVisible();
  });

  test('botão play/pause no hero congela/retoma o carrossel partilhado', async ({ page }) => {
    // Mesma semântica do teste play/pause do /mapa, mas no hero da homepage:
    // o toggle partilhado (mesmo RadarCarousel) tem de pausar/reproduzir lá
    // também — quem só usa a homepage merece o mesmo controlo.
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, RADAR_STUB);
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.clock.runFor(500);

    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    const toggle = page.locator('[data-radar-toggle="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeVisible();

    // A correr, o botão oferece «Pausar radar»; arranca no frame inicial.
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await expect(badge).toContainText('01:00');

    // Pausa manual — congela mesmo com ticks a avançar.
    await toggle.click();
    await page.clock.runFor(50);
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    await expect(badge).toHaveAttribute('data-radar-paused', 'true');
    const frozenClock = await badgeClock(badge);
    await page.clock.runFor(2500);
    await expect(badge).toContainText(frozenClock);

    // Reproduzir retoma — o relógio muda e o estado «Pausado» some.
    await toggle.click();
    await page.clock.runFor(1200);
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await expect(badge).not.toContainText(frozenClock);
    await expect(badge).not.toHaveAttribute('data-radar-paused', 'true');
  });

  test('pausa quando o separador fica invisível e retoma ao voltar', async ({ page }) => {
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, RADAR_STUB);
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.clock.runFor(500);

    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    // A animar: arranca em 01:00 e avança um tick.
    await expect(badge).toContainText('01:00');
    await page.clock.runFor(1000);
    await expect(badge).toContainText('00:55');

    // Separador escondido → o carrossel pausa.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(50);
    const clockBefore = await badgeClock(badge);

    // Em pausa, o carrossel não avança (2 ticks avançam sem efeito).
    await page.clock.runFor(2500);
    await expect(badge).toContainText(clockBefore);

    // Voltar ao separador retoma a partir do frame actual.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(1200);
    await expect(badge).not.toContainText(clockBefore);
  });

  test('pausa quando o mapa sai do viewport e retoma ao voltar', async ({ page }) => {
    // Sem relógio congelado de propósito: a pausa por viewport é dirigida pelo
    // IntersectionObserver, cujo callback é entregue no ciclo de rendering real
    // do browser — não por timers JS. Não é sobre a corrida do frame inicial
    // (a pausa do viewport é funcional), por isso usa tempo real como antes.
    await interceptRadar(page, RADAR_STUB);
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

  test('botão de imersão abre o /mapa com o radar já ligado', async ({ page }) => {
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, RADAR_STUB);
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.clock.runFor(500);

    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();
    await page.clock.runFor(100);

    // O badge do carrossel ganha o link de imersão (fora do fullscreen).
    const fullscreenLink = page.locator('[data-radar-fullscreen="true"]');
    await expect(fullscreenLink).toBeVisible({ timeout: 15_000 });
    await expect(fullscreenLink).toHaveAttribute('href', '/pt/mapa/?radar=1');
    await expect(fullscreenLink).toHaveAttribute('aria-label', 'Radar em ecrã inteiro');

    // Clicar navega para o /mapa com o radar já ligado (badge visível, sem clique).
    await fullscreenLink.click();
    await page.waitForURL('**/pt/mapa/?radar=1', { timeout: 30_000 });
    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toContainText('/12');
    // Em fullscreen o link de imersão desaparece (já lá estamos).
    await expect(page.locator('[data-radar-fullscreen="true"]')).not.toBeVisible();
  });

  test('preferência de ligar/desligar o radar persiste no hero entre visitas', async ({ page }) => {
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, RADAR_STUB);
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });

    // Garantido off à partida (sessão limpa).
    await page.evaluate(() => localStorage.removeItem('ventu.radar.state'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.clock.runFor(500); // re-close após o reload
    const heroBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(heroBtn).toBeVisible({ timeout: 30_000 });
    await heroBtn.click();
    await page.clock.runFor(100);

    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // A preferência foi gravada ao ligar.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ventu.radar.state') ?? '{}'),
    );
    expect(stored.enabled).toBe(true);

    // Recarregar restaura o radar ligado (sem novo clique) — persistência.
    await page.reload({ waitUntil: 'networkidle' });
    await page.clock.runFor(500);
    // Com o radar ligado à entrada, o botão reflecte «Ocultar radar».
    const offBtn = page.getByRole('button', { name: 'Ocultar radar' });
    await expect(offBtn).toBeVisible({ timeout: 15_000 });
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Desligar persiste off e o recarregar volta a abrir sem radar.
    await offBtn.click();
    await page.clock.runFor(100);
    await expect(badge).not.toBeVisible();
    const storedOff = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ventu.radar.state') ?? '{}'),
    );
    expect(storedOff.enabled).toBe(false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.clock.runFor(500);
    await expect(badge, { timeout: 10_000 }).not.toBeVisible();
  });

  test('botão de radar liga o carrossel no mapa embebido do grid de spots', async ({ page }) => {
    await page.clock.install({ time: FROZEN_TIME });
    await interceptRadar(page, RADAR_STUB);
    // A preferência persistida de LIGAR podia entrar com o radar à mostra;
    // este teste quer o caminho explícito do botão no mapa embebido.
    await page.goto('/pt/spots/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => localStorage.removeItem('ventu.radar.state'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.clock.runFor(500);

    // O mapa embebido (modo default, não fullscreen/hero) tem o seu botão de
    // radar na pilha de controlos — o mesmo toggle do /mapa e do hero.
    const radarBtn = page.getByRole('button', { name: 'Radar IPMA' });
    await expect(radarBtn).toBeVisible({ timeout: 30_000 });
    await radarBtn.click();
    await page.clock.runFor(100);

    // O mesmo RadarCarousel partilhado: badge com frames + scrubber e as duas
    // atribuições (IPMA dados de radar + Open-Meteo) lado a lado.
    const badge = page.locator('[data-radar-badge="true"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-radar-scrubber="true"]')).toBeVisible();
    await expect(badge).toContainText('/12');
    const attribs = badge.locator('[data-radar-attributions="true"]');
    await expect(attribs).toContainText('Dados IPMA');
    await expect(attribs).toContainText('Weather data by Open-Meteo.com');

    // Fora do fullscreen, o badge expõe também o link de imersão para o /mapa.
    const fullscreenLink = page.locator('[data-radar-fullscreen="true"]');
    await expect(fullscreenLink).toBeVisible();
    await expect(fullscreenLink).toHaveAttribute('href', '/pt/mapa/?radar=1');

    // Desligar esconde o carrossel embebido.
    await page.click('button[aria-label="Ocultar radar"]');
    await page.clock.runFor(100);
    await expect(badge).not.toBeVisible();
  });
});

test.describe('IPMA radar no HUD fullscreen com viewport móvel', () => {
  test.use({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  // Em fullscreen móvel o HUD inferior (z-1100) entra colapsado; o carrossel
  // (z-1000) ergue-se por cima dele medindo a altura real via ResizeObserver
  // (radarLift). Estes testes validam a «subida acima do HUD» com o HUD
  // colapsado E ao expandir — sem relógio porque o lift é dirigido por layout,
  // não por timers (como a pausa por viewport).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__RADAR_TEST__ = true;
      localStorage.setItem('ventu:windRingLegendSeen', '1');
      localStorage.setItem('ventu.map.cluster', '0');
    });
    await interceptRadar(page, RADAR_STUB);
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  });

  test('carrossel ergue-se acima do HUD colapsado e re-ergue ao expandir', async ({ page }) => {
    const hud = page.locator('[data-map-hud-collapsed]');
    const carousel = page.locator('[data-radar-carousel="true"]');

    // O HUD entra colapsado no móvel (padrão de /mapa).
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'true');

    // Liga o radar pelo toggle dentro do HUD colapsado.
    await page.click('button[aria-label="Radar IPMA"]');
    await expect(carousel).toBeVisible({ timeout: 15_000 });

    // Guarda honesta do lift: o carrossel fica erguido por cima do HUD (bottom
    // do carrossel acima do topo do HUD), não sobreposto nem interceptado.
    const assertAboveHud = async () => {
      await expect
        .poll(async () => {
          const c = await carousel.boundingBox();
          const h = await hud.boundingBox();
          if (!c || !h) return false;
          return c.y + c.height <= h.y + 1;
        })
        .toBe(true);
    };
    await assertAboveHud();

    // Bottom do carrossel > bottom do HUD colapsado também não se sobrepõe.
    const carouselBox = await carousel.boundingBox();
    const hudBox = await hud.boundingBox();
    expect(carouselBox!.y + carouselBox!.height).toBeLessThanOrEqual(hudBox!.y + 1);

    // Expandir filtros (HUD fica mais alto) → o carrossel re-ergue e mantém-se
    // acima (ResizeObserver detectou a mudança de altura).
    const expandBtn = page.getByRole('button', { name: /Mostrar filtros|Show filters/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await expect(hud).toHaveAttribute('data-map-hud-collapsed', 'false');
    await assertAboveHud();

    // O botão play/pause continua clicável (não interceptado pelo HUD), mesmo
    // colapsado: pausa congelada e retoma.
    const toggle = page.locator('[data-radar-toggle="true"]');
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir radar');
    const badge = page.locator('[data-radar-badge="true"]');
    const frozen = await badgeClock(badge);
    await page.waitForTimeout(2500); // 2 ticks reais — congelado na pausa manual
    await expect(badge).toContainText(frozen);

    // Reproduzir retoma a partir do frame actual.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Pausar radar');
    await expect(badge).not.toContainText(frozen, { timeout: 5000 });
  });
});