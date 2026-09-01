import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  interceptConditions,
  interceptWaveBias,
  interceptWarnings,
  freshObservedWave,
  withoutObservedWave,
  withoutObservedWind,
  type ConditionsTransform,
} from './helpers/conditions';

/**
 * Altura de onda REAL do build para o guincho — muda a cada run da pipeline
 * (conditions.json é actualizado pelo GitHub Actions). Os testes de fallback
 * do viés afirmam a PRESENÇA/AUSÊNCIA da correcção, não um número congelado
 * do build antigo (o valor foi 1.5/1.46 quando escritos).
 */
const REAL_GUINCHO_WAVE_M = (() => {
  try {
    const raw = JSON.parse(
      readFileSync('public/data/conditions.json', 'utf-8'),
    );
    const v = Number(raw?.guincho?.waveHeight);
    return Number.isFinite(v) && v > 0 ? v : 1.5;
  } catch {
    return 1.5;
  }
})();

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
    | 'single-source-wmo-es'
    | 'coherence-refused'
    | 'coherence-warning'
    | 'coherence-gated-wmo'
    | 'bridge',
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
  if (mode === 'single-source-wmo-es') {
    // Fonte única WMO-ES (Cabo Silleiro) fresca, sem runner-up. Leitura com
    // 5.5h: DENTRO do gate WMO (6h) mas FORA do gate IH (3h) — prova que é o
    // gate 6h da fonte que manda na frescura, não o do IH.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 57,
            source: 'wmo-buoy',
            stationCode: '6200084',
            observedAt: new Date(Date.now() - 5.5 * 3_600_000).toISOString(),
            skill: undefined,
          }),
        }),
      },
    };
  }
  if (mode === 'with-wave-bias') {
    // Row com meta waveBias (fallback regional): a altura já vem corrigida
    // pela pipeline e o score declara a origem como bias-corrected — o sufixo
    // do factor (hero/ForecastTable) deve ser «(viés regional)» / «(regional
    // bias)», nunca «(boia)». `withoutObservedWave` torna o cenário hermético:
    // uma leitura fresca no build (ex. WMO Nazaré 6200199) ganharia ao viés e
    // o badge passaria a «Corrigido pela boia» — o teste não pode depender do
    // estado do build.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...withoutObservedWave(entry),
          waveHeight: 1.8, // já corrigida pela pipeline
          waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
        }),
      },
    };
  }
  if (mode === 'coherence-refused') {
    // Sem observedWave (a ES foi recusada; sem IH a leitura cai) — mas a row
    // expõe a recusa cross-border → o aviso [data-coherence-refused] aparece.
    // Delete explícito: a row REAL pode ter observedWave (ex. WMO Nazaré
    // 6200199 fresca) — o cenário é sobre a recusa, não sobre a leitura.
    return {
      spots: {
        [SPOT_KEY]: (entry) => {
          const { observedWave, ...rest } = entry;
          return {
            ...rest,
            observedWaveCoherenceRefused: { esCode: '6200084', day: '2026-08-14' },
          };
        },
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
  if (mode === 'bridge') {
    // Ponte keyless Costa de Prata ← Cabo Silleiro (ES): a leitura WMO de
    // longa distância marca `bridge` no payload — o card mostra a nota
    // «Ponte keyless» e o rótulo honesto com a distância real.
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 281,
            source: 'wmo-buoy',
            bridge: true,
            stationCode: '6200084',
            skill: undefined,
          }),
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
    | 'single-source-wmo-es'
    | 'coherence-refused'
    | 'coherence-warning'
    | 'coherence-gated-wmo'
    | 'with-wave-bias',
  locale: 'pt' | 'en' = 'pt',
) {
  await interceptConditions(page, guinchoTransform(mode));

  await page.goto(`/${locale}/spots/${SPOT_SLUG}/`);
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

    // Cadeia de atribuição exacta da fonte (da tabela de /fontes, src/lib/dataSources.tsx)
    // aparece junto da leitura WMO: a nota Copernicus obrigatória — nunca genérica.
    const footer = card.locator('[data-data-source="copernicus"]');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/Fonte da medição:/);
    await expect(footer).toContainText(
      /Generated using E\.U\. Copernicus Marine Service Information/,
    );
    await expect(footer.locator('a[href*="marine.copernicus.eu"]')).toBeVisible();
  });

  test('auditoria: nota de atribuição corresponde à fonte exibida (IH ↔ Copernicus, sem a contraparte)', async ({
    page,
  }) => {
    // Pares dinâmicos derivados do metadata (waveCardAttributionExpectation): a
    // cadeia mostrada tem de corresponder à fonte verdadeiramente exibida.

    // Lado IH: só a nota «Dados © Instituto Hidrográfico» — Copernicus NUNCA.
    await gotoSpot(page, 'single-source-ih');
    const ihCard = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(ihCard).toBeVisible({ timeout: 15_000 });
    const ihFooter = ihCard.locator('[data-data-source="ih"]');
    await expect(ihFooter).toBeVisible();
    await expect(ihFooter).toContainText(/Instituto Hidrográfico/);
    await expect(ihFooter).not.toContainText(/Copernicus/i);
    await expect(ihCard.locator('[data-data-source="copernicus"]')).toHaveCount(0);

    // Lado WMO/Copernicus: nota Copernicus obrigatória, IH ausente.
    await gotoSpot(page, 'single-source-wmo-es');
    const wmoCard = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(wmoCard).toBeVisible({ timeout: 15_000 });
    const wmoFooter = wmoCard.locator('[data-data-source="copernicus"]');
    await expect(wmoFooter).toBeVisible();
    await expect(wmoFooter).toContainText(
      /Generated using E\.U\. Copernicus Marine Service Information/,
    );
    await expect(wmoFooter).not.toContainText(/Instituto Hidrográfico/);
    await expect(wmoCard.locator('[data-data-source="ih"]')).toHaveCount(0);
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

    // Para além da idade relativa, cada segmento tem o tooltip com a hora
    // EXACTA da leitura (Europe/Lisbon, mesmo relógio do hero) + estação.
    const timed = chip.locator('[title*="leitura"]');
    await expect(timed).toHaveCount(2);
    const ihSeg = chip.locator('[title*="CSA92/D"]');
    await expect(ihSeg).toHaveAttribute('title', /IH ✓ \(1h\) · CSA92\/D · leitura \d{2}:\d{2}$/);
    const wmoSeg = chip.locator('[title*="Cabo Silleiro"]');
    await expect(wmoSeg).toHaveAttribute('title', /WMO \(5h, a 56 km\) · Cabo Silleiro · leitura \d{2}:\d{2}$/);
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

    // O tooltip da hora exacta também na sticky (mesmo componente partilhado):
    // os dois segmentos têm «leitura HH:MM» no title, sem ocupar espaço.
    await expect(chip.locator('[title*="leitura"]')).toHaveCount(2);
    await expect(chip.locator('[title*="CSA92/D"]').first()).toHaveAttribute(
      'title',
      /leitura \d{2}:\d{2}$/,
    );

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
        [SPOT_KEY]: (entry) => {
          const { waveBias: _omit, ...rest } = entry;
          return {
            ...rest,
            observedWave: freshObservedWave({
              observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
            }),
          };
        },
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
    // Tooltip completo: Δ (correcção efectiva) + origem client-side — o
    // fallback correu em runtime (wave-bias.json), nunca confundido com a
    // correcção baked pela pipeline.
    await expect(badge).toHaveAttribute(
      'title',
      /Δ \+0\.3 m aplicado à altura\. Viés regional ME \+0\.3 m \(n=120\)\. Correcção em tempo real \(wave-bias\.json, client-side\)\./,
    );
    // A altura mostrada é a previsão do build corrigida pelo viés regional
    // (waveHeight real + 0.3), e o factor do score indica o fallback.
    // Mesma aritmética do client (round1), não `(raw + 0.3).toFixed(1)` —
    // e o StatChip preserva a casa de `2.0m` (não colapsa para `2m`).
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const corrected = `${Math.max(0.1, round1(REAL_GUINCHO_WAVE_M + 0.3)).toFixed(1)}m (viés regional)`;
    await expect(hero.getByText(corrected)).toBeVisible();
    await expect(hero.locator('[title*="altura de onda medida pela boia"]')).toHaveCount(0);
  });

  test('pipeline: meta waveBias na row (sem fallback) → tooltip distingue a origem', async ({
    page,
  }) => {
    // A row JÁ traz o meta waveBias baked pela pipeline (VENTU_WAVE_BIAS_
    // CORRECTION=1) — sem o campo `fallback`. O tooltip do badge diz
    // «Correcção aplicada pela pipeline», nunca «client-side». O
    // `withoutObservedWave` garante que nenhuma leitura fresca do build rouba
    // o lugar ao viés (hermético).
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...withoutObservedWave(entry),
          waveHeight: 1.8, // já corrigida pela pipeline
          waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const hero = page.locator('.spot-hero-card');
    const badge = hero.locator('[title*="Viés regional"]');
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toHaveText('Corrigido (viés regional)');
    await expect(badge).toHaveAttribute('title', /Δ \+0\.3 m aplicado à altura\. Viés regional ME \+0\.3 m \(n=120\)\. Correcção aplicada pela pipeline \(meta na row\)\./);
  });

  test('waveBias na row sem leitura fresca → «Corrigido (viés regional)» com ME/n no hero', async ({
    page,
  }) => {
    // O caso honesto do pedido: a row traz o meta waveBias baked pela pipeline
    // e NENHUMA leitura de boia (nem fresca nem velha) — o badge do score no
    // hero mostra «Corrigido (viés regional)» com o ME/n do viés no tooltip,
    // nunca inventa uma boia. `withoutObservedWave` torna o cenário
    // independente do build (uma leitura WMO fresca futura ganharia ao viés).
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...withoutObservedWave(entry),
          waveHeight: 1.8, // já corrigida pela pipeline
          waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
        }),
      },
    });

    await page.goto('/pt/spots/guincho/');
    const hero = page.locator('.spot-hero-card');
    await expect(hero).toBeVisible({ timeout: 20_000 });

    // Badge no hero: rótulo honesto + tooltip completo com ME/n do viés.
    const badge = hero.locator('[title*="Viés regional"]');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText('Corrigido (viés regional)');
    await expect(badge).toHaveAttribute(
      'title',
      /Δ \+0\.3 m aplicado à altura\. Viés regional ME \+0\.3 m \(n=120\)\. Correcção aplicada pela pipeline \(meta na row\)\./,
    );

    // Sem leitura de boia, nunca aparece linguagem de boia — nem no badge,
    // nem no sufixo do factor do hero.
    await expect(hero.getByText(/Corrigido pela boia/i)).toHaveCount(0);
    await expect(hero.getByText(/\(boia\)/)).toHaveCount(0);

    // A linha de ondas da ForecastTable declara a mesma origem (bias-corrected)
    // com o sufixo do factor — as superfícies nunca divergem.
    const tableRegion = page.getByRole('region', { name: /Previsão horária|Hourly forecast/i });
    await expect(tableRegion).toBeVisible({ timeout: 20_000 });
    const wavesLabel = tableRegion.locator('[data-wave-correction="bias-corrected"]').first();
    await expect(wavesLabel).toBeVisible({ timeout: 15_000 });
    await expect(wavesLabel).toContainText('(viés regional)');
    await expect(wavesLabel).toHaveAttribute('title', /viés regional.*horas seguintes/i);
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
    // Altura sem correcção (valor real do build) e SEM sufixo de medição/viés
    // — o ponto do teste é a ausência da correcção, não o número exacto.
    await expect(hero.getByText(`${REAL_GUINCHO_WAVE_M.toFixed(1)}m`)).toBeVisible();
    await expect(hero.getByText(/m \(boia\)|m \(viés regional\)/)).toHaveCount(0);
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

    // A barra SUBSTITUI a linha de sport tabs: com a barra activa existe um
    // ÚNICO tablist exposto — o da barra — e a linha standalone fica invisible
    // (aria-hidden no pai). Sem duplicação nem overlap: nunca duas filas de tabs.
    const tablists = page.getByRole('tablist');
    await expect(tablists).toHaveCount(1);
    await expect(tablists).toBeVisible();
    // O tablist vive DENTRO da barra (top:64px, onde estava a linha standalone).
    await expect(sticky.locator('[role="tablist"]')).toHaveCount(1);

    // Chip lado a lado IH vs WMO na barra desktop (mesmo caminho do mobile).
    const chip = sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i);
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('IH');
    await expect(chip).toContainText('(1h)');
    await expect(chip).toContainText('WMO');
    await expect(chip).toContainText('(5h, a 56 km)');
  });

  test('sport tabs continuam visíveis e clicáveis após scroll com a sticky bar activa (desktop)', async ({
    page,
  }) => {
    // A barra fica abaixo dos tabs (fix do overlap) — mas o que importa ao
    // utilizador é que os tabs continuem a funcionar com a sticky activa. O
    // Playwright só completa o click se o alvo for accionável (não obscurecido),
    // logo um click OK é a prova de não-bloqueio pela barra.
    await gotoSpot(page, 'with-observed-wave');

    // Garante que os dados carregaram (chip no hero) antes do scroll.
    await expect(
      page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i),
    ).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Tabs visíveis com a sticky activa (o tablist sticky mantém-se no topo,
    // a barra fica logo abaixo). Lê-se o estado real por nth(i) — o default
    // activo depende da ordenação runtime dos compatibleSports, não é fixo.
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();
    const tabs = tablist.getByRole('tab');
    const n = await tabs.count();
    expect(n).toBeGreaterThanOrEqual(2);
    let activeIdx = -1;
    let targetIdx = -1;
    for (let i = 0; i < n; i++) {
      const sel = await tabs.nth(i).getAttribute('aria-selected');
      if (sel === 'true' && activeIdx === -1) activeIdx = i;
      else if (sel !== 'true') targetIdx = i;
    }
    expect(activeIdx).toBeGreaterThanOrEqual(0); // algum tab está activo
    expect(targetIdx).toBeGreaterThanOrEqual(0);

    const target = tabs.nth(targetIdx);
    await expect(target).toBeVisible();
    // Clicar um tab não-activo com a sticky activa → a selecção muda. O
    // Playwright só completa o click se o alvo for accionável (não obscurecido)
    // — falharia se a barra cobrisse a linha de tabs.
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(activeIdx)).toHaveAttribute('aria-selected', 'false');
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

    // A hora da leitura vive SÓ no tooltip (title) do chip — a barra de 56px
    // não ganha espaço visual; o mesmo clock do hero (Europe/Lisbon, HH:MM).
    const stat = sticky.locator('[title*="a 60 km"]');
    await expect(stat).toBeVisible({ timeout: 10_000 });
    await expect(stat).toHaveAttribute('title', /a 60 km · leitura \d{2}:\d{2}$/);
  });

  test('fonte única WMO-ES fresca (Cabo Silleiro, gate 6h) → rótulo no hero e na sticky', async ({
    page,
  }) => {
    // Variante espanhola do single-source: leitura WMO de 5.5h — dentro do
    // gate WMO (6h) mas fora do IH (3h). Se a frescura usasse o gate do IH, o
    // rótulo não aparecia; mostrar «boia Cabo Silleiro a 57 km» prova o gate 6h.
    await gotoSpot(page, 'single-source-wmo-es');

    // Hero: rótulo honesto de fonte única + relógio da leitura + «onda medida».
    const hero = page.locator('.spot-hero-card');
    await expect(hero.getByText(/boia Cabo Silleiro a 57 km/)).toBeVisible({ timeout: 15_000 });
    await expect(hero.locator('[data-wave-clock="true"]')).toBeVisible();
    await expect(hero.getByText(/onda medida/)).toBeVisible();
    // Sem runner-up → nunca o chip lado a lado.
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)/i)).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Sticky: mesmo rótulo de fonte única (Stat «medida») + tooltip com a hora.
    await expect(sticky.getByText(/boia Cabo Silleiro a 57 km/)).toBeVisible({ timeout: 10_000 });
    await expect(sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)/i)).toHaveCount(0);
    const stat = sticky.locator('[title*="a 57 km"]');
    await expect(stat).toBeVisible({ timeout: 10_000 });
    await expect(stat).toHaveAttribute('title', /a 57 km · leitura \d{2}:\d{2}$/);
  });

  test('sticky desktop: badge «Corrigido pela boia» com ME/n após scroll (correcção)', async ({
    page,
  }) => {
    // O mesmo par de estados do badge do hero, agora na barra sticky desktop:
    // com leitura fresca, o ScoreWaveSourceBadge aparece na barra após o hero
    // sair de vista — com o ME/n do skill no tooltip e o sufixo na altura.
    await gotoSpot(page, 'with-observed-wave');

    // Garante que os dados carregaram (chip no hero) antes do scroll.
    await expect(
      page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i),
    ).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Badge do score na barra: «Corrigido pela boia CSA92/D» com ME/n.
    const badge = sticky.getByText('Corrigido pela boia CSA92/D');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveAttribute('title', /ME \+0\.2 m \(n=47\)/);
    // A altura da Stat mostra a medição com o sufixo do factor.
    await expect(sticky.getByText('1.8m (boia)')).toBeVisible();
  });

  test('sticky desktop: sem correcção → NENHUM badge (nem «Corrigido» nem «Só previsão»)', async ({
    page,
  }) => {
    // O outro lado do par: sem leitura fresca nem viés, a barra sticky NÃO
    // mostra o ScoreWaveSourceBadge — ao contrário do hero (que mostra «Só
    // previsão»), a sticky só renderiza o badge quando há correcção.
    await gotoSpot(page, 'without-observed-wave');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Nenhum badge (nem o de correcção nem o de previsão pura).
    await expect(sticky.getByText(/Corrigido|Só previsão/i)).toHaveCount(0);
    // A altura da Stat aparece sem sufixo de correcção (previsão pura).
    await expect(sticky.getByText(/\(boia\)|\(viés regional\)/i)).toHaveCount(0);
    await expect(sticky.getByText(/\d\.\dm/).first()).toBeVisible();
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

  test('auditoria vento: a nota de atribuição corresponde à estação exibida (IPMA ↔ METAR/Ecowitt)', async ({
    page,
  }) => {
    // Pares dinâmicos derivados do metadata (windCardAttributionExpectation): a
    // cadeia mostrada junto do score/observação tem de corresponder à estação
    // realmente exibida — ex. METAR mostra aviationweather, nunca Ecowitt/IPMA.

    // Lado IPMA: nota «Dados IPMA» — Ecowitt/METAR ausentes.
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
    const hero = page.locator('.spot-hero-card');
    await expect(hero.locator('[data-wind-attribution="ipma"]')).toBeVisible({ timeout: 20_000 });
    await expect(hero.locator('[data-wind-attribution="ipma"]')).toContainText('IPMA');
    await expect(hero.locator('[data-wind-attribution="ipma"]')).not.toContainText(/aviationweather|Ecowitt/i);
    await expect(hero.locator('[data-wind-attribution="metar"]')).toHaveCount(0);
    await expect(hero.locator('[data-wind-attribution="ecowitt"]')).toHaveCount(0);

    // Lado METAR: nota aviationweather — IPMA/Ecowitt ausentes (a contraparte).
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observed: {
            windSpeedKt: 14,
            windDirDeg: 310,
            windCardinal: 'NW',
            stationName: 'Lisboa Aeroporto',
            metarIcao: 'LPPT',
            distanceKm: 18,
            observedAt: new Date().toISOString(),
            source: 'metar',
          },
        }),
      },
    });
    await page.goto('/pt/spots/guincho/');
    const heroMetar = page.locator('.spot-hero-card');
    await expect(heroMetar.locator('[data-wind-attribution="metar"]')).toBeVisible({ timeout: 20_000 });
    await expect(heroMetar.locator('[data-wind-attribution="metar"]')).toContainText(/aviationweather\.gov/);
    await expect(heroMetar.locator('[data-wind-attribution="metar"]')).not.toContainText('IPMA');
    await expect(heroMetar.locator('[data-wind-attribution="ipma"]')).toHaveCount(0);
    await expect(heroMetar.locator('[data-wind-attribution="ecowitt"]')).toHaveCount(0);

    // Sem vento observado → o hero NÃO mostra nenhuma nota de estação; o vento
    // do score é da previsão (open-meteo), sem cadeia de estação na superfície.
    // `withoutObservedWave` só tira a boia — o build pode trazer IPMA fresco.
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => withoutObservedWind(withoutObservedWave(entry)),
      },
    });
    await page.goto('/pt/spots/guincho/');
    const heroForecast = page.locator('.spot-hero-card');
    await expect(heroForecast.locator('[data-wind-attribution="ipma"]')).toHaveCount(0);
    await expect(heroForecast.locator('[data-wind-attribution="metar"]')).toHaveCount(0);
    await expect(heroForecast.locator('[data-wind-attribution="ecowitt"]')).toHaveCount(0);
    await expect(heroForecast.locator('[data-wind-attribution="open-meteo"]')).toHaveCount(0);
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

  test('ponte keyless: card mostra a nota e o rótulo honesto (Cabo Silleiro a 281 km)', async ({
    page,
  }) => {
    await gotoSpot(page, 'bridge');

    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });
    // A nota da ponte aparece junto do card.
    const note = page.locator('[data-wave-bridge="true"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Ponte keyless');
    await expect(note).toContainText('Cabo Silleiro (ES)');
    // Distância real, nunca local (o rótulo honesto aparece no header e
    // repetido dentro da nota da ponte — .first() cobre ambos).
    await expect(card.getByText(/boia Cabo Silleiro a 281 km/i).first()).toBeVisible();
  });

  test('mostra o chip «Mar perigoso» no card e na sticky bar quando há aviso activo', async ({
    page,
  }) => {
    // Agitação Marítima activa para o guincho — chip de aviso no card e na
    // sticky bar, com o mesmo warningBadgeLabel das outras superfícies.
    await interceptWarnings(page, {
      source: 'ipma',
      fetchedAt: new Date().toISOString(),
      warnings: [
        {
          areaCode: 'LIS',
          areaLabel: 'Lisboa',
          type: 'Agitação Marítima',
          level: 'orange',
          text: 'Ondulação de NW com ondas de 4 a 5 metros.',
          relevant: true,
        },
      ],
      spotWarnings: {
        [SPOT_KEY]: [
          {
            areaCode: 'LIS',
            areaLabel: 'Lisboa',
            type: 'Agitação Marítima',
            level: 'orange',
            text: 'Ondulação de NW com ondas de 4 a 5 metros.',
            relevant: true,
          },
        ],
      },
    });

    await gotoSpot(page, 'with-observed-wave');

    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Chip «Mar perigoso» no card, com nível localizado e área no tooltip.
    const cardChip = card.locator('[data-map-warning="true"]');
    await expect(cardChip).toBeVisible({ timeout: 10_000 });
    await expect(cardChip).toContainText('Mar perigoso');
    await expect(cardChip).toHaveAttribute(
      'title',
      /Aviso IPMA: Mar perigoso \(Laranja\) · Lisboa/,
    );

    // Sticky bar desktop: mesmo chip compacto quando o hero sai de vista.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });
    const compact = sticky.locator('[data-map-warning="compact"]');
    await expect(compact).toBeVisible({ timeout: 10_000 });
    await expect(compact).toContainText('Mar perigoso');
  });

  test('sticky bar mobile: chip «Mar perigoso» compacto quando o hero sai de vista', async ({
    page,
  }) => {
    // Mesmo cenário em viewport móvel (390×844): a sticky bar (56px) mostra o
    // chip compacto com o MESMO rótulo/tooltip do desktop — nunca diverge.
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptWarnings(page, {
      source: 'ipma',
      fetchedAt: new Date().toISOString(),
      warnings: [
        {
          areaCode: 'LIS',
          areaLabel: 'Lisboa',
          type: 'Agitação Marítima',
          level: 'orange',
          text: 'Ondulação de NW com ondas de 4 a 5 metros.',
          relevant: true,
        },
      ],
      spotWarnings: {
        [SPOT_KEY]: [
          {
            areaCode: 'LIS',
            areaLabel: 'Lisboa',
            type: 'Agitação Marítima',
            level: 'orange',
            text: 'Ondulação de NW com ondas de 4 a 5 metros.',
            relevant: true,
          },
        ],
      },
    });

    await gotoSpot(page, 'with-observed-wave');

    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const sticky = page.getByRole('region', { name: /Métricas principais|Key metrics/i });
    await expect(sticky).toBeVisible({ timeout: 15_000 });

    // Chip compacto na barra móvel — mesmo rótulo e tooltip do desktop.
    const compact = sticky.locator('[data-map-warning="compact"]');
    await expect(compact).toBeVisible({ timeout: 10_000 });
    await expect(compact).toContainText('Mar perigoso');
    await expect(compact).toHaveAttribute(
      'title',
      /Aviso IPMA: Mar perigoso \(Laranja\) · Lisboa/,
    );
  });

  test('sem aviso activo não inventa o chip «Mar perigoso»', async ({ page }) => {
    await interceptWarnings(page, {
      source: 'ipma',
      fetchedAt: new Date().toISOString(),
      warnings: [],
      spotWarnings: {},
    });

    await gotoSpot(page, 'with-observed-wave');
    const card = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-map-warning="true"]')).toHaveCount(0);
    await expect(page.locator('[data-map-warning]')).toHaveCount(0);
  });

  test('comparador: sufixo do factor «(boia)» e «(viés regional)» na altura', async ({ page }) => {
    // O comparador (/pt/compare/) busca conditions.json client-side e mostra a
    // altura já corrigida (boia/viés) — o sufixo nomeia a origem da correcção
    // a partir da row crua. Interceptar para os dois spots: guincho com leitura
    // fresca (→ «(boia)»), carcavelos com meta waveBias (→ «(viés regional)»).
    await interceptConditions(page, {
      spots: {
        // Guincho: leitura boia WMO/espanhola fresca → sufixo «(boia)» E a nota
        // Copernicus junto da altura (não só no card de onda observada).
        guincho: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({
            source: 'wmo-buoy',
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
          }),
        }),
        carcavelos: (entry) => ({
          ...entry,
          waveHeight: 1.8, // já corrigida pela pipeline (rawToScoreInput não aplica waveBias)
          waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
        }),
      },
    });

    await page.goto('/pt/compare/?spots=guincho,carcavelos');

    // Guincho: altura da boia (1.8m do fixture) + sufixo honesto + nota Copernicus.
    const guinchoCard = page.locator('article').filter({ hasText: /Guincho/ }).first();
    await expect(guinchoCard).toBeVisible({ timeout: 15_000 });
    await expect(guinchoCard).toContainText('1.8m (boia)');
    await expect(guinchoCard).not.toContainText('(viés regional)');
    // Nota de atribuição junto da leitura WMO (a MESMA cadeia da /fontes).
    const note = guinchoCard.locator('[data-wave-attribution="copernicus"]');
    await expect(note).toBeVisible({ timeout: 10_000 });
    await expect(note).toContainText(/Generated using E\.U\. Copernicus Marine Service/);

    // Carcavelos: meta waveBias → «(viés regional)», nunca «(boia)».
    const carcavelosCard = page.locator('article').filter({ hasText: /Carcavelos/ }).first();
    await expect(carcavelosCard).toBeVisible({ timeout: 15_000 });
    await expect(carcavelosCard).toContainText('1.8m (viés regional)');
    await expect(carcavelosCard).not.toContainText('(boia)');
    // Viés regional (sem leitura boia) → NENHUMA nota de atribuição no card.
    await expect(carcavelosCard.locator('[data-wave-attribution]')).toHaveCount(0);
  });

  test('comparador: chip «Mar perigoso» no card do spot com aviso activo', async ({ page }) => {
    // O comparador (/pt/compare/) mostra os cards lado a lado — quando um spot
    // tem aviso activo, o MESMO WarningPill do card/sticky/mapa aparece no seu
    // card, com o rótulo honesto «Mar perigoso» e o tooltip com nível/área.
    await interceptConditions(page, {});
    await interceptWarnings(page, {
      source: 'ipma',
      fetchedAt: new Date().toISOString(),
      warnings: [
        {
          areaCode: 'LIS',
          areaLabel: 'Lisboa',
          type: 'Agitação Marítima',
          level: 'orange',
          text: 'Ondulação de NW com ondas de 4 a 5 metros.',
          relevant: true,
        },
      ],
      spotWarnings: {
        guincho: [
          {
            areaCode: 'LIS',
            areaLabel: 'Lisboa',
            type: 'Agitação Marítima',
            level: 'orange',
            text: 'Ondulação de NW com ondas de 4 a 5 metros.',
            relevant: true,
          },
        ],
      },
    });

    await page.goto('/pt/compare/?spots=guincho,carcavelos');

    const guinchoCard = page.locator('article').filter({ hasText: /Guincho/ }).first();
    await expect(guinchoCard).toBeVisible({ timeout: 15_000 });
    const guinchoPill = guinchoCard.locator('[data-map-warning="compare"]');
    await expect(guinchoPill).toBeVisible({ timeout: 10_000 });
    await expect(guinchoPill).toContainText('Mar perigoso');
    await expect(guinchoPill).toHaveAttribute(
      'title',
      /Aviso IPMA: Mar perigoso \(Laranja\) · Lisboa/,
    );

    // Carcavelos sem aviso → nunca inventa o chip no card do comparador.
    const carcavelosCard = page.locator('article').filter({ hasText: /Carcavelos/ }).first();
    await expect(carcavelosCard).toBeVisible({ timeout: 15_000 });
    await expect(carcavelosCard.locator('[data-map-warning]')).toHaveCount(0);
  });

  test('EN: sufixos «(buoy)» e «(regional bias)» na página /en/spots/guincho/', async ({ page }) => {
    // Variação EN do factor honesto: a mesma row (boia fresca / viés regional)
    // traduz o sufixo do hero e da linha de ondas da ForecastTable — valida
    // que a localização pt/en nunca diverge na origem da correcção.

    // Boia fresca → «(buoy)» no hero e na tabela, tooltip EN.
    await gotoSpot(page, 'with-observed-wave', 'en');
    const heroBuoy = page.locator('.spot-hero-stat').filter({ hasText: /Waves/ }).first();
    await expect(heroBuoy).toBeVisible({ timeout: 15_000 });
    await expect(heroBuoy).toContainText('1.8m (buoy)');
    await expect(heroBuoy).not.toContainText('(boia)');

    const tableEn = page.getByRole('region', { name: /Hourly forecast/i });
    await expect(tableEn).toBeVisible({ timeout: 20_000 });
    const wavesLabelEn = tableEn.locator('[data-wave-correction="observed"]').first();
    await expect(wavesLabelEn).toBeVisible({ timeout: 15_000 });
    await expect(wavesLabelEn).toContainText('Waves (m) (buoy)');
    await expect(wavesLabelEn).toHaveAttribute('title', /measured by buoy CSA92\/D.*following hours/i);

    // Viés regional → «(regional bias)» no hero e na tabela, nunca «(buoy)».
    await gotoSpot(page, 'with-wave-bias', 'en');
    const heroBias = page.locator('.spot-hero-stat').filter({ hasText: /Waves/ }).first();
    await expect(heroBias).toBeVisible({ timeout: 15_000 });
    await expect(heroBias).toContainText('1.8m (regional bias)');
    await expect(heroBias).not.toContainText('(buoy)');

    const wavesLabelBias = page
      .getByRole('region', { name: /Hourly forecast/i })
      .locator('[data-wave-correction="bias-corrected"]')
      .first();
    await expect(wavesLabelBias).toBeVisible({ timeout: 15_000 });
    await expect(wavesLabelBias).toContainText('(regional bias)');
    await expect(wavesLabelBias).toHaveAttribute('title', /regional bias.*following hours/i);
  });

  test('ForecastTable: rótulo da linha de ondas com sufixo «(boia)» e tooltip honesto', async ({ page }) => {
    // A tabela horária mostra a previsão por hora — mas quando o score actual
    // foi corrigido pela boia, o rótulo da linha de ondas anexa o sufixo do
    // factor e o tooltip explica que a medição vale para as horas seguintes
    // (as células continuam a mostrar a previsão, nunca fingem medição).
    await gotoSpot(page, 'with-observed-wave');

    const tableRegion = page.getByRole('region', { name: /Previsão horária|Hourly forecast/i });
    await expect(tableRegion).toBeVisible({ timeout: 20_000 });

    // Rótulo da linha de ondas: «Ondas (m) (boia)» com o data-wave-correction.
    const wavesLabel = tableRegion.locator('[data-wave-correction="observed"]').first();
    await expect(wavesLabel).toBeVisible({ timeout: 15_000 });
    await expect(wavesLabel).toContainText('(boia)');
    await expect(wavesLabel).toHaveAttribute('title', /boia CSA92\/D.*horas seguintes/i);

    // Sem correcção → sem sufixo nem data attribute.
    await gotoSpot(page, 'without-observed-wave');
    await expect(tableRegion).toBeVisible({ timeout: 20_000 });
    await expect(tableRegion.locator('[data-wave-correction]')).toHaveCount(0);
    const plainLabel = tableRegion.getByText(/Ondas \(m\)/i).first();
    await expect(plainLabel).toBeVisible();
    await expect(plainLabel).not.toContainText('(boia)');
  });
});
