import { test, expect, type Page } from '@playwright/test';

/**
 * Contexto do spot na página v6 (#184), depois da retirada dos duplicados.
 *
 * Do antigo contexto (S2C/SP-C: «No local» · «Chegar e estar» · «Perto
 * daqui» · «Como sabemos») a v6 mantém só o que não tinha, logo a seguir ao
 * «Estudar o spot» e no estilo v6: «No local» (avisos e radar, câmara ao
 * vivo, estação na praia, qualidade da água) e «Chegar e estar» (sobre o
 * spot, região e nível, localização, dicas locais), «Perto daqui» (vizinhos
 * com a nota da mesma modalidade e o diretório, de volta por decisão do Pedro
 * de 2026-10-15) e os eventos. Só «Como sabemos» fica de fora.
 */

const SPOT_SLUG = 'guincho';
const LIVECAM_SLUG = 'moledo';

async function abre(page: Page, slug = SPOT_SLUG, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/pt/spots/${slug}/`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('spot-contexto')).toBeAttached();
}

/**
 * `map-hours.json` real com as séries v6 (kitesurf, surf) trocadas (#218, PR 2):
 * de noite o v6 não dá nota (`null` → «–» no «Perto daqui»), por isso os testes
 * da nota /10 não podem depender da hora a que o CI corre.
 */
async function mapHoursV6(page: Page, troca: (v: number | null) => number | null) {
  await page.route('**/data/map-hours.json', async (route) => {
    const res = await route.fetch();
    const j = (await res.json()) as { spots?: Record<string, Record<string, Array<number | null>>> };
    for (const row of Object.values(j.spots ?? {})) {
      for (const k of ['kitesurf', 'surf']) if (Array.isArray(row[k])) row[k] = row[k].map(troca);
    }
    await route.fulfill({ response: res, json: j });
  });
}

type Caixa = { name: string; x: number; y: number; width: number; height: number };

async function caixas(page: Page): Promise<Caixa[]> {
  const out: Caixa[] = [];
  for (const id of ['estudo', 'no-local', 'chegar', 'perto']) {
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

  test('âncoras #no-local, #chegar e #perto existem uma vez, as retiradas não; «No local» visível sem interacção', async ({
    page,
  }) => {
    await abre(page);
    for (const id of ['no-local', 'chegar', 'perto']) {
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
    for (const id of ['como-sabemos', 'instrumentos', 'previsao']) {
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
    // Nenhum cartão do estilo antigo (card-1 / card-2 / accordion CollapsibleSection) no contexto.
    await expect(page.locator('[data-testid="spot-contexto"] details')).toHaveCount(0);
    await expect(page.locator('[data-testid="spot-contexto"] :is(.card-1, .card-2)')).toHaveCount(0);
  });

  test('1440: «No local» e «Chegar e estar» lado a lado, por baixo do «Estudar o spot», «Perto daqui» a toda a largura, sem sobreposição', async ({
    page,
  }) => {
    await abre(page);
    const [estudo, a, b, perto] = await caixas(page);
    expect(a.y).toBeGreaterThan(estudo.y + estudo.height - 1);
    expect(b.x).toBeGreaterThan(a.x);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(2);
    expect(perto.y).toBeGreaterThan(Math.max(a.y + a.height, b.y + b.height) - 1);
    expect(perto.width).toBeGreaterThan(b.x + b.width - a.x - 2);
    semSobreposicao([estudo, a, b, perto]);
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

  test('«Perto daqui»: nomes sem truncar, distância, ?sport= e a nota /10 na cor da banda v6', async ({ page }) => {
    await mapHoursV6(page, (v) => v ?? 50); // independente da hora do CI (noite = null)
    await abre(page);
    const lista = page.getByTestId('nearby-spots');
    await lista.scrollIntoViewIfNeeded();
    const links = lista.locator('[data-nearby-spot]');
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i++) {
      const link = links.nth(i);
      await expect(link).toHaveAttribute('href', /\?sport=/);
      await expect(link).toContainText(/km|m\b/);
      const nome = link.locator('[data-nearby-name]');
      expect(await nome.evaluate((el) => el.scrollWidth - el.clientWidth), `nome truncado: ${await nome.textContent()}`).toBeLessThanOrEqual(1);
      expect(await nome.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe('ellipsis');
    }
    // Nota /10 na cor da banda v6 (tokens de cores.md), com o escalão exposto.
    const nota = lista.locator('[data-nearby-score][data-score-tier]').first();
    await expect(nota).toBeVisible({ timeout: 15_000 });
    await expect(nota).toHaveText(/^\d{1,2}$/);
    expect(['epic', 'good', 'fair', 'poor', 'closed']).toContain(await nota.getAttribute('data-score-tier'));
    const fundo = await nota.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgb(168, 70, 74)', 'rgb(68, 121, 238)', 'rgb(201, 158, 42)', 'rgb(64, 220, 208)', 'rgb(255, 240, 122)']).toContain(fundo);
    expect(await nota.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Barlow Condensed/);
  });

  test('«Perto daqui» de noite (map-hours v6 = null): «–» sem nota nem escalão, nunca 0', async ({ page }) => {
    await mapHoursV6(page, () => null);
    const carregou = page.waitForResponse((r) => r.url().includes('/data/map-hours.json'), { timeout: 20_000 });
    await abre(page);
    const lista = page.getByTestId('nearby-spots');
    await lista.scrollIntoViewIfNeeded();
    await carregou;
    const chips = lista.locator('[data-nearby-score]');
    expect(await chips.count()).toBeGreaterThanOrEqual(2);
    await expect(lista.locator('[data-nearby-score][data-score-tier]')).toHaveCount(0);
    for (const txt of await chips.allTextContents()) expect(txt.trim()).toBe('–');
  });

  test('«Perto daqui» segue a modalidade da página (kite → ?sport=kitesurf, surf → ?sport=surf)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/pt/spots/${SPOT_SLUG}/?d=surf`);
    await expect(page.getByTestId('spot-contexto')).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('[data-testid="spot-v6"]')).toHaveAttribute('data-modalidade', 'surf');
    await expect(page.getByTestId('nearby-spots').locator('[data-nearby-spot]').first()).toHaveAttribute('href', /\?sport=surf$/);
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: /Kite/i }).click();
    await expect(page.getByTestId('nearby-spots').locator('[data-nearby-spot]').first()).toHaveAttribute('href', /\?sport=kitesurf$/);
  });

  test('390: nomes de «Perto daqui» sem truncar, sem accordion', async ({ page }) => {
    await abre(page, SPOT_SLUG, 390, 844);
    await expect(page.locator('#perto details')).toHaveCount(0);
    const nomes = page.locator('#perto [data-nearby-name]');
    const n = await nomes.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i++) {
      expect(await nomes.nth(i).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
  });
});
