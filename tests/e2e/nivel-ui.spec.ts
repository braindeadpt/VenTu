import { test, expect, type Page } from '@playwright/test';
import { abreHome, fixtureMaquete, fraseMaquete } from './helpers/homeV6';
import { waitHydrated } from './helpers/hydration';

/**
 * #nivel-ui — o nível do utilizador na home e no spot v6 (maquete aprovada
 * `work/maquete-nivel`, estudo §3–§4; lógica do #360). O nível é o do filtro
 * do /mapa (`ventu:map:difficulty`), lido como tecto e só depois de montar.
 *
 * Home: fixture hermética da maquete (qua 14 out 2026, 14h; `fixtureMaquete`),
 * a mesma dos testes da home v6. Estados:
 *  - sem nível → igual à v6 (só o botão «Nível» a mais);
 *  - kite · iniciante → ≥ 3 do nível: top 3 do nível, «Guincho 9 fica de fora»;
 *  - surf · intermédio, fim de tarde → poucos (1): frase e aviso do nível, cartões acima marcados;
 *  - surf · iniciante → zero: «Não vai.», frase do nível, «Nos próximos dois dias, também não».
 * Spot: o Guincho (avançado em kite, intermédio em surf) com o build — o aviso
 * não depende da hora: só do nível do spot e do escolhido. A nota nunca muda.
 */

const CHAVE = 'ventu:map:difficulty';

async function comNivel(page: Page, nivel: string | null) {
  await page.addInitScript(
    ([k, v]) => {
      try {
        if (v) localStorage.setItem(k, v);
        else localStorage.removeItem(k);
      } catch {
        /* noop */
      }
    },
    [CHAVE, nivel] as const,
  );
}

async function leitura(page: Page) {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const qa = (s: string) => Array.from(document.querySelectorAll(s)) as HTMLElement[];
    return {
      lider: q('[data-testid="home-lider"]')?.dataset.spot,
      rkLider: q('[data-testid="home-lider"] .rk')?.textContent ?? '',
      cartoes: qa('[data-testid="home-cartao"]').map((e) => ({
        id: e.dataset.spot,
        acima: e.hasAttribute('data-acima-nivel'),
        rk: e.querySelector('.rk')?.textContent ?? '',
        tag: e.querySelector('[data-testid="cartao-nivel"]')?.textContent ?? null,
      })),
      nota: q('[data-testid="nivel-nota"]')?.textContent ?? null,
      estado: q('[data-testid="nivel-nota"]')?.dataset.estado ?? null,
      frase: q('[data-testid="home-frase"]')?.textContent ?? '',
      fraseNivel: q('[data-testid="home-frase"]')?.hasAttribute('data-frase-nivel') ?? false,
      palavra: q('[data-testid="home-palavra"]')?.dataset.palavra,
    };
  });
}

test.describe('#nivel-ui home — 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('sem nível: a home da v6 (frase nacional, sem aviso, sem «· iniciante») e o botão «Nível» apagado', async ({ page }) => {
    await comNivel(page, null);
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=kite', { maquete: true });
    const b = page.getByTestId('nivel-botao');
    await expect(b).toHaveText('Nível', { useInnerText: true, ignoreCase: true });
    await expect(b).toHaveClass(/vazio/);
    await expect(b).toHaveAttribute('aria-label', 'Escolher o teu nível');
    await expect(b).toHaveAttribute('aria-expanded', 'false');
    const r = await leitura(page);
    expect(r.lider).toBe('guincho');
    expect(r.nota).toBeNull();
    expect(r.fraseNivel).toBe(false);
    expect(r.frase).toBe(fraseMaquete('pt'));
    expect(r.rkLider).toBe('nº 1 agora');
    expect(r.cartoes.every((c) => !c.acima && c.tag == null)).toBe(true);
    await expect(page.locator('[data-testid="rk-nivel"]')).toHaveCount(0);
    // 58 × 52 ao lado do selector, tudo dentro de 390
    const bb = await b.boundingBox();
    const tg = await page.getByTestId('home-modo').getByTestId('modalidade-toggle').boundingBox();
    expect(bb!.width).toBeGreaterThanOrEqual(44);
    expect(bb!.height).toBeGreaterThanOrEqual(44);
    expect(bb!.x + bb!.width).toBeLessThanOrEqual(tg!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('kite · iniciante (≥ 3 do nível dão): top 3 do nível e «Guincho 9 fica de fora: é um spot para avançados»', async ({ page }) => {
    await comNivel(page, 'beginner');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=kite', { maquete: true });
    await expect(page.getByTestId('nivel-botao')).toHaveText('Iniciante', { useInnerText: true, ignoreCase: true });
    await expect(page.getByTestId('nivel-nota')).toHaveAttribute('data-estado', 'fora');
    await expect(page.getByTestId('nivel-nota')).toHaveText('Guincho 9 fica de fora: é um spot para avançados.');
    const r = await leitura(page);
    expect(r.lider).not.toBe('guincho');
    expect(r.cartoes.map((c) => c.id)).not.toContain('guincho');
    expect(r.rkLider).toBe('nº 1 agora · iniciante');
    for (const c of r.cartoes) {
      expect(c.acima).toBe(false);
      expect(c.rk).toMatch(/^nº [23] agora · iniciante$/);
    }
    // com ≥ 3 do nível a frase continua a ser a nacional
    expect(r.fraseNivel).toBe(false);
    // a régua segue o nível: o bloco «agora» mostra o nº 1 do nível
    const regua = await page.locator('[data-testid="home-regua"] button[aria-pressed="true"]').getAttribute('data-spot');
    expect(regua).toBe(r.lider);
    // o link do «fora» abre o spot
    await expect(page.getByTestId('nivel-nota').getByRole('link', { name: 'Guincho' })).toHaveAttribute('href', /\/pt\/spots\/guincho\/\?d=kite/);
  });

  test('surf · intermédio ao fim da tarde (poucos): frase e aviso do nível, cartões acima marcados «nº N da costa»', async ({ page }) => {
    await comNivel(page, 'intermediate');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=surf&b=0-fim', { maquete: true });
    await expect(page.getByTestId('nivel-nota')).toHaveAttribute('data-estado', 'poucos');
    const r = await leitura(page);
    expect(r.nota).toMatch(/^Só 1 dos \d+ spots para intermédios dá hoje ao fim da tarde\./);
    expect(r.nota).toContain('Mostramos também os melhores da costa, marcados: pedem mais nível.');
    expect(r.fraseNivel).toBe(true);
    // banda «dá»: a frase fecha sem chip («só X dá hoje ao fim da tarde.»), nunca a forma antiga «…: dá.»
    expect(r.frase).toMatch(/^Para intermédio, só [^:]+ dá hoje ao fim da tarde\.$/);
    expect(r.rkLider).toBe('nº 1 hoje ao fim da tarde · intermédio');
    const acima = r.cartoes.filter((c) => c.acima);
    expect(acima.length).toBeGreaterThan(0);
    for (const c of acima) {
      expect(c.tag).toMatch(/^Spot para (avançados|experientes)$/);
      expect(c.rk).toMatch(/^nº \d+ da costa hoje ao fim da tarde$/);
    }
  });

  test('surf · iniciante (zero): «Não vai.», a frase do nível e «Nos próximos dois dias, também não»', async ({ page }) => {
    await comNivel(page, 'beginner');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=surf', { maquete: true });
    await expect(page.getByTestId('nivel-nota')).toHaveAttribute('data-estado', 'zero');
    const r = await leitura(page);
    expect(r.palavra).toBe('naoVai');
    expect(r.frase).toMatch(/^Para iniciante, o surf não dá em lado nenhum agora\. O melhor do teu nível é .+: fraco\.$/);
    expect(r.nota).toMatch(/^Nenhum dos \d+ spots para iniciantes dá agora\./);
    expect(r.nota).toContain('Nos próximos dois dias, também não.');
    expect(r.cartoes.length).toBe(2);
    for (const c of r.cartoes) {
      expect(c.acima).toBe(true);
      expect(c.tag).toMatch(/^Spot para /);
    }
    // nunca vermelho no aviso: o contorno é o --sol
    const sombra = await page.locator('[data-testid="nivel-nota"] .poucos').evaluate((e) => getComputedStyle(e).boxShadow);
    expect(sombra).toContain('255, 201, 60');
  });

  test('o menu: grupo de rádio com setas, Esc devolve o foco; «Avançado» e «Todos» mudam a home e a chave do /mapa', async ({ page }) => {
    await comNivel(page, 'beginner');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=kite', { maquete: true });
    const b = page.getByTestId('nivel-botao');
    await b.click();
    const menu = page.getByTestId('nivel-menu');
    await expect(menu).toBeVisible();
    await expect(b).toHaveAttribute('aria-expanded', 'true');
    const grupo = menu.getByRole('radiogroup', { name: 'O teu nível' });
    await expect(grupo.getByRole('radio', { name: /Iniciante/ })).toHaveAttribute('aria-checked', 'true');
    await expect(grupo.getByRole('radio', { name: /Iniciante/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(grupo.getByRole('radio', { name: /Intermédio/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(b).toBeFocused();
    // dentro do ecrã (telemóvel: o menu ocupa a largura)
    await b.click();
    const mb = await menu.boundingBox();
    expect(mb!.x).toBeGreaterThanOrEqual(0);
    expect(mb!.x + mb!.width).toBeLessThanOrEqual(390);
    await grupo.getByRole('radio', { name: /Avançado/ }).click();
    await expect(menu).toBeHidden();
    await expect(b).toHaveText('Avançado', { useInnerText: true, ignoreCase: true });
    expect(await page.evaluate((k) => localStorage.getItem(k), CHAVE)).toBe('advanced');
    await expect(page.getByTestId('nivel-nota')).toHaveCount(0);
    await expect(page.getByTestId('home-lider')).toHaveAttribute('data-spot', 'guincho');
    await b.click();
    await grupo.getByRole('radio', { name: /^Todos/ }).click();
    await expect(b).toHaveText('Nível', { useInnerText: true, ignoreCase: true });
    expect(await page.evaluate((k) => localStorage.getItem(k), CHAVE)).toBe('all');
    await expect(page.locator('[data-testid="rk-nivel"]')).toHaveCount(0);
  });
});

test.describe('#nivel-ui home — 1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

  test('kite · iniciante: controlo com o nome ao lado do selector; o aviso cabe no hero', async ({ page }) => {
    await comNivel(page, 'beginner');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=kite', { maquete: true });
    const b = await page.getByTestId('nivel-botao').boundingBox();
    const tg = await page.getByTestId('home-modo').getByTestId('modalidade-toggle').boundingBox();
    expect(b!.x + b!.width).toBeLessThanOrEqual(tg!.x);
    expect(Math.abs(b!.y + b!.height / 2 - (tg!.y + tg!.height / 2))).toBeLessThanOrEqual(2);
    const hero = await page.getByTestId('home-hero').boundingBox();
    const nota = await page.getByTestId('nivel-nota').boundingBox();
    expect(nota!.y + nota!.height).toBeLessThanOrEqual(hero!.y + hero!.height);
  });

  test('surf · iniciante (zero): o aviso e o nº 1 cabem no hero; legenda «esbatido: acima do teu nível»', async ({ page }) => {
    await comNivel(page, 'beginner');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=surf', { maquete: true });
    await expect(page.getByTestId('nivel-nota')).toHaveAttribute('data-estado', 'zero');
    const hero = await page.getByTestId('home-hero').boundingBox();
    for (const s of ['home-quando', 'home-lider', 'nivel-nota']) {
      const r = await page.getByTestId(s).boundingBox();
      expect(r!.y, s).toBeGreaterThanOrEqual(hero!.y);
      expect(r!.y + r!.height, s).toBeLessThanOrEqual(hero!.y + hero!.height);
    }
    await expect(page.getByTestId('legenda-nivel')).toHaveText('esbatido: acima do teu nível');
  });
  test('surf · intermédio ao fim da tarde (poucos): a data comprida nunca passa por baixo do nível + selector', async ({ page }) => {
    await comNivel(page, 'intermediate');
    await fixtureMaquete(page);
    await abreHome(page, '/pt/?d=surf&b=0-fim', { maquete: true });
    await expect(page.getByTestId('nivel-nota')).toHaveAttribute('data-estado', 'poucos');
    const q = (await page.getByTestId('home-quando').boundingBox())!;
    const m = (await page.getByTestId('home-modo').boundingBox())!;
    const toca = q.x + q.width > m.x && q.x < m.x + m.width && q.y + q.height > m.y && q.y < m.y + m.height;
    expect(toca, JSON.stringify({ q, m })).toBe(false);
    const hero = (await page.getByTestId('home-hero').boundingBox())!;
    expect(q.y).toBeGreaterThanOrEqual(hero.y);
  });

  test('/es/ (a home v6 cai para EN): o nível sai na mesma língua do hero, nunca em espanhol ao lado de inglês', async ({ page }) => {
    await comNivel(page, 'beginner');
    await fixtureMaquete(page);
    await abreHome(page, '/es/?d=kite', { maquete: true });
    await expect(page.getByTestId('nivel-botao')).toHaveText('Beginner', { useInnerText: true, ignoreCase: true });
    await expect(page.getByTestId('nivel-nota')).toHaveText('Guincho 9 is left out: it is a spot for advanced riders.');
    await expect(page.getByTestId('home-lider').locator('[data-testid="rk-nivel"]')).toHaveText('beginner');
    await expect(page.getByTestId('legenda-nivel')).toHaveText('faded: above your level');
  });
});

test.describe('#nivel-ui spot (Guincho: avançado em kite, intermédio em surf)', () => {
  test.use({ serviceWorkers: 'block' });

  async function abreSpot(page: Page, q: string) {
    await page.goto(`/pt/spots/guincho/${q}`);
    await waitHydrated(page);
    await expect(page.getByTestId('spot-v6')).toHaveClass(/vivo/, { timeout: 20_000 });
  }

  test('390 · kite · iniciante: «Spot para avançados», o link para os do nível perto; a nota não muda', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await comNivel(page, 'beginner');
    await abreSpot(page, '?d=kite');
    const av = page.getByTestId('spot-nivel');
    await expect(av).toHaveAttribute('data-estado', 'acima');
    await expect(av.getByRole('note')).toHaveText('Spot para avançados');
    const link = av.locator('a.m');
    await expect(link).toHaveText(/^[1-3] spots? de iniciante perto$/);
    await expect(link).toHaveAttribute('href', '#perto-nivel');
    // o destino: «Do teu nível, perto daqui», com ≤ 3 spots do nível a menos de 80 km
    const perto = page.getByTestId('perto-nivel');
    await expect(perto.getByRole('heading', { name: 'Do teu nível, perto daqui' })).toBeAttached();
    const n = await perto.locator('li').count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3);
    await expect(perto.locator('li .km').first()).toContainText('para iniciantes');
    // a nota do veredicto é a mesma sem nível
    const comNv = await page.locator('[data-testid="spot-veredicto"] .nota').getAttribute('data-nota');
    await page.evaluate((k) => localStorage.removeItem(k), CHAVE);
    await page.getByTestId('nivel-botao').click();
    await page.getByTestId('nivel-menu').getByRole('radio', { name: /^Todos/ }).click();
    await expect(page.getByTestId('spot-nivel')).toHaveAttribute('data-estado', 'dica');
    expect(await page.locator('[data-testid="spot-veredicto"] .nota').getAttribute('data-nota')).toBe(comNv);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('1440 · kite · iniciante: o porquê (perigos da ficha), «Escolheste iniciante.» e os chips do nível', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await comNivel(page, 'beginner');
    await abreSpot(page, '?d=kite');
    const av = page.getByTestId('spot-nivel');
    await expect(av.locator('.porq')).toHaveText('Vento forte, correntes e rochas: aqui o kite pede experiência. Escolheste iniciante.');
    const chips = av.locator('a.ch');
    expect(await chips.count()).toBeGreaterThan(0);
    await expect(chips.first()).toHaveAttribute('href', /\/pt\/spots\/[a-z0-9-]+\/\?d=kite$/);
    // a etiqueta nunca é vermelha
    const sombra = await av.getByRole('note').evaluate((e) => getComputedStyle(e).boxShadow);
    expect(sombra).toContain('255, 201, 60');
  });

  test('kite · avançado: nenhum aviso; surf · iniciante: «Spot para intermédios» (nível por modalidade)', async ({ page }) => {
    await comNivel(page, 'advanced');
    await abreSpot(page, '?d=kite');
    await expect(page.getByTestId('nivel-botao')).toHaveText('Avançado', { useInnerText: true, ignoreCase: true });
    await expect(page.getByTestId('spot-nivel')).toHaveCount(0);
    await expect(page.getByTestId('perto-nivel')).toHaveCount(0);
    await page.getByTestId('nivel-botao').click();
    await page.getByTestId('nivel-menu').getByRole('radio', { name: /Iniciante/ }).click();
    await expect(page.getByTestId('spot-nivel')).toHaveAttribute('data-estado', 'acima');
    await page.getByTestId('modalidade-toggle').getByRole('button', { name: /Surf/ }).click();
    await expect(page.getByTestId('spot-nivel').getByRole('note')).toHaveText('Spot para intermédios');
    await expect(page.getByTestId('spot-nivel-ficha')).toHaveText('avançado em kite, intermédio em surf');
  });

  test('sem nível: só a dica, que abre o menu do nível', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await comNivel(page, null);
    await abreSpot(page, '?d=kite');
    const av = page.getByTestId('spot-nivel');
    await expect(av).toHaveAttribute('data-estado', 'dica');
    await expect(av).toHaveText('Spot para avançados em kite.Qual é o teu nível?');
    await av.getByRole('button', { name: 'Qual é o teu nível?' }).click();
    await expect(page.getByTestId('nivel-menu')).toBeVisible();
    await expect(page.getByTestId('nivel-menu').getByRole('radio', { name: /^Todos/ })).toBeFocused();
  });
});
