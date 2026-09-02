import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

/**
 * Página «Fontes de dados» (/fontes) — lista todas as fontes do projecto com
 * licença e atribuição obrigatória (Open-Meteo, IPMA, IH, MeteoAlarm, Esri,
 * Copernicus, OSM/CARTO, …), com ligação a partir do footer.
 */

/** URL absoluta base usada no sitemap.xml (SITE_URL em src/lib/site.ts). */
const SITE_URL = 'https://ventu.surf';

/** Os 5 locais servidos (pt/en/es/de/fr) — o mesmo conjunto de src/lib/i18n. */
const HREFLANG_LOCALES = ['pt', 'en', 'es', 'de', 'fr'] as const;
test.describe('Fontes de dados (data sources)', () => {
  test('lista todas as fontes obrigatórias com atribuição', async ({ page }) => {
    await page.goto('/pt/fontes/');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Fontes de dados' }),
    ).toBeVisible({ timeout: 20_000 });

    const table = page.getByTestId('data-sources-table');
    await expect(table).toBeVisible();

    // Fontes obrigatórias presentes.
    for (const source of [
      'Open-Meteo',
      'Instituto Hidrográfico (IH) — marés, isóbatas e avisos',
      'Instituto Hidrográfico (IH) — boias ondógrafo',
      'IPMA',
      'MeteoAlarm (EUMETNET)',
      'Copernicus Marine Service',
      'Esri World Imagery',
    ]) {
      await expect(table.getByText(source, { exact: true }).first()).toBeVisible();
    }

    // Cadeias de atribuição obrigatórias (as mesmas que o About / mapa usam).
    await expect(table.getByText('Weather data by Open-Meteo.com', { exact: false })).toBeVisible();
    await expect(
      table.getByText(/Generated using E\.U\. Copernicus Marine Service Information/),
    ).toBeVisible();
    await expect(table.getByText(/Imagery © Esri/)).toBeVisible();

    // Licença CC BY 4.0 ligada ao creativecommons.
    await expect(table.locator('a[href="https://creativecommons.org/licenses/by/4.0/"]').first()).toBeVisible();

    // Boias ondógrafo: CC BY-NC (processo IH 0191_2026), ligada ao creativecommons.
    await expect(
      table.locator('a[href="https://creativecommons.org/licenses/by-nc/4.0/"]').first(),
    ).toBeVisible();

    // Histórico auditable dos avisos costeiros (arquivo IH) ao lado da entrada.
    const coastal = page.locator('[data-coastal-archive-fontes]');
    await expect(coastal).toBeVisible();
    await expect(
      coastal.getByRole('heading', { name: /Histórico — Avisos à Navegação Costeiros/ }),
    ).toBeVisible();
    await expect(coastal.locator('[data-coastal-ref]').first()).toBeVisible();
  });

  test('footer liga à página de fontes (pt)', async ({ page }) => {
    await page.goto('/pt/');
    const footerLink = page.getByRole('link', { name: 'Fontes oficiais' });
    await expect(footerLink).toBeVisible({ timeout: 20_000 });
    await footerLink.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fontes de dados' })).toBeVisible();
  });

  test('versão EN com as mesmas fontes', async ({ page }) => {
    await page.goto('/en/fontes/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Data sources' }),
    ).toBeVisible({ timeout: 20_000 });
    const table = page.getByTestId('data-sources-table');
    await expect(table.getByText('Open-Meteo', { exact: true })).toBeVisible();
    await expect(table.getByText(/Weather data by Open-Meteo\.com/)).toBeVisible();
  });

  test('citação oficial da Open-Meteo (DOI 10.5281/zenodo.7970649) com paridade pt/en em fontes e About', async ({
    page,
  }) => {
    // A citação oficial (Zippenfenig, 2023 — Zenodo) tem de viver nas DUAS
    // línguas servidas, nas DUAS superfícies: a célula da tabela de /fontes
    // (ATTRIBUTIONS.open-meteo.cellPt/cellEn) e a página About (secção de
    // atribuição). Iterar os 4 pares garante que um locale nunca perde a
    // citação por um editor/rebase (o About EN usa «Official citation», o
    // About PT «Citação oficial»).
    const doiHref = 'https://doi.org/10.5281/zenodo.7970649';
    const cases = [
      {
        locale: 'pt',
        path: 'fontes',
        heading: 'Fontes de dados',
        // A citação está na célula da tabela — o texto de abertura é o mesmo
        // nas duas línguas (Zippenfenig, P. (2023)…).
        citationText: /Zippenfenig, P\. \(2023\)\. Open-Meteo\.com Weather API/,
      },
      {
        locale: 'en',
        path: 'fontes',
        heading: 'Data sources',
        citationText: /Zippenfenig, P\. \(2023\)\. Open-Meteo\.com Weather API/,
      },
      {
        locale: 'pt',
        path: 'about',
        heading: 'Sobre o VenTu',
        citationText: /Zippenfenig, P\. \(2023\)\. Open-Meteo\.com Weather API/,
      },
      {
        locale: 'en',
        path: 'about',
        heading: 'About VenTu',
        citationText: /Zippenfenig, P\. \(2023\)\. Open-Meteo\.com Weather API/,
      },
    ];

    for (const c of cases) {
      await page.goto(`/${c.locale}/${c.path}/`);
      await expect(page.getByRole('heading', { level: 1, name: c.heading })).toBeVisible({
        timeout: 20_000,
      });

      // O link DOI da citação existe e aponta para o Zenodo.
      await expect(page.locator(`a[href="${doiHref}"]`).first()).toBeVisible();
      // O texto da citação (autor + título da API) está presente.
      await expect(page.getByText(c.citationText).first()).toBeVisible();
      // O DOI em si (10.5281/zenodo.7970649) aparece no corpo.
      await expect(page.getByText(/10\.5281\/zenodo\.7970649/).first()).toBeVisible();
    }
  });

  test('CITATION.cff: o DOI da preferred-citation bate com o das páginas About/fontes', async ({
    page,
  }) => {
    // Lê o ficheiro CITATION.cff (raiz do repo — a mesma citação que o GitHub
    // mostra no botão «Cite this repository»). O DOI da preferred-citation tem
    // de ser EXACTAMENTE o mesmo que as páginas About/fontes mostram — se um
    // dos três mudar (editor, rebase), a citação oficial diverge e o teste falha.
    const cff = readFileSync('CITATION.cff', 'utf-8');

    // Extrai o bloco preferred-citation e o doi lá dentro (formato YAML
    // simples: `doi: "10.5281/zenodo.7970649"`). O bloco é o último do ficheiro,
    // por isso basta partir no key e ler até ao fim — um lookahead com `$` (m)
    // casaria no fim da própria linha `preferred-citation:` e apanhar vazio.
    const preferredBlock = cff.split(/\npreferred-citation:/)[1];
    expect(
      preferredBlock,
      'CITATION.cff deve ter um bloco preferred-citation',
    ).toBeTruthy();
    const doiMatch = preferredBlock.match(/doi:\s*["']?([^"'\s]+)["']?/);
    expect(doiMatch, 'preferred-citation deve declarar um doi').not.toBeNull();
    const cffDoi = doiMatch![1];
    expect(cffDoi).toBe('10.5281/zenodo.7970649');

    const doiHref = `https://doi.org/${cffDoi}`;

    // O mesmo DOI (e o mesmo link https://doi.org/...) nas duas superfícies e
    // nas duas línguas — paridade exacta com o CITATION.cff.
    for (const c of [
      { locale: 'pt', path: 'about', heading: 'Sobre o VenTu' },
      { locale: 'en', path: 'about', heading: 'About VenTu' },
      { locale: 'pt', path: 'fontes', heading: 'Fontes de dados' },
      { locale: 'en', path: 'fontes', heading: 'Data sources' },
    ]) {
      await page.goto(`/${c.locale}/${c.path}/`);
      await expect(page.getByRole('heading', { level: 1, name: c.heading })).toBeVisible({
        timeout: 20_000,
      });
      // Link com o DOI do CFF e o texto do DOI no corpo.
      await expect(page.locator(`a[href="${doiHref}"]`).first()).toBeVisible();
      await expect(page.getByText(new RegExp(cffDoi.replace('.', '\.'))).first()).toBeVisible();
    }
  });

  test('About: cartão de estado da IH_API_KEY com o passo de obtenção', async ({ page }) => {
    await page.goto('/pt/about/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sobre o VenTu' }),
    ).toBeVisible({ timeout: 20_000 });

    // O cartão existe com um estado válido (o build real hoje: não configurada).
    const card = page.locator('[data-ih-key-status]');
    await expect(card).toBeVisible();
    const status = await card.getAttribute('data-ih-key-status');
    expect(['not-configured', 'active', 'rejected', 'down']).toContain(status);
    await expect(card.locator('[data-ih-key-status-badge]')).toBeVisible();

    // Sub-estado keyless: quando a WMO Nazaré fresca cobrir a costa central, o
    // cartão mostra-o em vez de deixar pensar que a camada observada está toda
    // desligada. O About é SSG — depende da frescura do wmo-buoys.json baked no
    // build; quando renderiza, tem de ser a variante nazare-fresh (sem outro valor).
    const wmoSub = card.locator('[data-ih-key-status-wmo]');
    if ((await wmoSub.count()) > 0) {
      await expect(wmoSub).toHaveAttribute('data-ih-key-status-wmo', 'nazare-fresh');
      await expect(wmoSub).toContainText(/Nazaré Costeira/i);
    }

    // Streak down/stale («há quantas horas degradada», do pipeline-meta): com
    // estado no-key NUNCA existe a linha — o produtor não acumula streak em
    // no-key (é o setup keyless, não uma degradação). Com build down/stale e
    // streak > 0 a linha tem de aparecer com a duração (runs [+ ~h]). O About
    // é SSG — a asserção é honesta ao estado baked do build actual.
    const downtime = card.locator('[data-ih-key-status-downtime]');
    if (status === 'not-configured') {
      await expect(downtime).toHaveCount(0);
    } else if ((await downtime.count()) > 0) {
      await expect(downtime).toContainText(/runs?/i);
    }

    // O passo de obtenção — quem clonar o projecto sabe o que falta.
    await expect(
      card.getByRole('link', { name: 'cedencia.dados@hidrografico.pt' }),
    ).toBeVisible();
    await expect(card.getByText(/Settings → Secrets and variables → Actions/)).toBeVisible();
    await expect(card.getByRole('link', { name: 'docs/IH_API_KEY.md' })).toBeVisible();
  });

  test('About: linha de degradação «há ~X h» quando o pipeline-meta tem streak down/stale', async ({
    page,
  }) => {
    // O About é SSG — o estado vem do pipeline-meta.json baked no build. Lê o
    // ficheiro servido para decidir honestamente o que o build deve mostrar:
    // só testa o lado positivo quando o build está efectivamente degradado.
    await page.goto('/pt/about/');
    const res = await page.request.get(
      new URL('/data/pipeline-meta.json', page.url()).toString(),
    );
    let layer: { status?: string; streak?: number } | null = null;
    if (res.ok()) {
      const meta = (await res.json()) as { buoyLayer?: { status?: string; streak?: number } };
      layer = meta?.buoyLayer ?? null;
    }
    const degraded =
      layer &&
      (layer.status === 'down' || layer.status === 'stale') &&
      Number(layer.streak) > 0;
    test.skip(
      !degraded,
      'build sem streak down/stale no pipeline-meta.json — injectar buoyLayer {status:down, streak:3, lastOkAt:…} e rebuild para validar o lado positivo',
    );

    const card = page.locator('[data-ih-key-status]');
    await expect(card).toBeVisible();
    const dt = card.locator('[data-ih-key-status-downtime]');
    await expect(dt).toBeVisible();
    await expect(dt).toContainText(/runs?/i);
    // A linha é honesta: horas OU runs da degradação (nunca vazia).
    await expect(dt).toContainText(/(~\d+ h|\d+ runs?)/i);
  });

  test('About: arquivo dos avisos à navegação costeiros (IH) mostra quando estiveram em vigor', async ({
    page,
  }) => {
    await page.goto('/pt/about/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sobre o VenTu' }),
    ).toBeVisible({ timeout: 20_000 });

    const section = page.locator('[data-coastal-archive]');
    await expect(section).toBeVisible();
    await expect(
      section.getByRole('heading', { name: /Arquivo — Avisos à Navegação Costeiros/ }),
    ).toBeVisible();
    // Pelo menos uma referência ANAV com colunas de janela (desde/até).
    const firstRow = section.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByText(/ANAV NR/)).toBeVisible();

    // Mini-gráfico diário de avisos em vigor, lendo os days do arquivo.
    const chart = section.locator('[data-daily-active-chart]');
    await expect(chart).toBeVisible();
    await expect(chart.locator('[data-day]').first()).toBeVisible();
    // Rótulo do chart em PT e o contador de dias do arquivo.
    await expect(chart.getByText(/Avisos em vigor por dia/)).toBeVisible();

    await expect(section.getByText(/Actualizado .* Instituto Hidrográfico/)).toBeVisible();
  });

  test('as cadeias obrigatórias aparecem textualmente nas superfícies sempre visíveis (footer, mapa)', async ({
    page,
  }) => {
    // Homepage — a data do footer (Open-Meteo/IPMA/Ecowitt/METAR) e o TrustStrip.
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 20_000 });
    await expect(footer.getByText(/Open-Meteo Marine \(DWD EWAM · ECMWF WAM · NOAA\)/)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'IPMA' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Ecowitt' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'METAR' })).toBeVisible();
    // A cadeia Open-Meteo (modelos marinhos) surge no próprio footer da homepage.
    await expect(footer.getByText(/Open-Meteo Marine/)).toBeVisible();

    // /mapa — o controlo de atribuição do Leaflet inclui a cadeia Open-Meteo (CC BY 4.0)
    // e o basemap Esri (quando em modo satélite).
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      'Weather data by Open-Meteo.com',
      { timeout: 15_000 },
    );
    await expect(page.locator('.leaflet-control-attribution')).toContainText('CC BY 4.0');
  });

  test('controlo de atribuição mostra Carto/OSM no mapa e Esri no satélite', async ({
    page,
  }) => {
    // Com NEXT_PUBLIC_CARTO_API_KEY no build: modo mapa = Carto dark/light.
    // Satélite continua Esri imagery.
    await page.goto('/pt/mapa/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    const attribution = page.locator('.leaflet-control-attribution');
    await expect(attribution).toContainText('Weather data by Open-Meteo.com', {
      timeout: 15_000,
    });
    await expect(attribution).toContainText('OpenStreetMap');
    await expect(attribution).toContainText('CARTO');
    await expect(attribution).not.toContainText(/Esri/);
    await page.getByRole('radio', { name: 'Satélite' }).click();
    await expect(attribution).toContainText(/Esri/, { timeout: 15_000 });
    await expect(attribution).toContainText('OpenStreetMap');
    await expect(attribution).not.toContainText('CARTO');
  });

  test('sitemap.xml inclui /pt/fontes/ com os 5 hreflang (pt/en/es/de/fr)', async ({
    page,
  }) => {
    // Lê o ficheiro estático (public/sitemap.xml — o mesmo que o CI gera e o
    // deploy publica; o servidor e2e serve o copy em out/sitemap.xml). O
    // bloco do /pt/fontes tem de existir com o <loc> e os 5 alternates.
    const sitemap = readFileSync('public/sitemap.xml', 'utf-8');
    const fontesEntry = sitemap.match(
      /<url>\s*<loc>https:\/\/ventu\.surf\/pt\/fontes\/<\/loc>[\s\S]*?<\/url>/,
    );
    expect(
      fontesEntry,
      'o sitemap.xml deve conter um <url> com <loc>https://ventu.surf/pt/fontes/</loc>',
    ).not.toBeNull();

    // Cada um dos 5 hreflang aponta para a variante localizada da página.
    for (const loc of HREFLANG_LOCALES) {
      expect(
        fontesEntry![0],
        `o bloco do /pt/fontes deve ter hreflang="${loc}"`,
      ).toContain(`hreflang="${loc}" href="${SITE_URL}/${loc}/fontes/"`);
    }

    // E2E sobre o servidor: o /sitemap.xml servido também o tem (não só o
    // ficheiro em disco) — o crawler que chegar ao site encontra a página.
    const served = await page.request.get('/sitemap.xml');
    expect(served.status()).toBe(200);
    const servedBody = await served.text();
    expect(servedBody).toContain(`<loc>${SITE_URL}/pt/fontes/</loc>`);
    expect(servedBody).toContain(`hreflang="pt" href="${SITE_URL}/pt/fontes/"`);
    expect(servedBody).toContain(`hreflang="fr" href="${SITE_URL}/fr/fontes/"`);
  });

  test('cabeça do /pt/fontes emite os 5 hreflang (pt/en/es/de/fr) com canonical', async ({
    page,
  }) => {
    await page.goto('/pt/fontes/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fontes de dados' }),
    ).toBeVisible({ timeout: 20_000 });

    // Alternates localizados no <head> (o Next emite o atributo como hrefLang).
    const alternates = page.locator('link[rel="alternate"]');
    await expect(alternates).toHaveCount(HREFLANG_LOCALES.length);
    for (const loc of HREFLANG_LOCALES) {
      const link = page.locator(
        `link[rel="alternate"][href="${SITE_URL}/${loc}/fontes/"]`,
      );
      await expect(link).toHaveAttribute('hreflang', loc);
    }

    // O canonical aponta para a própria página (pt).
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', `${SITE_URL}/pt/fontes/`);
  });

  test('hero embebido em /pt com pref satellite persistida mostra Esri (não só Carto)', async ({
    page,
  }) => {
    // Préferência de basemap satellite persistida (ventu.map.basemap) antes do
    // load — o efeito de restauro do SpotMapInteractive vira o hero para
    // satélite e o controlo de atribuição deve mostrar o crédito Esri/OSM,
    // nunca apenas o Carto do 'map'.
    await page.addInitScript(() => {
      localStorage.setItem('ventu.map.basemap', 'satellite');
    });
    await page.goto('/pt/', { waitUntil: 'networkidle', timeout: 60_000 });
    const attribution = page.locator(
      '[data-map-hero-teaser="true"] .leaflet-control-attribution',
    );
    // Open-Meteo (obrigatório em todas) + o crédito Esri do satélite.
    await expect(attribution).toContainText('Weather data by Open-Meteo.com', {
      timeout: 20_000,
    });
    await expect(attribution).toContainText(/Esri/, { timeout: 15_000 });
    // Não fica preso ao Carto do 'map' quando o basemap restaurado é satellite.
    await expect(attribution).not.toContainText('CARTO');
  });
});
