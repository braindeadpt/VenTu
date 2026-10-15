import { test, expect, type Page } from '@playwright/test';

/**
 * Contexto do spot na página v6 (#184), depois da retirada dos duplicados.
 *
 * Do antigo contexto (S2C/SP-C: «No local» · «Chegar e estar» · «Perto
 * daqui» · «Como sabemos») a v6 mantém só o que não tinha, logo a seguir ao
 * «Estudar o spot» e no estilo v6: «No local» (avisos e radar, câmara ao
 * vivo, estação na praia) e «Chegar e estar» (sobre o spot, região e nível,
 * localização, dicas locais), mais os eventos. «Perto daqui» e «Como
 * sabemos» saíram (os vizinhos estão na praia 3D).
 */

const SPOT_SLUG = 'guincho';
const LIVECAM_SLUG = 'moledo';

async function abre(page: Page, slug = SPOT_SLUG, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/pt/spots/${slug}/`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('spot-contexto')).toBeAttached();
}

type Caixa = { name: string; x: number; y: number; width: number; height: number };

async function caixas(page: Page): Promise<Caixa[]> {
  const out: Caixa[] = [];
  for (const id of ['estudo', 'no-local', 'chegar']) {
    const b = await page.locator(`#${id}`).boundingBox();
    expect(b, `#${id}`).toBeTruthy();
    out.push({ name: id, ...b! });
  }
  return out;
}

function semSobreposicao(bs: Caixa[]) {
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      const sobrepoe =
        a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
      expect(sobrepoe, `${a.name} sobrepõe ${b.name}`).toBe(false);
    }
  }
}

async function semOverflow(page: Page) {
  const cabe = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(cabe).toBe(true);
}

test.describe('Contexto do spot (v6)', () => {
  test.use({ serviceWorkers: 'block' });

  test('âncoras #no-local e #chegar existem uma vez, as retiradas não; «No local» visível sem interacção', async ({
    page,
  }) => {
    await abre(page);
    for (const id of ['no-local', 'chegar']) {
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
    for (const id of ['perto', 'como-sabemos', 'instrumentos', 'previsao']) {
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(0);
    }
    const noLocal = page.getByRole('group', { name: 'No local' });
    await expect(noLocal).toBeVisible();
    // Conteúdo sem interacção: o bloco de avisos resolve sozinho.
    await expect(noLocal.getByText(/Sem avisos activos|Avisos/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('logo a seguir ao «Estudar o spot» e antes das acções, no estilo v6', async ({ page }) => {
    await abre(page);
    const ordem = await page.evaluate(() => {
      const v6 = document.querySelector('[data-testid="spot-v6"]')!;
      const filhos = Array.from(v6.children);
      const pos = (sel: string) => filhos.findIndex((el) => el.matches(sel));
      return { estudo: pos('#estudo'), ctx: pos('[data-testid="spot-contexto"]'), acoes: pos('[data-testid="spot-acoes"]') };
    });
    expect(ordem.estudo).toBeGreaterThanOrEqual(0);
    expect(ordem.ctx).toBe(ordem.estudo + 1);
    expect(ordem.acoes).toBe(ordem.ctx + 1);
    // Tipografia e cores da v6: títulos em Barlow Condensed, cartões no --fundo da v6.
    const t = page.locator('#no-local-t');
    expect(await t.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Barlow Condensed/);
    expect(await page.locator('#no-local').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 27, 44)');
    // Nenhum cartão do estilo antigo (card-1 / accordion CollapsibleSection) no contexto.
    await expect(page.locator('[data-testid="spot-contexto"] details')).toHaveCount(0);
  });

  test('1440: «No local» e «Chegar e estar» lado a lado, por baixo do «Estudar o spot», sem sobreposição', async ({
    page,
  }) => {
    await abre(page);
    const [estudo, a, b] = await caixas(page);
    expect(a.y).toBeGreaterThan(estudo.y + estudo.height - 1);
    expect(b.x).toBeGreaterThan(a.x);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(2);
    semSobreposicao([estudo, a, b]);
    await semOverflow(page);
  });

  test('390: blocos empilhados, sem sobreposição nem overflow', async ({ page }) => {
    await abre(page, SPOT_SLUG, 390, 844);
    const bs = await caixas(page);
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i].y, `${bs[i].name} devia estar por baixo de ${bs[i - 1].name}`).toBeGreaterThan(bs[i - 1].y);
    }
    semSobreposicao(bs);
    await semOverflow(page);
    // Sem accordion: «Chegar e estar» lê-se sem abrir nada.
    await expect(page.locator('#chegar dt').filter({ hasText: /^Estacionamento$/ })).toBeVisible();
  });

  test('«Chegar e estar» não repete a v6: sem mapa, sem «Como chegar», sem melhor maré nem perigos', async ({
    page,
  }) => {
    await abre(page);
    const chegar = page.locator('#chegar');
    await expect(chegar.getByText('Sobre o spot', { exact: true })).toBeVisible();
    for (const dt of [/^Região$/, /^Nível$/, /^Localização$/, /^Dormir$/]) {
      await expect(chegar.locator('dt').filter({ hasText: dt }), String(dt)).toHaveCount(1);
    }
    // «Como chegar» vive só nas acções; a praia 3D é o mapa; a melhor maré e os
    // perigos vivem no «Estudar o spot».
    await expect(page.getByRole('link', { name: /Como chegar/i })).toHaveCount(1);
    await expect(chegar.locator('.leaflet-container, canvas')).toHaveCount(0);
    for (const dt of [/^Melhor maré$/, /^Perigos$/, /^Maré ideal$/]) {
      await expect(chegar.locator('dt').filter({ hasText: dt }), String(dt)).toHaveCount(0);
    }
  });

  test('livecam é link externo com rel/target correctos e é o destino da acção «Câmara ao vivo»', async ({ page }) => {
    await abre(page, LIVECAM_SLUG);
    const link = page.locator('#spot-livecam a[href^="http"]').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    // A acção da linha v6 aponta para a âncora da câmara, que existe uma vez.
    await expect(page.getByTestId('spot-acoes').locator('a[href="#spot-livecam"]')).toHaveCount(1);
    await expect(page.locator('[id="spot-livecam"]')).toHaveCount(1);
  });

  test('avisos costeiros em «No local» têm tone="info" (sem alarme)', async ({ page }) => {
    await abre(page);
    const block = page.locator('#no-local [data-testid="coastal-nav-warnings"]');
    await expect(block).toBeVisible({ timeout: 15_000 });
    await expect(block).toHaveAttribute('data-tone', 'info');
    await expect(block).not.toHaveClass(/score-poor/);
    // Tom neutro: o canal vermelho do fundo não domina (alerta seria r≫g,b).
    const bg = await block.evaluate((el) => getComputedStyle(el).backgroundColor);
    const m = bg.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThan(Number(m![3]) + 12);
  });
});
