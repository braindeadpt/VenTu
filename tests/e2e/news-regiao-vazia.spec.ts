import { test, expect } from '@playwright/test';
import { interceptData } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';

/**
 * Região por omissão do /pt/news/ quando o feed não tem notícias `pt`.
 *
 * Em 2026-11-15 o feed ficou a 50 itens todos `sourceRegion: 'intl'` e o
 * /pt/news/ abria no estado vazio para toda a gente em pt — o filtro de região
 * por omissão era `pt` e não havia um único item para ele. A omissão passa a
 * ser calculada com os itens do feed: `pt` só quando existe pelo menos um item
 * `pt`, senão «Tudo».
 */
const SEM_ITENS_PT = [
  {
    id: 'news-regiao-1',
    title: 'Swell de noroeste a caminho da Europa',
    titleEn: 'Northwest swell heading for Europe',
    summary: 'Resumo de teste, sem cobertura nacional.',
    summaryEn: 'Test summary, no national coverage.',
    category: 'surf',
    source: 'Stab Mag',
    sourceType: 'rss',
    sourceRegion: 'intl',
    url: 'https://example.com/news/regiao-1',
    publishedAt: '2026-11-14T10:00:00.000Z',
    tags: [],
  },
  {
    id: 'news-regiao-2',
    title: 'Kite mundial decide-se este fim de semana',
    titleEn: 'Kite world title decided this weekend',
    summary: 'Resumo de teste, sem cobertura nacional.',
    summaryEn: 'Test summary, no national coverage.',
    category: 'kitesurf',
    source: 'IKSURF Mag',
    sourceType: 'rss',
    sourceRegion: 'intl',
    url: 'https://example.com/news/regiao-2',
    publishedAt: '2026-11-13T09:00:00.000Z',
    tags: [],
  },
];

test.describe('News — região por omissão sem itens pt', { tag: '@core' }, () => {
  // O SW serve /data/* do cache e burla o page.route (ver helpers/conditions.ts).
  test.use({ serviceWorkers: 'block' });

  test('/pt/news/ sem parâmetros mostra a lista, não o estado vazio', async ({ page }) => {
    await interceptData(page, 'news.json', SEM_ITENS_PT);
    await page.goto('/pt/news/');
    await waitHydrated(page);

    await expect(page.locator('[data-hydration-gate="news"] article').first()).toBeVisible();
    await expect(page.getByText('Nenhuma notícia com este filtro.')).toHaveCount(0);
    // A omissão é «Tudo»: a pílula activa é essa, não a Cena PT. (Âmbito no
    // grupo da origem — o filtro de data também tem uma pílula «Tudo».)
    const origem = page.getByRole('group', { name: 'Filtrar por origem' });
    await expect(origem.getByRole('button', { name: 'Tudo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(origem.getByRole('button', { name: /Cena PT/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('?region=pt explícito sem itens pt mantém o estado vazio', async ({ page }) => {
    await interceptData(page, 'news.json', SEM_ITENS_PT);
    await page.goto('/pt/news/?region=pt');
    await waitHydrated(page);

    await expect(page.getByText('Nenhuma notícia com este filtro.')).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Filtrar por origem' }).getByRole('button', { name: /Cena PT/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
