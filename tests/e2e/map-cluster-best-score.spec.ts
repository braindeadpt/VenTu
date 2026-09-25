import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';
import { waitMapSettled } from './helpers/map-sheet';

/**
 * Agrupamentos mostram o MELHOR score da zona — não a contagem.
 *
 * UX v3 (M4): no /mapa o markercluster foi substituído pelo LOD por colisão
 * (recluster() da maquete aprovada) — os spots que colidem ficam pontos e o
 * melhor do grupo fica marcador completo com badge «+N». A invariante é a
 * mesma: o número visível no representante é o MÁXIMO dos membros e o badge
 * é a contagem escondida.
 *
 * Os clusters clássicos `.ventu-cluster-icon` continuam nos embeds (hero da
 * homepage) — o último teste mantém a prova original nessa superfície.
 */

interface GroupProbe {
  id: string;
  score: number;
  members: number[];
  badge: string;
  label: string;
}

async function openMapa(page: Page): Promise<void> {
  await preseedWindRingLegend(page);
  await page.goto('/pt/mapa/?sport=all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-v3spot]').length > 0,
    { timeout: 30_000, polling: 250 },
  );
  await waitMapSettled(page);
  // A inserção é chunked (8 por batch + yield em mobile) — «>0» apanha a
  // primeira fatia e um probe cedo lia membros do grupo ainda sem
  // marcador (NaN). Espera a contagem estabilizar em duas leituras.
  await expect
    .poll(
      async () => {
        const n = await page.locator('[data-v3spot]').count();
        await page.waitForTimeout(300);
        const m = await page.locator('[data-v3spot]').count();
        return n === m ? n : -1;
      },
      { timeout: 30_000, intervals: [350] },
    )
    .toBeGreaterThan(0);
}

/** Grupos «+N»: representante + score de cada membro (pontos incluídos). */
async function probeGroups(page: Page): Promise<GroupProbe[]> {
  return page.evaluate(() => {
    const scoreOf = (id: string) =>
      Number(
        document.querySelector<HTMLElement>(`[data-v3spot="${CSS.escape(id)}"]`)?.dataset
          .spotScore,
      );
    return Array.from(document.querySelectorAll<HTMLElement>('.v3more')).map((el) => {
      const host = el.closest<HTMLElement>('[data-v3spot]');
      const ids = (el.dataset.v3members ?? '').split(',').filter(Boolean);
      return {
        id: host?.dataset.v3spot ?? '',
        score: Number(host?.dataset.spotScore),
        members: ids.map(scoreOf),
        badge: el.textContent ?? '',
        label: el.getAttribute('aria-label') ?? '',
      };
    });
  });
}

function expectGroupMatchesMembers(groups: GroupProbe[]) {
  expect(groups.length).toBeGreaterThan(0);
  for (const g of groups) {
    // número do marcador = máximo dos membros; badge = nº de pontos
    expect(Math.max(...g.members), `grupo de ${g.id}`).toBe(g.score);
    expect(g.badge.trim()).toBe(`+${g.members.length - 1}`);
    // etiqueta acessível: «Mais N spots perto — ampliar»
    expect(g.label).toMatch(/Mais \d+ spots|\d+ more spots/);
    expect(g.label).toContain(String(g.members.length - 1));
  }
}

test.describe('Grupos «+N» do mapa v3 — melhor score da zona', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('desktop: o representante tem o máximo dos membros e o badge a contagem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapa(page);
    await expect(page.locator('.v3more').first()).toBeVisible({ timeout: 20_000 });
    expectGroupMatchesMembers(await probeGroups(page));
  });

  test('mobile: o representante tem o máximo dos membros e o badge a contagem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMapa(page);
    await expect(page.locator('.v3more').first()).toBeVisible({ timeout: 20_000 });
    expectGroupMatchesMembers(await probeGroups(page));
  });
});

interface ClusterProbe {
  total: number;
  max: number | null;
  score: string | null;
  count: string | null;
  label: string;
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

test.describe('Clusters clássicos — embeds fora do modo Explorar (hero)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('hero da homepage: número visível = máximo dos filhos; etiqueta com score e contagem', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedWindRingLegend(page);
    await page.addInitScript(() => {
      localStorage.setItem('ventu.mapdebug', '1');
    });
    await page.goto('/pt/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitHydrated(page);
    await expect(page.locator('.ventu-cluster-icon').first()).toBeVisible({ timeout: 30_000 });
    const clusters = await probeClusters(page);
    expect(clusters.length).toBeGreaterThan(0);
    let scored = 0;
    for (const c of clusters) {
      if (c.max === null) continue;
      scored++;
      expect(Number(c.score), `cluster de ${c.total} spots`).toBe(c.max);
      expect(Number(c.count), `cluster de ${c.total} spots`).toBe(c.total);
      expect(c.label).toMatch(/Melhor score|Best score/);
      expect(c.label).toContain(String(c.max));
      expect(c.label).toContain(String(c.total));
    }
    expect(scored).toBeGreaterThan(0);
  });
});
