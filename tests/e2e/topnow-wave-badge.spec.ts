import { test, expect } from '@playwright/test';
import {
  interceptConditions,
  freshObservedWave,
  readRealConditions,
} from './helpers/conditions';

/**
 * Badge do score de onda no TopNow da homepage (SpotListCard).
 *
 * Contrato validado: o SpotListCard mostra o ScoreWaveSourceBadge na row de
 * métricas APENAS quando há correcção (observed ou bias-corrected) — com
 * previsão pura o badge não existe e a altura aparece sem sufixo, e uma
 * leitura velha (>3h) nunca é apresentada como fresca.
 *
 * Desde que o HomepageTopNow re-hidrata client-side (`useLiveGridSpotData` —
 * mount + 15 min + tab visível, com o mesmo `refreshGridSpotScores` do
 * grid/mapa), o badge aparece SEM rebuild: os cards substituem as rows SSG
 * pelas de conditions.json servidas pelo page.route. Por isso TODOS os casos
 * positivos interceptam client-side (transform `all` — o top spot de cada
 * desporto carrega a correcção seja qual for), e os negativos servem o ficheiro
 * real/hermético. O SW é bloqueado (padrão da suite).
 */
test.describe('TopNow — badge do score de onda', () => {
  test.use({ serviceWorkers: 'block' });

  /** Secção «A bombar agora» (section[aria-labelledby="top-now-heading"] → region). */
  const topNow = (page: import('@playwright/test').Page) =>
    page.getByRole('region', { name: 'A bombar agora' });

  /**
   * Build está baked com wave-bias.json (recipe write-wave-bias-fixture.mjs)?
   * Lê o ficheiro SERVIDO pelo out/: quando tem regiões utilizáveis, os negativos
   * de «sem correcção» não são válidos (o SSG bakes o viés e o refresh preserva
   * o meta da row) — o contrato passa para o teste Baked.
   */
  async function isBakedWaveBias(page: import('@playwright/test').Page): Promise<boolean> {
    const res = await page.request.get(
      new URL('/data/wave-bias.json', page.url()).toString(),
    );
    if (!res.ok()) return false;
    const file = (await res.json()) as { regions?: Record<string, unknown> };
    return !!file?.regions && Object.keys(file.regions).length > 0;
  }

  /** Transform `all`: aplica `fn` a TODAS as rows (top spot de cada desporto). */
  const allSpots =
    (fn: (entry: Record<string, unknown>) => Record<string, unknown>) =>
    (out: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> => {
      for (const key of Object.keys(out)) {
        out[key] = fn(out[key]);
      }
      return out;
    };

  test('sem correcção → NENHUM badge (dados reais, pós-refresh client-side)', async ({ page }) => {
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    // Gate honesto: num build baked (fixture), o SSG bakes o viés e o refresh
    // preserva o meta da row (`?? row.conditions.waveBias`) — o negativo só é
    // válido no build SEM wave-bias.json (CI); quem valida o baked é o teste
    // «Baked no build». O refresh serve o real (sem transform).
    if (await isBakedWaveBias(page)) {
      test.skip(true, 'build COM wave-bias.json baked (fixture) — o negativo não é válido; o contrato «baked» é validado pelo teste Baked');
      return;
    }
    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });

    // Nenhum badge «Corrigido» (nem boia nem viés regional) na secção.
    await expect(section.getByText(/Corrigido/i)).toHaveCount(0);
    // A altura aparece sem sufixo de correcção (1.4m, não 1.4m (viés regional)).
    await expect(section.getByText(/\(boia\)|\(viés regional\)/i)).toHaveCount(0);
    // As rows de métricas continuam a mostrar altura/período/vento normalmente.
    await expect(section.getByText(/\d\.\dm/).first()).toBeVisible();
  });

  test('com waveBias nas rows (intercept client-side) → badge «Corrigido (viés regional)» com ME/n', async ({
    page,
  }) => {
    // Mesma row corrigida pela pipeline que o spec do spot usa: meta waveBias
    // baked (Cascais me +0.3 n=120) e SEM leitura de boia — o viés vence. O
    // refresh client-side traz o meta → o badge aparece sem rebuild.
    await interceptConditions(page, {
      all: allSpots((entry) => {
        const { observedWave, ...rest } = entry;
        return {
          ...rest,
          waveHeight: 1.8, // já corrigida pela pipeline
          waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
        };
      }),
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);

    // Pelo menos um card mostra o badge na row de métricas (top spot do
    // desporto — todas as rows transformadas), com o tooltip Δ + ME/n.
    const badge = section.getByText('Corrigido (viés regional)').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toHaveAttribute(
      'title',
      /Δ \+0\.3 m aplicado à altura\. Viés regional ME \+0\.3 m \(n=120\)\. Correcção aplicada pela pipeline \(meta na row\)\./,
    );
    // O sufixo do factor acompanha o badge na mesma row (altura corrigida).
    await expect(section.getByText(/\(viés regional\)/).first()).toBeVisible();
    // Nunca linguagem de boia — a correcção é de viés, não de leitura.
    await expect(section.getByText(/Corrigido pela boia/i)).toHaveCount(0);
  });

  test('deltaM negativo no TopNow: waveBias me -0.4 → «Δ -0.4 m» e altura corrigida para baixo', async ({
    page,
  }) => {
    // Espelho do positivo com o sinal ao contrário: viés regional NEGATIVO — o
    // tooltip do badge no card mostra «Δ -0.4 m aplicado à altura» (fmtMe
    // mantém o sinal) e a altura exibida é a row corrigida PARA BAIXO
    // (1.8 - 0.4 = 1.4m), nunca a crua acima.
    await interceptConditions(page, {
      all: allSpots((entry) => {
        const { observedWave, ...rest } = entry;
        return {
          ...rest,
          waveHeight: 1.4, // já corrigida pela pipeline (1.8 - 0.4)
          waveBias: { region: 'Cascais', me: -0.4, n: 120, deltaM: -0.4 },
        };
      }),
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);

    const badge = section.getByText('Corrigido (viés regional)').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    // Δ com o sinal honesto — nunca «+» nem sem sinal para um viés negativo.
    await expect(badge).toHaveAttribute(
      'title',
      /Δ -0\.4 m aplicado à altura\. Viés regional ME -0\.4 m \(n=120\)\. Correcção aplicada pela pipeline \(meta na row\)\./,
    );
    // A altura do card é a corrigida para baixo, com o sufixo do factor.
    await expect(section.getByText('1.4m (viés regional)').first()).toBeVisible();
    // Nunca a altura crua acima (1.8m) com o sufixo de viés.
    await expect(section.getByText('1.8m (viés regional)')).toHaveCount(0);
  });

  test('Baked no build (wave-bias.json no out/) → primeiro paint mostra «Corrigido (viés regional)» com ME/n', async ({
    page,
  }) => {
    // Caminho SSG: com o wave-bias.json PRESENTE em public/data/ durante o
    // build (o que o write-wave-bias-fixture.mjs produz), `buildSpotData` bakes
    // o viés nas rows e o badge sai logo do HTML do primeiro paint — o spec
    // valida-o sem intercept (o refresh client-side poderia até estar desligado).
    // Gate honesto: lê o ficheiro SERVED pelo build; sem as regiões, skip com a
    // recipe — nunca falha no CI, mas corre localmente após a recipe.
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const res = await page.request.get(
      new URL('/data/wave-bias.json', page.url()).toString(),
    );
    let baked = false;
    if (res.ok()) {
      const file = (await res.json()) as { regions?: Record<string, unknown> };
      baked = !!file?.regions && Object.keys(file.regions).length > 0;
    }
    test.skip(
      !baked,
      'build sem wave-bias.json baked — recipe: node tests/e2e/fixtures/write-wave-bias-fixture.mjs && npm run build && npx playwright test topnow-wave-badge',
    );

    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });
    const badge = section.getByText('Corrigido (viés regional)').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    // Tooltip com o ME/n do viés (a origem exacta — pipeline/fallback baked —
    // varia com o fixture; o contrato é ter o viés regional nomeado).
    await expect(badge).toHaveAttribute('title', /Viés regional ME [-+]\d\.\d m \(n=\d+\)/);
    // O sufixo do factor acompanha o badge na mesma row (SSG, primeiro paint).
    await expect(section.getByText(/\(viés regional\)/).first()).toBeVisible();
    // Nunca linguagem de boia — o build não tem leituras baked.
    await expect(section.getByText(/Corrigido pela boia/i)).toHaveCount(0);
  });

  test('com observedWave fresco (intercept client-side) → badge «Corrected/Corrigido pela boia» + relógio', async ({
    page,
  }) => {
    // Leitura IH fresca em TODAS as rows → o top spot de cada desporto mostra
    // o badge de correcção em tempo real + o relógio data-wave-clock (HH:MM,
    // mesmo formato do hero) + o sufixo «(boia)».
    await interceptConditions(page, {
      all: allSpots((entry) => {
        const { waveBias, ...rest } = entry;
        return { ...rest, observedWave: freshObservedWave(), observedWaveAlt: null };
      }),
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);

    const badge = section.getByText('Corrigido pela boia CSA92/D').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    // ME/n do skill no tooltip (mesma fonte do spot).
    await expect(badge).toHaveAttribute('title', /ME \+0\.2 m \(n=47\)/);

    const clock = section.locator('[data-wave-clock="true"]').first();
    await expect(clock).toBeVisible();
    await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
    // A altura corrigida pela boia (sufixo «(boia)» na mesma row).
    await expect(section.getByText(/\(boia\)/).first()).toBeVisible();
  });

  test('boia fresca E viés regional no mesmo row (intercept) → ganha «Corrigido pela boia X», nunca o viés', async ({
    page,
  }) => {
    // A precedência honesta do resolver (resolveScoreWaveCorrection): leitura
    // fresca > viés regional. Mesmo com o meta waveBias baked na row (fallback
    // regional), a boia vence — o badge mostra «Corrigido pela boia CSA92/D» e
    // o «(viés regional)» nunca aparece na secção. O refresh client-side traz
    // ambos os campos → a precedência prova-se sem rebuild.
    await interceptConditions(page, {
      all: allSpots((entry) => {
        const { waveBias, ...rest } = entry;
        return {
          ...rest,
          waveHeight: 1.8,
          waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
          observedWave: freshObservedWave(),
          observedWaveAlt: null,
        };
      }),
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);

    // A boia fresca vence o viés: badge por nome com o ME/n do skill.
    const badge = section.getByText('Corrigido pela boia CSA92/D').first();
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await expect(badge).toHaveAttribute('title', /ME \+0\.2 m \(n=47\)/);
    // O viés NUNCA aparece quando há leitura fresca (nenhum badge nem sufixo).
    await expect(section.getByText('Corrigido (viés regional)')).toHaveCount(0);
    await expect(section.getByText(/\(viés regional\)/)).toHaveCount(0);
    // A altura mostra a medição (sufixo «(boia)» na mesma row).
    await expect(section.getByText(/\(boia\)/).first()).toBeVisible();
  });

  test('leitura de boia BAKED no build → primeiro paint mostra «Corrigido pela boia X», não o viés', async ({
    page,
  }) => {
    // Primeira pintura (SSG): quando o build tem uma leitura fresca baked
    // (observedWave + meta waveBias no mesmo row de um top spot), o badge sai
    // logo do HTML com a boia a vencer o viés — sem depender do refresh. O
    // build real (CI) não tem leituras baked → salta com receita (injectar
    // observedWave fresca + waveBias num top spot + `npm run build`).
    const rows = readRealConditions();
    const withFresh = Object.entries(rows).some(([, e]) => {
      const ow = e?.observedWave;
      if (!ow || typeof ow !== 'object') return false;
      const rec = ow as { observedAt?: string; source?: string };
      if (typeof rec.observedAt !== 'string') return false;
      const ageH = (new Date().getTime() - new Date(rec.observedAt).getTime()) / 3_600_000;
      if (!Number.isFinite(ageH) || ageH < 0) return false;
      // Mesma frescura do resolver: gate IH 3h / WMO 6h.
      return ageH <= (rec.source === 'wmo-buoy' ? 6 : 3);
    });
    if (!withFresh) {
      test.skip(true, 'build sem observedWave fresco baked — injectar observedWave (fresca) + waveBias meta num TOP spot de conditions.json + npm run build');
      return;
    }

    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });

    // Primeiro paint: badge por boia (uma leitura fresca baked existe), nunca
    // o badge nem o sufixo do viés na secção.
    await expect(section.getByText(/Corrigido pela boia/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(section.getByText(/Corrigido \(viés regional\)/)).toHaveCount(0);
    await expect(section.getByText(/\(viés regional\)/)).toHaveCount(0);
  });

  test('com observedWave recalibrado (intercept client-side) → tag compacto de calibração cross-border', async ({
    page,
  }) => {
    // Leitura espanhola fresca recalibrada à referência PT (gate WMO 6h, 5.5h)
    // — o tag «ref. PT (ME · n)» aparece na row de métricas do card, sem o
    // contexto do hero. O refresh traz a leitura → tag sem rebuild.
    await interceptConditions(page, {
      all: allSpots((entry) => {
        const { waveBias, ...rest } = entry;
        return {
          ...rest,
          observedWave: freshObservedWave({
            stationName: 'Cabo Silleiro',
            stationArea: 'Galiza',
            distanceKm: 57,
            source: 'wmo-buoy',
            stationCode: '6200084',
            observedAt: new Date(Date.now() - 5.5 * 3_600_000).toISOString(),
            skill: undefined,
            calibration: {
              me: -0.9,
              n: 4,
              verdict: 'review',
              from: 'Cabo Silleiro × Datawell ao largo de Faro',
              rawHeight: 2.3,
              deltaM: -0.9,
            },
          }),
          observedWaveAlt: null,
        };
      }),
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);

    const tag = section.locator('[data-wave-calibrated="compact"]').first();
    await expect(tag).toBeVisible({ timeout: 20_000 });
    await expect(tag).toContainText(/ref\. PT \(-0\.9 m · n=4\)/);
    await expect(tag).toHaveAttribute('title', /recalibrada para a referência PT/);
    // O sufixo da origem acompanha o tag na mesma row (altura corrigida pela boia).
    await expect(section.getByText(/\(boia\)/).first()).toBeVisible();
  });

  test('leitura velha (>3h, intercept) → NENHUM badge nem relógio nem waveCorrection', async ({
    page,
  }) => {
    // Espelho do teste de frescura da página de spot, no TopNow: com uma
    // leitura VELHA (5h, fora do gate IH de 3h), resolveScoreWaveCorrection
    // devolve null em runtime e o card não mostra badge, sufixo nem relógio —
    // mesmo com o observedWave presente no JSON servido.
    await interceptConditions(page, {
      all: allSpots((entry) => {
        const { waveBias, ...rest } = entry;
        return {
          ...rest,
          observedWave: freshObservedWave({
            observedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
          }),
          observedWaveAlt: null,
        };
      }),
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    // Gate honesto: num build baked o refresh preserva o viés da row mesmo com
    // a leitura velha (a frescura da boia não apaga um viés baked) — o teste
    // só é válido sem wave-bias.json (CI).
    if (await isBakedWaveBias(page)) {
      test.skip(true, 'build COM wave-bias.json baked (fixture) — a leitura velha não apaga o viés baked; validar a frescura no build sem fixture');
      return;
    }
    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });

    // Leitura velha → sem correcção: nenhum badge, sufixo «(boia)» ou relógio.
    await expect(section.getByText(/Corrigido/i)).toHaveCount(0);
    await expect(section.getByText(/\(boia\)|\(viés regional\)/i)).toHaveCount(0);
    await expect(section.locator('[data-wave-clock="true"]')).toHaveCount(0);
    // A altura continua a aparecer como previsão pura (a row mantém-se).
    await expect(section.getByText(/\d\.\dm/).first()).toBeVisible();
  });
});