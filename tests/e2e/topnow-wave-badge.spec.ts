import { test, expect } from '@playwright/test';
import { readRealConditions } from './helpers/conditions';

/**
 * Badge do score de onda no TopNow da homepage (SpotListCard).
 *
 * Contrato validado: o SpotListCard mostra o ScoreWaveSourceBadge na row de
 * métricas APENAS quando há correcção (observed ou bias-corrected) — com
 * previsão pura o badge não existe e a altura aparece sem sufixo.
 *
 * Particularidade do TopNow: é SSG puro (`loadSpotData()` em build-time; os
 * cards nunca re-buscam client-side), por isso o badge só pode estar no HTML
 * baked quando a correcção existia no build:
 *   - meta waveBias na row de conditions.json (pipeline com
 *     VENTU_WAVE_BIAS_CORRECTION=1), OU
 *   - wave-bias.json presente em public/data/ durante o build (fallback do
 *     buildSpotData — o mesmo gate da página de spot).
 * O build real (CI) não tem nenhum dos dois → o teste positivo salta com
 * mensagem clara; localmente, `node tests/e2e/fixtures/write-wave-bias-fixture.mjs
 * && npm run build` valida o caminho positivo ponta a ponta.
 *
 * O SW é bloqueado (padrão da suite): o TopNow não faz fetch client-side,
 * mas os outros componentes da homepage (avisos IPMA, radar) usam page.route.
 */
test.describe('TopNow — badge do score de onda', () => {
  test.use({ serviceWorkers: 'block' });

  /** Secção «A bombar agora» (section[aria-labelledby="top-now-heading"] → region). */
  const topNow = (page: import('@playwright/test').Page) =>
    page.getByRole('region', { name: 'A bombar agora' });

  test('sem correcção no build → NENHUM card mostra badge de onda', async ({ page }) => {
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });

    // Skip espelhado do positivo: este lado só é válido no build SEM correcção
    // (o CI — sem wave-bias.json). Com o fixture baked, o badge existe por
    // design e quem valida é o teste positivo.
    if ((await section.getByText(/Corrigido/i).count()) > 0) {
      test.skip(true, 'build COM correcção (fixture wave-bias.json) — valida o lado positivo');
      return;
    }

    // Nenhum badge «Corrigido» (nem boia nem viés regional) na secção —
    // «apenas quando há correcção»: o build real não tem correcção nenhuma.
    await expect(section.getByText(/Corrigido/i)).toHaveCount(0);
    // A altura aparece sem sufixo de correcção (1.4m, não 1.4m (viés regional)).
    await expect(section.getByText(/\(boia\)|\(viés regional\)/i)).toHaveCount(0);
    // As rows de métricas continuam a mostrar altura/período/vento normalmente
    // (o build real tem cards — «Só spots a bombar · por desporto»).
    await expect(section.getByText(/\d\.\dm/).first()).toBeVisible();
  });

  test('com waveBias baked no build → badge «Corrigido (viés regional)» com ME/n no card', async ({
    page,
  }) => {
    // Skip honesto: o TopNow é SSG — o badge só existe se o build tiver a
    // correcção. O build real (CI) não tem wave-bias.json → salta; o recipe do
    // fixture (header do ficheiro) valida o caminho positivo localmente.
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });

    const badges = section.getByText('Corrigido (viés regional)');
    if ((await badges.count()) === 0) {
      test.skip(true, 'build sem correcção (wave-bias.json ausente no build) — TopNow é SSG');
      return;
    }

    // Pelo menos um card mostra o badge na row de métricas, com o tooltip
    // ME/n do viés (Δ aplicado + origem — fallback em runtime no SSG).
    const badge = badges.first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', /Viés regional ME [-+]\d\.\d m \(n=\d+\)/);
    // O sufixo do factor acompanha o badge na mesma row (altura corrigida).
    await expect(section.getByText(/\(viés regional\)/).first()).toBeVisible();
  });

  test('com observedWave baked no build → relógio data-wave-clock nos cards do TopNow', async ({
    page,
  }) => {
    // O mesmo padrão data-wave-clock do hero, nos cards de destaque: quando a
    // row traz uma leitura de boia fresca, a hora da leitura (HH:MM) aparece
    // junto à altura. O TopNow é SSG — sem observedWave no build, o relógio
    // não pode existir e o teste salta (validação local: injectar observedWave
    // em public/data/conditions.json + `npm run build`, como o fixture do viés).
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const section = topNow(page);
    await expect(section).toBeVisible({ timeout: 20_000 });

    const clocks = section.locator('[data-wave-clock="true"]');
    if ((await clocks.count()) === 0) {
      test.skip(true, 'build sem observedWave (TopNow é SSG) — sem leitura fresca na row');
      return;
    }

    // O relógio é HH:MM (Europe/Lisbon, mesmo formato do hero).
    const clock = clocks.first();
    await expect(clock).toBeVisible();
    await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
    // Acompanha a altura corrigida pela boia (sufixo «(boia)» no mesmo card).
    await expect(section.getByText(/\(boia\)/).first()).toBeVisible();
  });

  test('leitura velha (>3h) no conditions.json → NENHUM badge nem waveCorrection no TopNow', async ({
    page,
  }) => {
    // Espelho do teste de frescura da página de spot, no TopNow: com uma
    // leitura VELHA (5h, fora do gate IH de 3h), `resolveScoreWaveCorrection`
    // devolve null em runtime e o card não mostra badge, sufixo nem relógio.
    // Gate honesto: o TopNow é SSG — só faz sentido se o build tiver um
    // observedWave antigo baked. O CI (sem observedWave) salta; local: injectar
    // observedWave com >3h em conditions.json + `npm run build` (inverso da
    // variante fresca).
    const rows = readRealConditions();
    if (!Object.values(rows).some((e) => e?.observedWave)) {
      test.skip(true, 'build sem observedWave — não dá para distinguir o caso velho (TopNow SSG)');
      return;
    }

    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
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
