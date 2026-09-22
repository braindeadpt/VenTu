import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Clusters mostram o MELHOR score da zona — não a contagem.
 *
 * Prova contra o estado real do Leaflet (handle __VENTU_MAP__ via
 * ventu.mapdebug=1): para cada cluster visível, o número grande é o máximo
 * dos spotScore dos filhos e o badge é a contagem. A etiqueta acessível
 * (span sr-only — o markercluster dá role=button ao ícone) inclui ambos.
 */

interface ClusterProbe {
  total: number;
  max: number | null;
  score: string | null;
  count: string | null;
  label: string;
}

async function openMapa(page: Page): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.mapdebug', '1');
  });
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
}

async function probeClusters(page: Page): Promise<ClusterProbe[]> {
  return page.evaluate(() => {
    const map = (window as unknown as { __VENTU_MAP__?: { _layers: Record<string, unknown> } })
      .__VENTU_MAP__;
    if (!map) return [];
    const out: ClusterProbe[] = [];
    for (const l of Object.values(map._layers) as {
      getAllChildMarkers?: () => { spotScore?: number }[];
      _icon?: HTMLElement;
    }[]) {
      if (typeof l.getAllChildMarkers !== 'function' || !l._icon) continue;
      const kids = l.getAllChildMarkers();
      const scores = kids.map((k) => k.spotScore).filter((s) => typeof s === 'number') as number[];
      out.push({
        total: kids.length,
        max: scores.length ? Math.max(...scores) : null,
        score: l._icon.querySelector('[data-cluster-score]')?.textContent ?? null,
        count: l._icon.querySelector('[data-cluster-count]')?.textContent ?? null,
        label: l._icon.querySelector('span')?.textContent ?? '',
      });
    }
    return out;
  });
}

function expectClusterMatchesChildren(clusters: ClusterProbe[], scoreWord: RegExp) {
  expect(clusters.length).toBeGreaterThan(0);
  let scored = 0;
  for (const c of clusters) {
    if (c.max === null) continue; // zona sem scores → fallback de contagem
    scored++;
    // número principal = máximo dos filhos; badge = nº de filhos
    expect(Number(c.score), `cluster de ${c.total} spots`).toBe(c.max);
    expect(Number(c.count), `cluster de ${c.total} spots`).toBe(c.total);
    // etiqueta acessível: «Melhor score 80 · 12 spots nesta zona — ampliar»
    expect(c.label).toMatch(scoreWord);
    expect(c.label).toContain(String(c.max));
    expect(c.label).toContain(String(c.total));
  }
  // há-de haver pelo menos um cluster com scores na vista de país
  expect(scored).toBeGreaterThan(0);
}

test.describe('Clusters do mapa — melhor score da zona', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('desktop (variante arcos): número visível = máximo dos filhos; etiqueta inclui score e contagem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page);
    await expect(page.locator('.ventu-cluster-icon').first()).toBeVisible({ timeout: 20_000 });
    expectClusterMatchesChildren(await probeClusters(page), /Melhor score|Best score/);
  });

  test('mobile (variante simples): número visível = máximo dos filhos; etiqueta inclui score e contagem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMapa(page);
    await expect(page.locator('.ventu-cluster-icon').first()).toBeVisible({ timeout: 20_000 });
    expectClusterMatchesChildren(await probeClusters(page), /Melhor score|Best score/);
  });
});
