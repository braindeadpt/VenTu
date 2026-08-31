import { test, expect } from '@playwright/test';
import {
  interceptConditions,
  interceptWaveBias,
  freshObservedWave,
  withoutObservedWave,
  type ConditionsTransform,
} from './helpers/conditions';

/**
 * Observed wave card honesty checks.
 *
 * The card (ObservedWaveCard) renders ONLY when conditions.json[spot].observedWave
 * exists AND is fresh. We intercept /data/conditions.json client-side and either
 * inject a fresh buoy reading (positive) or strip observedWave (negative) —
 * the real build data has none today, so this keeps the test hermetic.
 * (Interception lives in tests/e2e/helpers/conditions.ts — shared with the
 * buoy-warnings and tides specs.)
 */

const SPOT_SLUG = 'guincho';
/** Real spot id used as the conditions.json key (guincho has no alias). */
const SPOT_KEY = 'guincho';

/** Per-spot transform for the guincho entry (empty → no transform). */
function guinchoTransform(
  mode:
    | 'with-observed-wave'
    | 'without-observed-wave'
    | 'single-source-ih'
    | 'coherence-refused'
    | 'coherence-warning'
    | 'coherence-gated-wmo',
): ConditionsTransform {
  if (mode === 'with-observed-wave') {
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
          // Runner-up WMO source + why IH won — the side-by-side block.
          observedWaveAlt: {
            waveHeight: 1.6,
            wavePeriod: 10,
            waveDirection: 300,
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 56,
            observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
            source: 'wmo-buoy',
          },
          observedWaveMeta: {
            winner: 'ih',
            reason: 'ih-fresh',
            ihAgeHours: 1,
            wmoAgeHours: 5,
            ihDistanceKm: 60,
            wmoDistanceKm: 56,
          },
        }),
      },
    };
  }
  if (mode === 'single-source-ih') {
    // Só a fonte vencedora (IH fresca), sem runner-up — o hero/sticky caem
    // para o rótulo compacto de fonte única, nunca para o chip lado a lado.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
        }),
      },
    };
  }
  if (mode === 'coherence-refused') {
    // Sem observedWave (a ES foi recusada; sem IH a leitura cai) — mas a row
    // expõe a recusa cross-border → o aviso [data-coherence-refused] aparece.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWaveCoherenceRefused: { esCode: '6200084', day: '2026-08-14' },
        }),
      },
    };
  }
  if (mode === 'coherence-warning') {
    // A leitura IH está presente (primária, fresca) mas o par ES×PT persiste
    // incoherent há N dias → o card ainda aparece, com o aviso de confiança
    // baixa [data-coherence-warning] — a leitura nacional não é bloqueada.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
          observedWaveCoherenceWarning: {
            esCode: '6200084',
            ptRefCode: '6201077',
            days: 4,
            firstDay: '2026-08-11',
            lastDay: '2026-08-14',
          },
        }),
      },
    };
  }
  if (mode === 'coherence-gated-wmo') {
    // O relatório incoherent (par ES×PT) ativa o gate: a WMO espanhola não
    // é anexada (nem como runner-up). A IH primária mantém-se — o card mostra
    // só a fonte nacional e o aviso de descarte, sem qualquer rótulo WMO.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
          observedWaveCoherenceRefused: { esCode: '6200084', day: '2026-08-14' },
        }),
      },
    };
  }
  return {
    spots: { [SPOT_KEY]: withoutObservedWave },
  };
}

async function gotoSpot(
  page: import('@playwright/test').Page,
  mode:
    | 'with-observed-wave'
    | 'without-observed-wave'
    | 'single-source-ih'
    | 'coherence-refused'
    | 'coherence-warning'
    | 'coherence-gated-wmo',
) {
  await interceptConditions(page, guinchoTransform(mode));

  await page.goto(`/pt/spots/${SPOT_SLUG}/`);
  await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Observed wave card (boia X a Y km)', () => {
  // O site regista um service worker (public/sw.js) que serve /data/* do cache
  // e BURLA o page.route — as injecções de conditions.json tornam-se
  // intermitentes quando o SW activa antes do fetch. Bloquear o SW garante
  // que a rota intercepta sempre (causa raiz da flakiness histórica deste spec).
  test.use({ serviceWorkers: 'block' });

  test('renderiza o rótulo honesto quando observedWave está no JSON', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');

    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Appears twice legitimately now: header line + the IH chip (side-by-side).
    await expect(card.getByText(/boia CSA92\/D a 60 km/i).first()).toBeVisible();
    // Measured vs forecast comparison is present.
    await expect(card.getByText(/Altura \(medida\)|Height \(measured\)/i)).toBeVisible();
    await expect(card.getByText(/1\.8 m/)).toBeVisible();

    // The score badge names the correcting buoy and exposes the skill ME/n.
    const badge = page.getByText('Corrigido pela boia CSA92/D');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', /ME \+0\.2 m \(n=47\)/);

    // Linha «Skill desta boia» com ME/MAE/RMSE/n junto da comparação.
    const skillLine = card.locator('[data-wave-skill="true"]');
    await expect(skillLine).toBeVisible();
    await expect(skillLine).toContainText(/Skill desta boia: ME \+0\.2 m · MAE 0\.4 m · RMSE 0\.5 m \(n=47\)/);

    // IH primary sem calibração cross-border → pill de calibração ausente.
    await expect(card.locator('[data-wave-calibrated="true"]')).toHaveCount(0);
  });

  test('mostra IH vs WMO lado a lado com o vencedor e a razão', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');

    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Both sources side by side — winner IH (✓ a usar), runner-up WMO.
    await expect(card.getByText(/✓\s*IH/)).toBeVisible();
    await expect(card.getByText('WMO', { exact: true })).toBeVisible();
    await expect(card.getByText(/boia Cabo Silleiro a 56 km/i)).toBeVisible();
    // Reason line: the WMO buoy is closer (56 vs 60 km) but IH is primary.
    await expect(card.getByText(/A usar IH — fonte primária fresca; WMO mais próxima/i)).toBeVisible();

    // WMO is OLDER here (5h vs IH 1h) — no aging warning.
    await expect(card.locator('[data-ih-aging="true"]')).toHaveCount(0);
  });

  test('avisa suavemente quando a WMO está mais fresca que o IH (primária a envelhecer)', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
          // WMO mais fresca (0.5h vs IH 2.8h) mas o IH ainda vence por ser primária.
          observedWaveAlt: {
            waveHeight: 1.6,
            wavePeriod: 10,
            waveDirection: 300,
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 56,
            observedAt: new Date(Date.now() - 0.5 * 3_600_000).toISOString(),
            source: 'wmo-buoy',
          },
          observedWaveMeta: {
            winner: 'ih',
            reason: 'ih-fresh',
            ihAgeHours: 2.8,
            wmoAgeHours: 0.5,
            ihDistanceKm: 60,
            wmoDistanceKm: 56,
          },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const warn = card.locator('[data-ih-aging="true"]');
    await expect(warn).toBeVisible();
    await expect(warn).toContainText(/IH a envelhecer/i);
    // A razão continua a explicar a escolha (primária vs WMO mais fresca e próxima).
    await expect(card.getByText(/A usar IH — fonte primária fresca; WMO mais próxima e mais fresca/i)).toBeVisible();
  });

  test('mostra a calibração cross-border quando uma boia ES vence (WMO-only)', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          // Vencedora WMO espanhola (Cabo Silleiro) com calibração ES→PT aplicada
          // pelo merge: altura recalibrada 1.4 m a partir do medido 2.3 m (ME −0.9).
          observedWave: {
            waveHeight: 1.4,
            wavePeriod: 10,
            waveDirection: 280,
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 96.8,
            observedAt: new Date().toISOString(),
            source: 'wmo-buoy',
            calibration: {
              me: -0.9,
              n: 4,
              verdict: 'review',
              from: 'Cabo Silleiro × Datawell ao largo de Faro',
              rawHeight: 2.3,
              deltaM: -0.9,
            },
          },
          observedWaveAlt: null,
          observedWaveMeta: {
            winner: 'wmo',
            reason: 'wmo-only',
            ihAgeHours: null,
            wmoAgeHours: 1,
            ihDistanceKm: null,
            wmoDistanceKm: 96.8,
          },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Pill de calibração: medido → recalibrado + viés ME/n.
    const cal = card.locator('[data-wave-calibrated="true"]');
    await expect(cal).toBeVisible();
    await expect(cal).toContainText(/medido 2\.3 m/);
    await expect(cal).toContainText(/1\.4 m/);
    await expect(cal).toContainText(/viés -0\.9 m \(n=4\)/);

    // O badge do score expõe a calibração no tooltip.
    const badge = page.getByText('Corrigido pela boia Cabo Silleiro');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute(
      'title',
      /recalibrada para a referência PT \(viés ME -0\.9 m, n=4\)/,
    );

    // Chip compacto do hero (fonte única WMO recalibrada): a calibração
    // cross-border também aparece fora do card, com a razão no tooltip.
    const heroChip = page.locator('[data-wave-calibrated="compact"]');
    await expect(heroChip).toBeVisible();
    await expect(heroChip).toContainText(/ref\. PT \(-0\.9 m · n=4\)/);
    await expect(heroChip).toHaveAttribute(
      'title',
      /Leitura espanhola recalibrada para a referência PT \(Cabo Silleiro × Datawell ao largo de Faro\) · ME -0\.9 m \(n=4\)/,
    );
  });

  test('mostra a calibração cross-border no chip da sticky bar após scroll', async ({
    page,
  }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: {
            waveHeight: 1.4,
            wavePeriod: 10,
            waveDirection: 280,
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 96.8,
            observedAt: new Date().toISOString(),
            source: 'wmo-buoy',
            calibration: {
              me: -0.9,
              n: 4,
              verdict: 'review',
              from: 'Cabo Silleiro × Datawell ao largo de Faro',
              rawHeight: 2.3,
              deltaM: -0.9,
            },
          },
          observedWaveAlt: null,
          observedWaveMeta: {
            winner: 'wmo',
            reason: 'wmo-only',
            ihAgeHours: null,
            wmoAgeHours: 1,
            ihDistanceKm: null,
            wmoDistanceKm: 96.8,
          },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Sticky bar só aparece quando o hero sai de vista — rolar até ao fim.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const stickyChip = page.getByRole('region', {
      name: /Métricas principais|Key metrics/,
    });
    await expect(stickyChip).toBeVisible();
    const calChip = stickyChip.locator('[data-wave-calibrated="compact"]');
    await expect(calChip).toBeVisible();
    await expect(calChip).toContainText(/ref\. PT \(-0\.9 m · n=4\)/);
  });

  test('mostra o skill da boia ES (Silleiro) destacado no card mesmo sem IH_API_KEY', async ({
    page,
  }) => {
    // Sem IH_API_KEY não há skill do IH (a cadeia IH não acumula pares sem a
    // chave); o skill que chega ao card vem da boia espanhola via
    // WMO/Copernicus — o card tem de O destacar, não o confundir com o IH.
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          // Vencedora WMO espanhola (fresca, dentro do gate) com o skill ES.
          observedWave: {
            waveHeight: 1.4,
            wavePeriod: 10,
            waveDirection: 280,
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 96.8,
            observedAt: new Date().toISOString(),
            source: 'wmo-buoy',
            skill: {
              me: -0.3,
              mae: 0.5,
              rmse: 0.6,
              corr: 0.88,
              n: 41,
              origin: 'wmo-es',
              buoyName: 'Cabo Silleiro',
            },
          },
          observedWaveAlt: null,
          observedWaveMeta: {
            winner: 'wmo',
            reason: 'wmo-only',
            ihAgeHours: null,
            wmoAgeHours: 1,
            ihDistanceKm: null,
            wmoDistanceKm: 96.8,
          },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Linha de skill ES destacada (não a genérica do IH).
    const esSkill = card.locator('[data-wave-skill="es"]');
    await expect(esSkill).toBeVisible();
    await expect(esSkill).toContainText(/boia espanhola \(Cabo Silleiro\)/);
    await expect(esSkill).toContainText(/ME -0\.3 m · MAE 0\.5 m · RMSE 0\.6 m/);
    await expect(esSkill).toContainText(/\(n=41\)/);
    await expect(esSkill).toContainText(/WMO\/Copernicus \(sem IH_API_KEY\)/);
    // A linha genérica do IH nunca aparece aqui (é uma leitura ES).
    await expect(card.locator('[data-wave-skill="true"]')).toHaveCount(0);
  });

  test('mostra o chip compacto IH vs WMO no hero', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');

    // Hero: ambas as fontes frescas → chip compacto «IH ✓ (1h) · WMO (5h, a 56 km)».
    const chip = page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i);
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toContainText('IH');
    await expect(chip).toContainText('✓');
    await expect(chip).toContainText('(1h)');
    await expect(chip).toContainText('WMO');
    await expect(chip).toContainText('(5h, a 56 km)');
  });

  test('mostra o chip compacto IH vs WMO na sticky bar mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSpot(page, 'with-observed-wave');

    // Garante que os dados carregaram (chip no hero) antes de fazer scroll —
    // evita a corrida entre o fetch do conditions.json e a sticky bar.
    await expect(
      page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i),
    ).toBeVisible({ timeout: 15_000 });

    // Scroll até sair do hero → a sticky bar (md:hidden) aparece.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    const chip = sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i);
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('IH');
    await expect(chip).toContainText('(1h)');
    await expect(chip).toContainText('WMO');
    await expect(chip).toContainText('(5h, a 56 km)');

    // Badge «Corrigido pela boia X» com ME/n na sticky (mesmo caminho do hero).
    const badge = sticky.getByText('Corrigido pela boia CSA92/D');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveAttribute('title', /ME \+0\.2 m \(n=47\)/);
  });

  test('hero mostra o rótulo compacto de fonte única com leitura fresca (sem runner-up)', async ({
    page,
  }) => {
    await gotoSpot(page, 'single-source-ih');

    // Sem runner-up, o chip lado a lado (IH vs WMO) NÃO aparece — o hero cai
    // para o rótulo compacto honesto «boia X a Y km · HH:MM · onda medida»,
    // com a hora da leitura (Europe/Lisbon) além da distância.
    const hero = page.locator('.spot-hero-card');
    await expect(hero.getByText(/boia CSA92\/D a 60 km/)).toBeVisible({ timeout: 15_000 });
    await expect(hero.locator('[data-wave-clock="true"]')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(hero.getByText(/onda medida/)).toBeVisible();
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('badge do score: «Corrigido pela boia» com leitura fresca, nunca «Só previsão»', async ({
    page,
  }) => {
    await gotoSpot(page, 'with-observed-wave');

    const hero = page.locator('.spot-hero-card');
    // O badge do score (ScoreWaveSourceBadge) usa a altura medida → rótulo
    // da boia vencedora + tooltip com o skill ME/n. Escopo pelo title único da
    // fonte de ONDA (o badge de vento também usa «Só previsão» quando não há
    // vento fresco — não deve colidir com estas asserções).
    const waveBadge = hero.locator('[title*="altura de onda medida pela boia"]');
    await expect(waveBadge).toBeVisible({ timeout: 15_000 });
    await expect(waveBadge).toHaveText('Corrigido pela boia CSA92/D');
    await expect(waveBadge).toHaveAttribute('title', /ME \+0\.2 m \(n=47\)/);
    // Com leitura fresca o rótulo de previsão da ONDA nunca aparece.
    await expect(hero.locator('[title*="Sem correcção de boia"]')).toHaveCount(0);
    // O factor do score indica a medição — «Ondas 1.8m (boia)».
    await expect(hero.getByText('1.8m (boia)')).toBeVisible();
  });

  test('badge do score: «Só previsão» sem leitura fresca da boia', async ({ page }) => {
    await gotoSpot(page, 'without-observed-wave');

    const hero = page.locator('.spot-hero-card');
    // Sem observedWave fresco → a onda usa a previsão do modelo, rótulo honesto.
    // (O badge de vento pode também dizer «Só previsão» se a observação IPMA
    // real estiver velha — daí o escopo pelo title exclusivo da onda.)
    const waveBadge = hero.locator('[title*="Sem correcção de boia"]');
    await expect(waveBadge).toBeVisible({ timeout: 15_000 });
    await expect(waveBadge).toHaveText('Só previsão');
    await expect(waveBadge).toHaveAttribute('title', /Sem correcção de boia — score com a previsão do modelo/);
    // Nenhuma correcção de boia é apresentada (nem no hero nem no card).
    await expect(page.getByText(/Corrigido pela boia/i)).toHaveCount(0);
  });

  test('fallback: boia velha + wave-bias.json da região → «Corrigido (viés regional)»', async ({
    page,
  }) => {
    // Boia velha (5h, além do gate IH) SEM meta waveBias na row — a row não
    // foi corrigida pela pipeline (flag off). O client consulta o
    // wave-bias.json e aplica o viés da região (Cascais, guincho) como fallback.
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({
            observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
          }),
        }),
      },
    });
    await interceptWaveBias(page, {
      fetchedAt: new Date().toISOString(),
      regions: {
        Cascais: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 },
      },
    });

    await page.goto('/pt/spots/guincho/');
    const hero = page.locator('.spot-hero-card');
    // Badge honesto do fallback (viés regional), nunca o de tempo real.
    const badge = hero.locator('[title*="Viés regional"]');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toHaveText('Corrigido (viés regional)');
    await expect(badge).toHaveAttribute('title', /Viés regional ME \+0\.3 m \(n=120\)/);
    // A altura mostrada é a previsão corrigida pelo viés (1.46 + 0.3 → 1.8 m),
    // e o factor do score indica o fallback — «Ondas 1.8m (viés regional)».
    await expect(hero.getByText('1.8m (viés regional)')).toBeVisible();
    await expect(hero.locator('[title*="altura de onda medida pela boia"]')).toHaveCount(0);
  });

  test('fallback: sem viés da região no wave-bias.json → «Só previsão» (nunca inventa)', async ({
    page,
  }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({
            observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
          }),
        }),
      },
    });
    // A região do guincho (Cascais) NÃO existe no ficheiro — só Lisboa.
    await interceptWaveBias(page, {
      fetchedAt: new Date().toISOString(),
      regions: {
        Lisboa: { n: 120, me: 0.3 },
      },
    });

    await page.goto('/pt/spots/guincho/');
    const hero = page.locator('.spot-hero-card');
    const waveBadge = hero.locator('[title*="Sem correcção de boia"]');
    await expect(waveBadge).toBeVisible({ timeout: 20_000 });
    await expect(waveBadge).toHaveText('Só previsão');
    await expect(hero.locator('[title*="Viés regional"]')).toHaveCount(0);
    // Altura sem correcção (o valor real do build) e sem sufixo de medição.
    await expect(hero.getByText('1.5m')).toBeVisible();
    await expect(hero.getByText(/1\.5m \(boia\)|1\.5m \(viés regional\)/)).toHaveCount(0);
  });

  test('sticky bar desktop: mostra o observedWave quando o hero sai de vista', async ({ page }) => {
    // Viewport desktop (config default ~1280×720) — a barra deixou de ser
    // md:hidden; aparece sempre que o hero sai do viewport, com o chip.
    await gotoSpot(page, 'with-observed-wave');

    // Garante que os dados carregaram (chip no hero) antes do scroll.
    await expect(
      page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i),
    ).toBeVisible({ timeout: 15_000 });

    // A barra NÃO está visível com o hero em vista.
    await expect(page.getByRole('region', { name: /Métricas principais|Key metrics/i })).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Chip lado a lado IH vs WMO na barra desktop (mesmo caminho do mobile).
    const chip = sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i);
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('IH');
    await expect(chip).toContainText('(1h)');
    await expect(chip).toContainText('WMO');
    await expect(chip).toContainText('(5h, a 56 km)');
  });

  test('sticky bar mostra o chip «boia X a Y km» de fonte única com leitura fresca', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSpot(page, 'single-source-ih');

    // Espera o rótulo do hero carregar (fetch do conditions.json) antes do scroll.
    const hero = page.locator('.spot-hero-card');
    await expect(hero.getByText(/boia CSA92\/D a 60 km/)).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Chip compacto de fonte única (Stat «medida») — nunca o lado a lado.
    await expect(sticky.getByText(/boia CSA92\/D a 60 km/)).toBeVisible({ timeout: 10_000 });
    await expect(sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('sem leitura fresca (ausente) o hero e a sticky não mostram chip nem rótulo compacto', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSpot(page, 'without-observed-wave');

    const hero = page.locator('.spot-hero-card');
    await expect(hero.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(hero.locator('[data-wave-clock="true"]')).toHaveCount(0);
    await expect(hero.getByText(/onda medida/)).toHaveCount(0);
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });
    await expect(sticky.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('leitura velha (>3h) não é apresentada como fresca no hero nem na sticky', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          // Leitura IH com 5h — além do gate de frescura do ih-buoy (3h). A onda
          // existe no JSON mas o compacto NUNCA a mostra como se fosse ao vivo.
          observedWave: freshObservedWave({
            observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
          }),
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
    // Sem card nem compacto — nada é apresentado como onda observada fresca.
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
    const hero = page.locator('.spot-hero-card');
    await expect(hero.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(hero.locator('[data-wave-clock="true"]')).toHaveCount(0);
    await expect(hero.getByText(/onda medida/)).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });
    await expect(sticky.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('badge «Vento observado» expõe o viés da estação (ME/n) no tooltip quando há windBias', async ({
    page,
  }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          // Vento observado fresco + viés da estação acumulado pelo merge.
          observed: {
            windSpeedKt: 16,
            windDirDeg: 337,
            windCardinal: 'NW',
            stationName: 'Cascais',
            distanceKm: 5,
            observedAt: new Date().toISOString(),
            source: 'ipma',
          },
          windBias: {
            station: 'Cascais',
            source: 'ipma',
            me: 2.1,
            mae: 3.4,
            rmse: 4.2,
            n: 340,
          },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const badge = page.getByText('Vento observado');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toHaveAttribute('title', /ME \+2\.1 kt \(n=340\)/);
    await expect(badge).toHaveAttribute('title', /IPMA \/ Ecowitt \/ METAR/);
  });

  test('badge «Vento observado» sem windBias não inventa viés', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observed: {
            windSpeedKt: 16,
            windDirDeg: 337,
            windCardinal: 'NW',
            stationName: 'Cascais',
            distanceKm: 5,
            observedAt: new Date().toISOString(),
            source: 'ipma',
          },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const badge = page.getByText('Vento observado');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    // Sem windBias o tooltip mantém-se o texto base (sem viés inventado).
    await expect(badge).toHaveAttribute('title', /fresco$/);
    await expect(badge).not.toHaveAttribute('title', /n=\d+\.?\d*/);
  });

  test('linha discreta «skill desta boia» aparece sem leitura fresca (forecast-skill.json)', async ({
    page,
  }) => {
    // Sem observedWave fresco → sem card; a linha discreta vem do
    // forecast-skill.json + mapeamento spot→boia (ih-buoys.json).
    await interceptConditions(page, { spots: { [SPOT_KEY]: withoutObservedWave } });
    await page.route('**/data/forecast-skill.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetchedAt: '2026-08-15T03:52:42.802Z',
          pairCount: 47,
          byBuoy: {
            19: { buoyName: 'CSA92/D', n: 47, me: 0.2, mae: 0.4, rmse: 0.5, corr: 0.91, meanLeadHours: 12 },
          },
        }),
      });
    });
    await page.route('**/data/ih-buoys.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetchedAt: '2026-08-15T03:00:00.000Z',
          stations: {},
          spotMapping: { guincho: { idEst: 19, distanceKm: 60 } },
        }),
      });
    });

    await page.goto('/pt/spots/guincho/');
    const line = page.locator('[data-buoy-skill-line="true"]');
    await expect(line).toBeVisible({ timeout: 20_000 });
    await expect(line).toContainText(/Skill desta boia \(CSA92\/D\): ME \+0\.2 m · RMSE 0\.5 m · r 0\.91 \(n=47\)/);
    // Sem card (não há leitura fresca) — a linha é a única exposição do skill.
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
  });

  test('sem forecast-skill.json a linha discreta não aparece (degrada em silêncio)', async ({ page }) => {
    await interceptConditions(page, { spots: { [SPOT_KEY]: withoutObservedWave } });
    await page.route('**/data/forecast-skill.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fetchedAt: null, pairCount: 0, byBuoy: {} }),
      });
    });
    await page.route('**/data/ih-buoys.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spotMapping: { guincho: { idEst: 19 } } }),
      });
    });

    await page.goto('/pt/spots/guincho/');
    await page.waitForTimeout(3_000);
    await expect(page.locator('[data-buoy-skill-line="true"]')).toHaveCount(0);
  });

  test('nunca aparece sem observedWave no JSON', async ({ page }) => {
    await gotoSpot(page, 'without-observed-wave');

    // Give the client time to fetch + render; the card must stay absent.
    await page.waitForTimeout(4_000);
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
    await expect(page.getByText(/boia CSA92\/D a 60 km/i)).toHaveCount(0);
    await expect(page.getByText(/boia .+ a \d+ km/i)).toHaveCount(0);
    // No correction badge either — the score is labelled forecast only.
    await expect(page.getByText(/Corrigido pela boia/i)).toHaveCount(0);
  });

  test('avisa quando a leitura ES foi descartada por incoerência do par ES×PT', async ({ page }) => {
    await gotoSpot(page, 'coherence-refused');

    const notice = page.locator('[data-coherence-refused="true"]');
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('descartada hoje');
    await expect(notice).toContainText('ES×PT');
    // Mesmo sem o card (sem observedWave), o aviso está lá — informa que a ES
    // foi recusada por incoerência, não por estar em baixo.
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
  });

  test('avisa confiança baixa quando o par ES×PT persiste incoherent por vários dias', async ({ page }) => {
    await gotoSpot(page, 'coherence-warning');

    // O card de onda continua a mostrar a leitura IH (primária, não bloqueada).
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toBeVisible({
      timeout: 15_000,
    });
    // E o aviso de confiança baixa aparece junto do card.
    const notice = page.locator('[data-coherence-warning="true"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('incoherent há 4 dias');
    // Não é a recusa (a IH não foi bloqueada) — só o aviso de confiança.
    await expect(page.locator('[data-coherence-refused="true"]')).toHaveCount(0);
  });
});
