import { test, expect } from '@playwright/test';
import {
  interceptConditions,
  interceptForecastsForToday,
  interceptWaveBias,
  interceptWarnings,
  interceptIhBuoys,
  interceptWmoBuoys,
  freshObservedWave,
  withoutObservedWave,
  type ConditionsTransform,
} from './helpers/conditions';

/**
 * Leitura da boia no conditions.json — o que ainda a mostra (ou não deve
 * mostrar) depois da retirada dos duplicados da página de spot v6 (#184).
 *
 * O antigo cartão «Onda observada» (ObservedWaveCard) vivia no painel «Agora»,
 * que saiu. Por decisão do Pedro (2026-10-15) a leitura da boia voltou, em
 * markup v6, ao fim do «Estudar o spot» (BoiaV6): rótulo honesto, IH vs WMO
 * com o vencedor e a razão, calibração cross-border, skill da boia, ponte
 * keyless, avisos de coerência ES×PT e a cadeia de atribuição. Os selos
 * «Corrigido pela boia/viés regional» e os sufixos da tabela viviam em «Como
 * sabemos» e na tabela «Hora a hora», que continuam fora. Ficam também: a
 * régua v6 (selector, nota, chip «Mar perigoso», nada de leituras velhas
 * apresentadas como frescas), a regra de ouro (uma só onda da hora, a do
 * Porquê) e o comparador (/compare/), que continua a mostrar a fonte.
 * Interceptamos /data/conditions.json client-side (helpers/conditions.ts).
 */

const SPOT_SLUG = 'guincho';
/** Real spot id used as the conditions.json key (guincho has no alias). */
const SPOT_KEY = 'guincho';

type ObservedScenario =
  | 'with-observed-wave'
  | 'without-observed-wave'
  | 'single-source-ih'
  | 'single-source-wmo-es'
  | 'coherence-refused'
  | 'coherence-warning'
  | 'bridge';

function guinchoTransform(mode: ObservedScenario): ConditionsTransform {
  if (mode === 'with-observed-wave') {
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
          // Runner-up WMO source + why IH won.
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
    return {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
          observedWaveAlt: undefined,
          observedWaveMeta: undefined,
        }),
      },
    };
  }
  if (mode === 'single-source-wmo-es') {
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
          observedWaveAlt: undefined,
          observedWaveMeta: undefined,
        }),
      },
    };
  }
  if (mode === 'coherence-refused') {
    // Sem observedWave (a ES foi recusada; sem IH a leitura cai) — mas a row
    // expõe a recusa cross-border → o aviso [data-coherence-refused] aparece.
    return {
      spots: {
        [SPOT_KEY]: (entry) => {
          const { observedWave: _omit, ...rest } = entry;
          return { ...rest, observedWaveCoherenceRefused: { esCode: '6200084', day: '2026-08-14' } };
        },
      },
    };
  }
  if (mode === 'coherence-warning') {
    // A leitura IH está presente (primária, fresca) mas o par ES×PT persiste
    // incoherent há N dias → a leitura aparece, com o aviso de confiança baixa.
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
    // Ponte keyless Costa de Prata ← Cabo Silleiro (ES): rótulo honesto com a distância real.
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
  return {
    spots: { [SPOT_KEY]: withoutObservedWave },
  };
}

/**
 * Abre o «Estudar o spot» (um <details> fechado por omissão), onde vive a
 * leitura da boia. Com retry: o clique pode cair antes da hidratação.
 */
async function abreEstudo(page: import('@playwright/test').Page) {
  const estudo = page.locator('#estudo');
  await expect(async () => {
    if ((await estudo.getAttribute('open')) === null) await estudo.locator('summary').click({ timeout: 3_000 });
    await expect(estudo).toHaveAttribute('open', '', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** A leitura da boia (v6), já com o «Estudar o spot» aberto. */
async function boiaV6(page: import('@playwright/test').Page) {
  await abreEstudo(page);
  const card = page.locator('#estudo').getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

/**
 * Scroll to the true bottom AFTER the layout settles. The spot page keeps
 * growing after the data fetch lands (measured: scrollHeight grows ~580px
 * after the observed-wave card appears — late images/sections below the
 * hero). Scrolling against a moving `document.body.scrollHeight` targets a
 * page that is still growing, so the hero may not be fully out of view when
 * the sticky bar's IntersectionObserver first fires. Wait for two
 * consecutive stable height samples (250ms apart), then scroll — the hero is
 * then genuinely out of view and the sticky bar activates on merit.
 */
async function scrollToSettledBottom(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const h = document.body.scrollHeight;
      // Sample twice: resolve only when the height is identical across the
      // two reads (layout stopped growing), not merely stable once.
      return new Promise<boolean>((resolve) => {
        const first = h;
        setTimeout(() => resolve(document.body.scrollHeight === first), 250);
      });
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

/**
 * Página de spot v6 (#184): a régua de 48 h substitui a barra unificada. No
 * telemóvel é fixa em baixo (visível em toda a página, por isso desce-se até
 * ao fim); no desktop é sticky no topo enquanto a página v6 está no ecrã, por
 * isso desce-se até logo depois do hero. Devolve a régua já presa.
 */
async function scrollToPinnedRegua(page: import('@playwright/test').Page) {
  const desktop = (page.viewportSize()?.width ?? 1280) >= 1024;
  if (desktop) {
    await page.evaluate(() => {
      const h = document.querySelector('#agora') as HTMLElement;
      window.scrollTo(0, h.getBoundingClientRect().bottom + window.scrollY + 80);
    });
  } else {
    await scrollToSettledBottom(page);
  }
  const regua = page.getByTestId('regua-48h');
  await expect(regua).toBeInViewport({ timeout: 15_000 });
  return regua;
}

async function gotoSpot(
  page: import('@playwright/test').Page,
  mode: ObservedScenario,
  locale: 'pt' | 'en' = 'pt',
) {
  await interceptConditions(page, guinchoTransform(mode));
  // Hermético: o wave-bias.json REAL passou a existir no build (pipeline
  // escreve-o) e cobre Cascais — sem este stub o fallback client-side
  // aplicava a correcção regional nos cenários «sem correcção» e o spec
  // ficava dependente do dia em que corre. Os testes que exercitam o
  // fallback stub o ficheiro com interceptWaveBias depois de chamar
  // interceptConditions directamente (não passam por aqui).
  await interceptWaveBias(page, { fetchedAt: null, regions: {} });

  await page.goto(`/${locale}/spots/${SPOT_SLUG}/`);
  await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Leitura da boia no conditions.json: página de spot v6 e comparador', () => {
  // O site regista um service worker (public/sw.js) que serve /data/* do cache
  // e BURLA o page.route — as injecções de conditions.json tornam-se
  // intermitentes quando o SW activa antes do fetch. Bloquear o SW garante
  // que a rota intercepta sempre (causa raiz da flakiness histórica deste spec).
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page }) => {
    await interceptForecastsForToday(page);
  });

  test('régua v6 desktop: selector e nota estáveis e uma só onda da hora (sem duplicados)', async ({ page }) => {
    // Página de spot v6 (#184): a barra unificada deu lugar à régua de 48 h
    // (sticky no topo no desktop) e ao selector Kite · Surf da barra de topo.
    // Com a retirada dos duplicados, «Agora» (#instrumentos), «Hora a hora»
    // (#previsao) e «Como sabemos» (#como-sabemos) saíram: a onda da hora
    // vive só no Porquê, mesmo com a leitura da boia no conditions.json.
    await gotoSpot(page, 'with-observed-wave');
    await page.evaluate(() => window.scrollTo(0, 1600));

    // Uma ÚNICA régua e um ÚNICO selector de modalidade — sem duplicação, e
    // nenhum tablist antigo.
    await expect(page.getByRole('slider')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Modalidade', exact: true })).toHaveCount(1);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    // A nota do veredicto continua /10 com a fonte observada carregada.
    const nota = page.locator('#agora [data-testid="spot-veredicto"] .nota');
    await expect(nota).toHaveCount(1);
    await expect(page.locator('#agora').getByText('/100')).toHaveCount(0);

    // Regra de ouro: um só cartão de onda (o do Porquê) e nenhuma das secções antigas.
    await expect(page.locator('[data-fator="onda"]')).toHaveCount(1);
    await expect(page.locator('[data-fator="onda"] .val')).toHaveText(/^\d+,\d/);
    for (const antigo of ['#instrumentos', '#previsao', '#como-sabemos']) {
      await expect(page.locator(antigo)).toHaveCount(0);
    }
    // A leitura da boia voltou (decisão do Pedro, 2026-10-15), UMA vez, dentro
    // do «Estudar o spot» — nunca ao lado do Porquê nem num painel à parte.
    const boia = page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i);
    await expect(boia).toHaveCount(1);
    await expect(page.locator('#estudo').getByLabel(/Onda observada \(boia\)/i)).toHaveCount(1);
  });

  test('régua v6 continua presa e operável após scroll (desktop); o selector troca a modalidade', async ({
    page,
  }) => {
    // O que importa ao utilizador: com a régua presa, a hora continua a
    // mudar (nada a cobre) e o selector Kite · Surf continua a trocar a
    // modalidade. O Playwright só completa o clique se o alvo for accionável.
    await gotoSpot(page, 'with-observed-wave');
    // Espera pela página viva (hidratada, com os dados do conditions.json
    // interceptado) antes de prender a régua.
    await expect(page.locator('[data-testid="spot-v6"].vivo')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-fator="onda"]')).toBeVisible();

    const regua = await scrollToPinnedRegua(page);
    const box = await regua.boundingBox();
    expect(Math.round(box!.y)).toBe(0); // sticky no topo
    const slider = regua.getByRole('slider');
    const antes = Number(await slider.getAttribute('aria-valuenow'));
    await regua.getByRole('button', { name: 'Hora seguinte' }).click();
    await expect(slider).toHaveAttribute('aria-valuenow', String(antes + 1));

    const grupo = page.getByRole('group', { name: 'Modalidade', exact: true });
    const botoes = grupo.getByRole('button');
    const n = await botoes.count();
    expect(n).toBe(2);
    let activeIdx = -1;
    let targetIdx = -1;
    for (let i = 0; i < n; i++) {
      const p = await botoes.nth(i).getAttribute('aria-pressed');
      if (p === 'true' && activeIdx === -1) activeIdx = i;
      else if (p !== 'true') targetIdx = i;
    }
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    const target = botoes.nth(targetIdx);
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect(botoes.nth(activeIdx)).toHaveAttribute('aria-pressed', 'false');
  });

  test('sticky desktop: sem correcção → NENHUM badge (nem «Corrigido» nem «Só previsão»)', async ({
    page,
  }) => {
    // O outro lado do par: sem leitura fresca nem viés, a régua v6 NÃO
    // mostra badges de fonte — só hora e notas. (A antiga tabela «Hora a
    // hora» saiu; a do «Estudar o spot» não tem sufixos de correcção.)
    await gotoSpot(page, 'without-observed-wave');

    const sticky = await scrollToPinnedRegua(page);

    // Nenhum badge (nem o de correcção nem o de previsão pura) na régua.
    await expect(sticky.getByText(/Corrigido|Só previsão/i)).toHaveCount(0);
    await expect(sticky.getByText(/\(boia\)|\(viés regional\)/i)).toHaveCount(0);
    await expect(page.locator('[data-wave-correction]')).toHaveCount(0);
  });

  test('sem leitura fresca (ausente) o hero e a sticky não mostram chip nem rótulo compacto', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSpot(page, 'without-observed-wave');

    const hero = page.locator('#agora');
    await expect(hero.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(hero.locator('[data-wave-clock="true"]')).toHaveCount(0);
    await expect(hero.getByText(/onda medida/)).toHaveCount(0);
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);

    const sticky = await scrollToPinnedRegua(page);
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
    const hero = page.locator('#agora');
    await expect(hero.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(hero.locator('[data-wave-clock="true"]')).toHaveCount(0);
    await expect(hero.getByText(/onda medida/)).toHaveCount(0);

    const sticky = await scrollToPinnedRegua(page);
    await expect(sticky.getByText(/boia .+ a \d+ km/)).toHaveCount(0);
    await expect(sticky.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('mostra o chip «Mar perigoso» na régua quando há aviso activo', async ({
    page,
  }) => {
    // Agitação Marítima activa para o guincho — chip de aviso na régua v6,
    // com o mesmo warningBadgeLabel das outras superfícies.
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

    // O cartão da boia saiu com o «Agora»: o chip vive na régua v6, que
    // acompanha a página (sticky no topo no desktop quando o hero sai).
    const sticky = await scrollToPinnedRegua(page);
    const compact = sticky.locator('[data-map-warning="compact"]');
    await expect(compact).toBeVisible({ timeout: 10_000 });
    await expect(compact).toContainText('Mar perigoso');
    await expect(compact).toHaveAttribute(
      'title',
      /Aviso IPMA: Mar perigoso \(Laranja\) · Lisboa/,
    );
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
    await expect(page.locator('[data-testid="spot-v6"].vivo')).toBeVisible({ timeout: 15_000 });

    // Régua v6 fixa em baixo: acompanha a página até ao fim.
    const sticky = await scrollToPinnedRegua(page);

    // Chip compacto na régua móvel — mesmo rótulo e tooltip do desktop.
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
    await expect(page.locator('[data-testid="spot-v6"].vivo')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-fator="onda"]')).toBeVisible();
    await expect(page.locator('[data-map-warning]')).toHaveCount(0);
  });

  test('comparador: sufixo do factor «(boia)» e «(viés regional)» na altura', async ({ page }) => {
    // O comparador (/pt/compare/) busca conditions.json client-side e mostra a
    // altura já corrigida (boia/viés) — o sufixo nomeia a origem da correcção
    // a partir da row crua. Interceptar para os dois spots: guincho com leitura
    // fresca (→ «(boia)»), carcavelos com meta waveBias (→ «(viés regional)»).
    //
    // Hermeticidade: o build actual BAKES observedWave em 155/185 rows e o
    // wmo-buoys.json vazio/leituras vivas anexaria leituras client-side. As
    // boias são bloqueadas (sem fonte viva) e a row do carcavelos é LIMPA de
    // observedWave — o único caminho para «(boia)» é o fixture do guincho.
    await interceptIhBuoys(page, {
      fetchedAt: new Date().toISOString(),
      apiKeyConfigured: false,
      hasWaveData: false,
      stations: {},
    });
    await interceptWmoBuoys(page, { buoys: {}, hasWaveData: false, day: '20260815' });
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
        carcavelos: (entry) => {
          // Caso de viés: SEM leitura de boia na row (o observedWave baked do
          // build daria «(boia)» — strip explícito para o cenário ser puro).
          const { observedWave: _omit, ...rest } = entry;
          return {
            ...rest,
            waveHeight: 1.8, // já corrigida pela pipeline (rawToScoreInput não aplica waveBias)
            waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
          };
        },
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

});

test.describe('Leitura da boia no «Estudar o spot» v6 (boia X a Y km)', () => {
  // O SW serve /data/* do cache e burla o page.route (ver helpers/conditions.ts).
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page }) => {
    await interceptForecastsForToday(page);
  });

  test('renderiza o rótulo honesto quando observedWave está no JSON', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');
    const card = await boiaV6(page);
    // Aparece no cabeçalho e no par IH vs WMO.
    await expect(card.getByText(/boia CSA92\/D a 60 km/i).first()).toBeVisible();
    // O valor MEDIDO, pelo seu rótulo (vírgula decimal da v6).
    await expect(card.getByText(/Altura \(medida\)|Height \(measured\)/i)).toBeVisible();
    const medida = card.getByText(/Altura \(medida\)/i).locator('xpath=following-sibling::p[1]');
    await expect(medida).toHaveText(/^1,8 m$/);
    // Regra de ouro: a previsão do modelo NÃO se repete aqui (vive no Porquê).
    await expect(card.getByText(/Previsão modelo/i)).toHaveCount(0);
    // Selo de frescura: leitura fresca → «agora», no tom activo (--gelo).
    const selo = card.locator('[data-boia-idade]');
    await expect(selo).toHaveCount(1);
    await expect(selo).toHaveAttribute('data-boia-idade', 'fresca');
    await expect(selo).toHaveText('agora');
    expect(await selo.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(127, 231, 255)');
    // O skill da previsão nesta boia numa frase de surfista (MAE 0,4 → 40 cm;
    // ME +0,2 = o mar vem 20 cm acima), sem siglas nem parênteses no texto.
    const skill = card.locator('[data-wave-skill="true"]');
    await expect(skill).toBeVisible();
    await expect(skill).toHaveText(
      'Comparada com esta boia, a previsão costuma falhar por uns 40 cm. O mar costuma vir 20 cm acima da previsão.',
    );
    expect(await skill.textContent()).not.toMatch(/ME|MAE|RMSE|n=|\(/);
    // Os números técnicos ficam no tooltip (todos) e na linha «detalhes» fechada (só o que a frase não diz).
    await expect(skill).toHaveAttribute('title', /^ME \+0,2 m · MAE 0,4 m · RMSE 0,5 m \(n=47\)/);
    const det = card.locator('[data-boia-det="true"]');
    await expect(det).toHaveCount(1);
    // Os «detalhes» não são um segundo <summary> dentro do <details id="estudo">.
    await expect(page.locator('#estudo summary')).toHaveCount(1);
    const botao = det.getByRole('button', { name: 'detalhes' });
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(det.getByText('erro típico (RMSE) 0,5 m')).toBeHidden();
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await expect(det.getByText('erro típico (RMSE) 0,5 m')).toBeVisible();
    await expect(det.getByText('47 comparações previsão × boia')).toBeVisible();
    // Cada número uma vez: o viés e o erro médio já estão na frase, não se repetem nos detalhes.
    await expect(det).not.toContainText(/viés|MAE/);
    // Período, direcção, água e maior onda em palavras (sem «Hmax» nem graus).
    await expect(card.getByText('de 11 em 11 s · de W · água 18,5 °C · maior onda 2,6 m')).toBeVisible();
    await expect(card.getByText(/Hmax|°(?!C)/)).toHaveCount(0);
    // IH primária sem calibração cross-border → nenhuma pill de calibração.
    await expect(card.locator('[data-wave-calibrated]')).toHaveCount(0);
    // Estilo v6: Barlow e o cartão no --mar da v6, nada do estilo antigo.
    expect(await card.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Barlow/);
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(12, 42, 66)');
    await expect(card.locator('.rounded-card, .card-1')).toHaveCount(0);
  });

  test('mostra IH vs WMO lado a lado com o vencedor e a razão', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');
    const card = await boiaV6(page);
    // As redes em palavras (sem as siglas IH/WMO no texto visível; ficam no tooltip).
    await expect(card.getByText(/✓\s*Rede portuguesa/)).toBeVisible();
    await expect(card.getByText('Rede europeia', { exact: true })).toBeVisible();
    // A reserva pelo nome; a distância vai uma só vez, junto da idade «(5h, a 56 km)».
    await expect(card.getByText('boia Cabo Silleiro', { exact: true })).toBeVisible();
    await expect(card.getByText(/Usamos o Instituto Hidrográfico, a fonte oficial\. A boia europeia está mais perto, mas fica de reserva\./)).toBeVisible();
    // Regra de ouro dentro do cartão: cada distância aparece uma vez.
    const texto = (await card.innerText()).replace(/\s+/g, ' ');
    expect(texto.match(/56 km/g)?.length).toBe(1);
    expect(texto.match(/60 km/g)?.length).toBe(1);
    // A WMO é MAIS VELHA aqui (5h vs IH 1h) — sem aviso de envelhecimento.
    await expect(card.locator('[data-ih-aging="true"]')).toHaveCount(0);
  });

  test('par IH vs WMO: idade, distância e a hora EXACTA da leitura no tooltip', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');
    const card = await boiaV6(page);
    const par = card.getByLabel(/Fontes de onda observada \(IH vs WMO\)|Observed wave sources \(IH vs WMO\)/i);
    await expect(par).toBeVisible();
    await expect(par).toContainText('Rede portuguesa');
    await expect(par).toContainText('✓');
    await expect(par).toContainText('(1h)');
    await expect(par).toContainText('Rede europeia');
    // Sem siglas no texto visível do par: IH/WMO só no title.
    expect((await par.innerText()).match(/\b(IH|WMO)\b/)).toBeNull();
    await expect(par).toContainText('(5h, a 56 km)');
    await expect(par.locator('[title*="leitura"]')).toHaveCount(2);
    await expect(par.locator('[title*="CSA92/D"]')).toHaveAttribute('title', /IH ✓ \(1h\) · CSA92\/D · leitura \d{2}:\d{2}$/);
    await expect(par.locator('[title*="Cabo Silleiro"]')).toHaveAttribute(
      'title',
      /WMO \(5h, a 56 km\) · Cabo Silleiro · leitura \d{2}:\d{2}$/,
    );
  });

  test('par IH vs WMO também no telemóvel (390px), sem overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSpot(page, 'with-observed-wave');
    const card = await boiaV6(page);
    const par = card.getByLabel(/Fontes de onda observada \(IH vs WMO\)/i);
    await expect(par).toBeVisible();
    await expect(par).toContainText('(1h)');
    await expect(par).toContainText('(5h, a 56 km)');
    await expect(par.locator('[title*="leitura"]')).toHaveCount(2);
    const cabe = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(cabe).toBe(true);
  });

  test('avisa suavemente quando a WMO está mais fresca que o IH (primária a envelhecer)', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave(),
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
    const card = await boiaV6(page);
    const aviso = card.locator('[data-ih-aging="true"]');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(/A leitura do Instituto Hidrográfico já tem umas horas/);
    await expect(card.getByText(/A boia europeia está mais perto e é mais recente, mas fica de reserva\./)).toBeVisible();
  });

  const CROSS_BORDER = (calibrada: boolean) => ({
    spots: {
      [SPOT_KEY]: (entry: Record<string, unknown>) => ({
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
          ...(calibrada
            ? {
                calibration: {
                  me: -0.9,
                  n: 4,
                  verdict: 'review',
                  from: 'Cabo Silleiro × Datawell ao largo de Faro',
                  rawHeight: 2.3,
                  deltaM: -0.9,
                },
              }
            : {}),
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

  test('mostra a calibração cross-border quando uma boia ES vence (WMO-only)', async ({ page }) => {
    await interceptConditions(page, CROSS_BORDER(true));
    await page.goto('/pt/spots/guincho/');
    const card = await boiaV6(page);
    // Nota de calibração em palavras: o que a boia mediu (2,3 m); o corrigido
    // (1,4 m) só no valor grande — cada número uma vez.
    const cal = card.locator('[data-wave-calibrated="true"]');
    await expect(cal).toBeVisible();
    await expect(cal).toHaveText('Boia espanhola acertada pelas portuguesas: mediu 2,3 m; a altura acima já vem corrigida.');
    await expect(card.getByText(/Altura \(medida\)/).locator('xpath=following-sibling::p[1]')).toHaveText(/^1,4 m$/);
    await expect(card.getByText(/1,4 m/)).toHaveCount(1);
    await expect(cal).toHaveAttribute('title', /Cabo Silleiro × Datawell ao largo de Faro · ME -0,9 m \(n=4\)/);
    // O chip compacto «ref. PT (ME · n)» saiu (repetia o viés): o ME e o n vão para os «detalhes».
    await expect(card.locator('[data-wave-calibrated="compact"]')).toHaveCount(0);
    const det = card.locator('[data-boia-det="true"]');
    await det.getByRole('button', { name: 'detalhes' }).click();
    await expect(det.getByText('acerto ES→PT: viés (ME) -0,9 m em 4 comparações (Cabo Silleiro × Datawell ao largo de Faro)')).toBeVisible();
  });

  test('leitura WMO SEM calibration → nunca mostra o tag de calibração (honestidade do rótulo)', async ({ page }) => {
    await interceptConditions(page, CROSS_BORDER(false));
    await page.goto('/pt/spots/guincho/');
    const card = await boiaV6(page);
    await expect(card.getByText(/boia Cabo Silleiro a 97 km/).first()).toBeVisible();
    // NENHUM tag de calibração, em superfície nenhuma da página.
    await expect(page.locator('[data-wave-calibrated]')).toHaveCount(0);
    await expect(page.locator('[data-wave-calibration-popover="true"]')).toHaveCount(0);
  });

  test('mostra o skill da boia ES (Silleiro) destacado mesmo sem IH_API_KEY', async ({ page }) => {
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
            skill: { me: -0.3, mae: 0.5, rmse: 0.6, corr: 0.88, n: 41, origin: 'wmo-es', buoyName: 'Cabo Silleiro' },
          },
          observedWaveAlt: null,
          observedWaveMeta: { winner: 'wmo', reason: 'wmo-only', ihAgeHours: null, wmoAgeHours: 1, ihDistanceKm: null, wmoDistanceKm: 96.8 },
        }),
      },
    });
    await page.goto('/pt/spots/guincho/');
    const card = await boiaV6(page);
    const es = card.locator('[data-wave-skill="es"]');
    await expect(es).toBeVisible();
    // Em palavras: de onde vem a medida, quanto falha a previsão (MAE 0,5 → 50 cm) e para que lado (ME -0,3).
    await expect(es).toHaveText(
      'Medido na boia espanhola de Cabo Silleiro. Comparada com esta boia, a previsão costuma falhar por uns 50 cm. O mar costuma vir 30 cm abaixo da previsão.',
    );
    await expect(es).toHaveAttribute('title', /^ME -0,3 m · MAE 0,5 m · RMSE 0,6 m · r 0,88 \(n=41\) — .*WMO\/Copernicus \(sem IH_API_KEY\)/);
    const det = card.locator('[data-boia-det="true"]');
    await det.getByRole('button', { name: 'detalhes' }).click();
    await expect(det).toContainText('erro típico (RMSE) 0,6 m');
    await expect(det).toContainText('correlação (r) 0,88');
    await expect(det).toContainText('41 comparações previsão × boia');
    await expect(card.locator('[data-wave-skill="true"]')).toHaveCount(0);
    // Cadeia de atribuição exacta da fonte (a mesma de /fontes): Copernicus.
    const fonte = card.locator('[data-data-source="copernicus"]');
    await expect(fonte).toBeVisible();
    await expect(fonte).toContainText(/Fonte da medição:/);
    await expect(fonte).toContainText(/Generated using E\.U\. Copernicus Marine Service Information/);
    await expect(fonte.locator('a[href*="marine.copernicus.eu"]')).toBeVisible();
  });

  test('auditoria: nota de atribuição corresponde à fonte exibida (IH ↔ Copernicus, sem a contraparte)', async ({ page }) => {
    await gotoSpot(page, 'single-source-ih');
    const ih = await boiaV6(page);
    const ihFonte = ih.locator('[data-data-source="ih-buoys"]');
    await expect(ihFonte).toBeVisible();
    await expect(ihFonte).toContainText(/Instituto Hidrográfico/);
    await expect(ihFonte).not.toContainText(/Copernicus/i);
    await expect(ih.locator('[data-data-source="copernicus"]')).toHaveCount(0);

    await gotoSpot(page, 'single-source-wmo-es');
    const wmo = await boiaV6(page);
    const wmoFonte = wmo.locator('[data-data-source="copernicus"]');
    await expect(wmoFonte).toBeVisible();
    await expect(wmoFonte).toContainText(/Generated using E\.U\. Copernicus Marine Service Information/);
    await expect(wmoFonte).not.toContainText(/Instituto Hidrográfico/);
    await expect(wmo.locator('[data-data-source="ih-buoys"]')).toHaveCount(0);
  });

  test('fonte única IH: rótulo «boia X a Y km · HH:MM», sem o par IH vs WMO', async ({ page }) => {
    await gotoSpot(page, 'single-source-ih');
    const card = await boiaV6(page);
    await expect(card.getByText(/boia CSA92\/D a 60 km · \d{2}:\d{2}/)).toBeVisible();
    await expect(card.getByText(/Altura \(medida\)/)).toBeVisible();
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('fonte única IH no telemóvel (390px): o mesmo rótulo honesto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSpot(page, 'single-source-ih');
    const card = await boiaV6(page);
    await expect(card.getByText(/boia CSA92\/D a 60 km · \d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('fonte única WMO-ES fresca (Cabo Silleiro, gate 6h) → a leitura aparece', async ({ page }) => {
    // Leitura WMO de 5.5h: dentro do gate WMO (6h), fora do IH (3h). Mostrar
    // «boia Cabo Silleiro a 57 km» prova o gate de 6 h por fonte.
    await gotoSpot(page, 'single-source-wmo-es');
    const card = await boiaV6(page);
    await expect(card.getByText(/boia Cabo Silleiro a 57 km · \d{2}:\d{2}/)).toBeVisible();
    await expect(card.getByText(/Altura \(medida\)/)).toBeVisible();
    await expect(page.getByLabel(/Fontes de onda observada \(IH vs WMO\)/i)).toHaveCount(0);
  });

  test('linha discreta «skill desta boia» aparece sem leitura fresca (forecast-skill.json)', async ({ page }) => {
    await interceptConditions(page, { spots: { [SPOT_KEY]: withoutObservedWave } });
    await page.route('**/data/forecast-skill.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetchedAt: 'Sat 2026-08-15 4:52 AM WEST (UTC+01:00)',
          pairCount: 47,
          pairCountByOrigin: { ih: 12, 'wmo-es': 10 },
          calibratedPairCount: 10,
          byBuoy: { 19: { buoyName: 'CSA92/D', n: 47, me: 0.2, mae: 0.4, rmse: 0.5, corr: 0.91, meanLeadHours: 12, withinHalfM: 0.92 } },
        }),
      });
    });
    await page.route('**/data/ih-buoys.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetchedAt: 'Sat 2026-08-15 4:00 AM WEST (UTC+01:00)',
          stations: {},
          spotMapping: { guincho: { idEst: 19, distanceKm: 60 } },
        }),
      });
    });
    await page.goto('/pt/spots/guincho/');
    await abreEstudo(page);
    const linha = page.locator('#estudo [data-buoy-skill-line="true"]');
    await expect(linha).toBeVisible({ timeout: 20_000 });
    // Uma frase de surfista (a do pedido), sem siglas nem parênteses aninhados.
    await expect(linha).toHaveText(
      'A previsão costuma bater certo nesta boia: em 92% das vezes ficou a menos de meio metro do que ela mediu. O mar costuma vir 20 cm acima da previsão.',
    );
    await expect(linha).toHaveAttribute('title', /^ME \+0,2 m · RMSE 0,5 m · r 0,91 \(n=47\)/);
    // Sem leitura nenhuma no JSON: nem «agora» nem idade.
    await expect(page.locator('#estudo [data-boia-idade]')).toHaveCount(0);
    // Os números técnicos numa linha «detalhes» fechada, em letra pequena.
    const det = page.locator('#estudo [data-buoy-skill-det="true"]');
    await expect(det.getByRole('button', { name: 'detalhes' })).toHaveAttribute('aria-expanded', 'false');
    const origens = det.locator('[data-buoy-skill-origins="true"]');
    await expect(origens).toBeHidden();
    await det.getByRole('button', { name: 'detalhes' }).click();
    await expect(det.locator('[data-buoy-skill-stats="true"]')).toHaveText(
      'boia CSA92/D · erro típico (RMSE) 0,5 m · correlação (r) 0,91 · 47 comparações previsão × boia',
    );
    await expect(origens).toBeVisible();
    await expect(origens).toContainText('Instituto Hidrográfico 12 · Copernicus (boia espanhola) 10');
    // as redes em palavras: sem siglas soltas no texto visível
    expect(await origens.innerText()).not.toMatch(/\b(IH|WMO)\b|Copernicus-(PT|ES)/);
    expect(parseFloat(await origens.evaluate((el) => getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);
    // Sem leitura fresca: sem o cartão da leitura.
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
  });

  test('sem forecast-skill.json a linha discreta não aparece (degrada em silêncio)', async ({ page }) => {
    await interceptConditions(page, { spots: { [SPOT_KEY]: withoutObservedWave } });
    await page.route('**/data/forecast-skill.json', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fetchedAt: null, pairCount: 0, byBuoy: {} }) });
    });
    await page.route('**/data/ih-buoys.json', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spotMapping: { guincho: { idEst: 19 } } }) });
    });
    await page.goto('/pt/spots/guincho/');
    await abreEstudo(page);
    await page.waitForTimeout(3_000);
    await expect(page.locator('[data-buoy-skill-line="true"]')).toHaveCount(0);
  });

  test('nunca aparece sem observedWave no JSON', async ({ page }) => {
    await gotoSpot(page, 'without-observed-wave');
    await abreEstudo(page);
    await page.waitForTimeout(4_000);
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
    await expect(page.getByText(/boia CSA92\/D a 60 km/i)).toHaveCount(0);
    await expect(page.getByText(/boia .+ a \d+ km/i)).toHaveCount(0);
    await expect(page.getByText(/Corrigido pela boia/i)).toHaveCount(0);
  });

  test('leitura velha (>3h): nota honesta, sem a apresentar como fresca', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({ observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString() }),
        }),
      },
    });
    await page.goto('/pt/spots/guincho/');
    await abreEstudo(page);
    const boia = page.locator('#estudo [data-boia="sem-leitura"]');
    await expect(boia).toContainText(/Leitura antiga demais para contar/, { timeout: 15_000 });
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
    await expect(page.getByText(/Altura \(medida\)/)).toHaveCount(0);
    // Sem «agora»: a idade honesta no tom névoa, não no activo.
    const selo = boia.locator('[data-boia-idade]');
    await expect(selo).toHaveAttribute('data-boia-idade', 'antiga');
    await expect(selo).toHaveText('há 5 h');
    await expect(boia.getByText(/^agora$/i)).toHaveCount(0);
    expect(await selo.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(169, 194, 212)');
    await expect(selo).toHaveAttribute('title', /^Última leitura desta boia: \d{2}:\d{2} \(há 5 h\)$/);
  });

  test('leitura de ontem: «leitura de ontem 18h» (ou o dia), nunca «agora»', async ({ page }) => {
    await interceptConditions(page, {
      spots: {
        [SPOT_KEY]: (entry) => ({
          ...entry,
          observedWave: freshObservedWave({ observedAt: new Date(Date.now() - 26 * 3_600_000).toISOString() }),
        }),
      },
    });
    await page.goto('/pt/spots/guincho/');
    await abreEstudo(page);
    const selo = page.locator('#estudo [data-boia="sem-leitura"] [data-boia-idade="antiga"]');
    await expect(selo).toHaveText(/^leitura de (ontem|dom|seg|ter|qua|qui|sex|sáb) \d{1,2}h(\d{2})?$/, { timeout: 15_000 });
    await expect(page.locator('#estudo [data-boia-idade="fresca"]')).toHaveCount(0);
  });

  test('avisa quando a leitura ES foi descartada por incoerência do par ES×PT', async ({ page }) => {
    await gotoSpot(page, 'coherence-refused');
    await abreEstudo(page);
    const aviso = page.locator('#estudo [data-coherence-refused="true"]');
    await expect(aviso).toHaveCount(1);
    await expect(aviso).toBeVisible({ timeout: 15_000 });
    await expect(aviso).toContainText('Hoje pusemos de lado a boia espanhola');
    await expect(aviso).not.toContainText(/incoherent|ES×PT/);
    await expect(aviso).toHaveAttribute('title', /descartada hoje.*ES×PT/);
    await expect(page.getByLabel(/Onda observada \(boia\)|Observed wave \(buoy\)/i)).toHaveCount(0);
  });

  test('avisa confiança baixa quando o par ES×PT persiste incoherent por vários dias', async ({ page }) => {
    await gotoSpot(page, 'coherence-warning');
    const card = await boiaV6(page);
    const aviso = card.locator('[data-coherence-warning="true"]');
    await expect(aviso).toHaveCount(1);
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('há 4 dias que a boia espanhola e a portuguesa não batem certo');
    await expect(aviso).not.toContainText('incoherent');
    await expect(aviso).toHaveAttribute('title', /incoherent há 4 dias/);
    await expect(page.locator('[data-coherence-refused="true"]')).toHaveCount(0);
  });

  test('ponte keyless: nota e rótulo honesto (Cabo Silleiro a 281 km)', async ({ page }) => {
    await gotoSpot(page, 'bridge');
    const card = await boiaV6(page);
    const nota = card.locator('[data-wave-bridge="true"]');
    await expect(nota).toBeVisible();
    await expect(nota).toContainText('A boia portuguesa desta zona ainda não está ligada');
    await expect(nota).toContainText('Cabo Silleiro (ES)');
    await expect(nota).not.toContainText(/keyless|IH_API_KEY|Fugro/);
    await expect(nota).toHaveAttribute('title', /Ponte keyless/);
    await expect(card.getByText(/boia Cabo Silleiro a 281 km/i).first()).toBeVisible();
  });

  test('«O que se mede» em linguagem simples: sem siglas de engenharia no texto visível (detalhes fechados)', async ({ page }) => {
    await gotoSpot(page, 'with-observed-wave');
    await boiaV6(page);
    const sec = page.getByTestId('spot-mede-sabe');
    await expect(sec.locator('[data-ec="boia"]')).toBeVisible();
    // innerText não inclui o conteúdo de um <details> fechado nem os tooltips.
    const visivel = await sec.innerText();
    for (const jargao of [/\bAQI\b/, /Isóbatas IH/, /CC-BY/, /\bME [+-]/, /RMSE/, /\bMAE\b/, /\bn=\d/, /IH_API_KEY/, /keyless/i, /Hmax/, /incoherent/, /Skill/, /radar HF/, /MERRA/, /\(\S[^)]*\(/]) {
      expect(visivel, `jargão visível: ${jargao}`).not.toMatch(jargao);
    }
    // Qualidade do ar em palavras (sem «agora»: o índice é previsão do build) e o UV com o nível da OMS.
    const ar = sec.locator('[data-aqi]');
    if (await ar.count()) {
      await expect(ar.locator('.ec-rot')).toHaveText(/^Qualidade do ar$/i);
      await expect(ar).toContainText(/índice europeu \d+/);
    }
    const uv = sec.locator('[data-uv-nivel]');
    if (await uv.count()) await expect(uv).toHaveText(/^(baixo|moderado|alto|muito alto|extremo)$/);
  });

  test('EN: «Observed wave (buoy)» com o rótulo e o separador decimal ingleses', async ({ page }) => {
    await gotoSpot(page, 'single-source-ih', 'en');
    await abreEstudo(page);
    const card = page.locator('#estudo').getByLabel(/Observed wave \(buoy\)/i);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/Height \(measured\)/i).locator('xpath=following-sibling::p[1]')).toHaveText(/^1\.8 m$/);
  });
});

/**
 * iPhone 12 Pro (390 × 844, DPR 3): a página do spot abria descentrada. A régua de 48 h é
 * `position: fixed` (escapa ao `overflow-x: clip` da `.v6`) e o seu cabeçalho não encolhia:
 * com a fonte de recurso (antes de a Barlow Condensed chegar) «Agora · qui 15, 18h» / «Now · Thu
 * 15, 18:00» empurrava a seta da direita 22–34 px para fora do ecrã, e o iOS Safari alargava a
 * página. O Chromium não conta elementos fixos no scrollWidth, por isso além do scrollWidth
 * mede-se cada elemento visível da página contra a largura do ecrã. As fontes ficam bloqueadas
 * (o pior caso, o da primeira visita). Na cena 3D, o rótulo do spot fica no centro do enquadramento.
 */
test.describe('spot v6 a 390 (iPhone): abre centrada', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  for (const loc of ['pt', 'en'] as const) {
    for (const leitura of ['fresca', 'antiga'] as const) {
      test(`${loc}, leitura ${leitura}: sem nada fora do ecrã na horizontal (fonte de recurso)`, async ({ page }) => {
        await page.route(/\.(woff2?|ttf|otf)(\?|$)/, (r) => r.abort());
        await interceptConditions(page, {
          spots: {
            [SPOT_KEY]: (entry) => ({
              ...entry,
              observedWave: freshObservedWave(
                leitura === 'antiga' ? { observedAt: new Date(Date.now() - 20 * 3_600_000).toISOString() } : {},
              ),
            }),
          },
        });
        await page.goto(`/${loc}/spots/${SPOT_SLUG}/`);
        await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
        await expect(page.getByTestId('regua-48h')).toBeVisible();
        const medir = () =>
          page.evaluate(() => {
            const de = document.documentElement;
            const W = de.clientWidth;
            const fora: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>('[data-testid="spot-v6"] *')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.right <= W + 0.5 && r.left >= -0.5) continue;
              // cortado por um antepassado (overflow-x ≠ visible) — mas um elemento fixo escapa
              // aos antepassados acima dele (o caso da régua dentro da .v6)
              let cortado = false;
              for (let a: HTMLElement | null = el; a && a !== document.body; a = a.parentElement) {
                if (a !== el && getComputedStyle(a).overflowX !== 'visible') { cortado = true; break; }
                if (getComputedStyle(a).position === 'fixed') break;
              }
              if (!cortado) fora.push(`${el.tagName.toLowerCase()}.${el.className} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
            }
            const seta = [...document.querySelectorAll('[data-testid="regua-48h"] .r-cab button')].pop()!.getBoundingClientRect();
            return { sw: de.scrollWidth, cw: W, sx: window.scrollX, fora, setaDir: seta.right };
          });
        const m = await medir();
        expect(m.cw).toBe(390);
        expect(m.sw).toBe(m.cw);
        expect(m.sx).toBe(0);
        expect(m.fora).toEqual([]);
        expect(m.setaDir).toBeLessThanOrEqual(m.cw);
        // com o «Estudar o spot» aberto (a leitura da boia e o par IH × WMO)
        await abreEstudo(page);
        const m2 = await medir();
        expect(m2.sw).toBe(m2.cw);
        expect(m2.fora).toEqual([]);
      });
    }
  }

  test('cena 3D: o rótulo do spot fica no centro do enquadramento', async ({ page }) => {
    await interceptConditions(page, { spots: { [SPOT_KEY]: (entry) => ({ ...entry, observedWave: freshObservedWave() }) } });
    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
    const fig = page.locator('[data-testid="praia-3d"] figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).not.toHaveAttribute('data-modo', 'poster', { timeout: 20_000 });
    test.skip((await fig.getAttribute('data-modo')) !== '3d', 'sem WebGL2 neste browser: vista plana (centro editorial)');
    const rot = fig.locator('.lbl-abs.grande');
    await expect(rot).toBeVisible({ timeout: 30_000 });
    const r = await page.evaluate(() => {
      const f = document.querySelector('[data-testid="praia-3d"] figure') as HTMLElement;
      const l = f.querySelector('.lbl-abs.grande') as HTMLElement;
      // posição projectada do spot (o rótulo sobe 22 px acima dela)
      return { x: parseFloat(l.style.left), y: parseFloat(l.style.top) + 22, W: f.clientWidth, H: f.clientHeight };
    });
    expect(Math.abs(r.x - r.W / 2)).toBeLessThanOrEqual(4);
    expect(Math.abs(r.y - r.H / 2)).toBeLessThanOrEqual(4);
  });
});
