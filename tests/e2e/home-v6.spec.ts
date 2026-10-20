import { test, expect, type Page } from '@playwright/test';
import { abreHome, caixa, fixtureMaquete, NOITE_MAQUETE } from './helpers/homeV6';
import { VENTO_MOVEL } from '../../src/lib/home/hrefMapa';

/**
 * #183 — home v6 «Atlântico» (contrato: docs/design/maquetes/v6-atlantico).
 *
 *  - 390: o primeiro ecrã mostra a palavra, a frase nacional e o nº 1; 1440: tudo acima da dobra;
 *    sem scroll horizontal a 360 e 390;
 *  - palavra e frase no HTML estático (LCP), MapLibre fora do bundle inicial;
 *  - lista única: nº 1 = melhor da régua = 1.º rótulo do mapa = foto do hero; top 3 = 3 rótulos;
 *  - régua de blocos (aria-pressed, teclado) muda palavra, frase, top 3 e fotos;
 *  - porta do mapa (#273, v7): o cartão é um link com nome para o /mapa com o contexto da home
 *    (modalidade, hora/bloco, câmara, `de=home`), foco visível, ≥ 44 × 44, sem diálogo; rótulos
 *    abrem o /mapa com o spot; o chip do vento não tapa o título; rodapé sem «Mapa da costa»;
 *  - WebGL2 obrigatório (fallback plano estático com setas), prefers-reduced-motion;
 *  - toques ≥ 44 × 44; créditos com ligação; ventu.modalidade {d, v} nos dois sentidos; PT e EN;
 *  - nunca «/100» nem números > 10 junto a rótulos de nota.
 * Os testes com conteúdo fixo usam os dados da maquete (`fixtureMaquete`): «VAI.», Guincho 9.
 */

async function leituraLista(page: Page) {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const qa = (s: string) => Array.from(document.querySelectorAll(s)) as HTMLElement[];
    const sel = q('[data-testid="home-regua"] button[aria-pressed="true"]');
    return {
      lider: q('[data-testid="home-lider"]')?.dataset.spot,
      notaLider: q('[data-testid="home-lider"]')?.dataset.nota,
      cartoes: qa('[data-testid="home-cartao"]').map((e) => e.dataset.spot),
      regua: sel?.dataset.spot,
      notaRegua: sel?.dataset.nota,
      foto: q('[data-testid="home-hero-foto"]')?.dataset.spot,
      rotulosTop: qa('[data-testid="home-rotulos"] .rot[data-top]')
        .sort((a, b) => Number(a.dataset.top) - Number(b.dataset.top))
        .map((e) => e.dataset.spot),
    };
  });
}

test.describe('#183 home v6 — 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('primeiro ecrã: palavra, frase nacional e nº 1 (dados da maquete: «VAI.», Guincho 9)', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    await expect(page.getByTestId('home-palavra')).toHaveText(/^Vai\./);
    await expect(page.getByTestId('home-palavra')).toHaveCSS('text-transform', 'uppercase');
    await expect(page.getByTestId('home-frase')).toHaveText('Nortada a apertar à volta de Lisboa: kite bom a muito bom do Guincho à Lagoa, até às 19h.');
    await expect(page.getByTestId('home-lider')).toHaveAttribute('data-spot', 'guincho');
    await expect(page.getByTestId('home-lider')).toHaveAttribute('data-nota', '9');
    await expect(page.getByTestId('home-quando')).toHaveText(/qua 14 out · 14h · agora/i);
    for (const s of ['[data-testid="home-palavra"]', '[data-testid="home-frase"]', '[data-testid="home-lider"]']) {
      const r = await caixa(page, s);
      expect(r, s).not.toBeNull();
      expect(r!.b, `${s} dentro do primeiro ecrã (acima da régua fixa)`).toBeLessThanOrEqual(844 - 100);
    }
    const regua = await caixa(page, '[data-testid="home-regua"]');
    expect(regua!.b).toBeLessThanOrEqual(845);
    expect(regua!.y).toBeGreaterThan(844 - 140);
  });

  for (const w of [360, 390]) {
    test(`sem scroll horizontal a ${w} px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 });
      await abreHome(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    });
  }

  test('toques ≥ 44 × 44: Kite/Surf (≥ 44 × 76), os blocos, a porta do mapa e o ícone do cabeçalho, cartões', async ({ page }) => {
    await abreHome(page);
    const medir = async (loc: import('@playwright/test').Locator, nome: string, minW = 44) => {
      const b = await loc.boundingBox();
      expect(b, nome).not.toBeNull();
      expect(b!.width, `${nome} largura`).toBeGreaterThanOrEqual(minW);
      expect(b!.height, `${nome} altura`).toBeGreaterThanOrEqual(44);
    };
    const modo = page.getByRole('group', { name: 'Modalidade', exact: true });
    await medir(modo.getByRole('button', { name: 'Kite' }), 'Kite', 76);
    await medir(modo.getByRole('button', { name: 'Surf' }), 'Surf', 76);
    const blocos = page.getByTestId('home-regua').locator('button.bloco');
    const n = await blocos.count();
    expect(n).toBeGreaterThanOrEqual(1);
    for (let k = 0; k < n; k++) await medir(blocos.nth(k).locator('.bar'), `bloco ${k}`);
    await medir(page.getByRole('banner').getByRole('link', { name: 'Mapa da costa', exact: true }), 'ícone «Mapa da costa» no cabeçalho');
    const porta = page.getByTestId('home-mapa').getByRole('link', { name: 'Explorar o mapa da costa' });
    await porta.scrollIntoViewIfNeeded();
    await medir(porta, 'porta do mapa');
    await medir(page.getByTestId('home-mapa').locator('.cta-seta'), 'seta do CTA');
    for (const c of await page.getByTestId('home-cartao').all()) await medir(c.locator('a.in'), 'cartão');
  });

  test('régua de blocos: escolher um bloco muda palavra, frase, top 3 e foto; aria-pressed; teclado', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    const regua = page.getByTestId('home-regua');
    await expect(regua.locator('button.bloco')).toHaveCount(5);
    await expect(regua.locator('button[aria-pressed="true"]')).toHaveAttribute('data-b', '0-tarde');
    await expect(page.getByTestId('home-regua')).toContainText(/Hoje · 14h/i);
    const antes = await page.getByTestId('home-frase').textContent();
    // amanhã à tarde (surf): Arrifana, Tonel e Nazaré na maquete
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Surf' }).click();
    await regua.locator('button[data-b="1-tarde"]').click();
    await expect(regua.locator('button[data-b="1-tarde"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-quando')).toHaveText(/qui 15 out · tarde · 13h–17h/i);
    await expect(page.getByTestId('home-frase')).not.toHaveText(antes ?? '');
    const l = await leituraLista(page);
    expect(l.lider).toBe(l.regua);
    expect(l.foto).toBe(l.lider);
    // #273: o link do mapa acompanha a modalidade e o bloco (amanhã à tarde → t + dia=1)
    const href = await page.getByTestId('home-porta-mapa').getAttribute('href');
    expect(href).toMatch(new RegExp(`^/pt/mapa/\\?sport=surf${VENTO_MOVEL ? '&wind=1' : ''}&t=1[3-7]&dia=1&lat=39\\.35&lon=-8\\.95&z=6\\.5&de=home$`));
    // teclado: ← → percorrem os blocos e escolhem
    await regua.locator('button[data-b="1-tarde"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(regua.locator('button[data-b="1-manha"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(regua.locator('button[data-b="1-manha"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(regua.locator('button[data-b="1-tarde"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('lista única: nº 1 = melhor da régua = 1.º rótulo do mapa = foto do hero; top 3 = os 3 rótulos', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    for (const d of ['Kite', 'Surf']) {
      await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: d }).click();
      for (const b of ['0-tarde', '1-manha', '1-fim']) {
        await page.getByTestId('home-regua').locator(`button[data-b="${b}"]`).click();
        await page.getByTestId('home-mapa').scrollIntoViewIfNeeded();
        await expect(page.getByTestId('home-rotulos').locator('.rot[data-top]')).toHaveCount(3, { timeout: 20_000 });
        await expect.poll(async () => (await leituraLista(page)).rotulosTop[0]).toBe((await leituraLista(page)).lider);
        const l = await leituraLista(page);
        expect(l.regua, `${d} ${b}: régua`).toBe(l.lider);
        expect(l.notaRegua).toBe(l.notaLider);
        expect(l.foto, `${d} ${b}: foto`).toBe(l.lider);
        expect(l.rotulosTop, `${d} ${b}: rótulos`).toEqual([l.lider, ...l.cartoes]);
      }
    }
  });

  test('porta do mapa: o cartão é um link com nome para o /mapa com o contexto; sem diálogo nem «Abrir mapa»', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    const mapa = page.getByTestId('home-mapa');
    const porta = mapa.getByRole('link', { name: 'Explorar o mapa da costa' });
    await porta.scrollIntoViewIfNeeded();
    // contrato do URL (telemóvel: z=6.5; vento conforme o gate do Lighthouse)
    await expect(porta).toHaveAttribute(
      'href',
      `/pt/mapa/?sport=kitesurf${VENTO_MOVEL ? '&wind=1' : ''}&t=14&lat=39.35&lon=-8.95&z=6.5&de=home`,
    );
    await expect(porta).toHaveAccessibleDescription(/^\d+ spots de kite · vento ao vivo · 48 h$/);
    // a faixa é a entrada única: o link cobre a figura inteira; sem botão «Abrir mapa» nem diálogo
    const fig = await caixa(page, '[data-testid="home-mapa"] figure');
    const a = await caixa(page, '[data-testid="home-porta-mapa"]');
    expect(a).toEqual(fig);
    await expect(page.getByRole('button', { name: /Abrir mapa|Fechar o mapa/ })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(mapa).not.toHaveAttribute('aria-modal', /.*/);
    // um clique no meio da faixa (fora de rótulos e do crédito) cai no link
    const alvo = await page.evaluate(() => {
      const f = document.querySelector('[data-testid="home-mapa"] figure')!.getBoundingClientRect();
      const el = document.elementFromPoint(f.x + f.width / 2, f.bottom - 50);
      return el?.closest('a')?.dataset.testid ?? el?.className ?? null;
    });
    expect(alvo).toBe('home-porta-mapa');
    // foco visível pelo teclado (anel amarelo dentro do cartão) e Enter navega para o /mapa
    await porta.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(porta).toBeFocused();
    const anel = await porta.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { estilo: cs.outlineStyle, largura: parseFloat(cs.outlineWidth), cor: cs.outlineColor };
    });
    expect(anel.estilo).toBe('solid');
    expect(anel.largura).toBeGreaterThanOrEqual(3);
    expect(anel.cor).toBe('rgb(255, 201, 60)');
    await Promise.all([page.waitForURL(/\/pt\/mapa\/\?sport=kitesurf.*&de=home$/), page.keyboard.press('Enter')]);
  });

  test('chip do vento na 2.ª linha (não tapa o título); rodapé sem «Mapa da costa»', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    await page.getByTestId('home-mapa').scrollIntoViewIfNeeded();
    const t = await caixa(page, '#mapa-t');
    const chip = await caixa(page, '[data-testid="home-vento-chip"]');
    expect(chip, 'chip do vento').not.toBeNull();
    expect(chip!.y, 'o chip fica debaixo do título').toBeGreaterThanOrEqual(t!.b);
    expect(chip!.r).toBeLessThanOrEqual(390);
    const rodape = page.getByTestId('home-v6-rodape');
    await expect(rodape.getByRole('link', { name: 'Todos os spots' })).toBeVisible();
    await expect(rodape.getByRole('link', { name: 'Como lemos a nota' })).toBeVisible();
    await expect(rodape.getByRole('link', { name: /Mapa da costa/ })).toHaveCount(0);
  });

  test('a foto do hero e dos cartões tem crédito visível com ligações; substitutas dizem o sítio real', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    const cred = page.getByTestId('home-hero').getByTestId('foto-credito');
    await expect(cred).toBeVisible();
    await expect(cred).toContainText('Foto: Alvesgaspar / Commons, CC BY-SA 3.0');
    await expect(cred.getByRole('link')).toHaveCount(2);
    for (const c of await page.getByTestId('home-cartao').all()) {
      const cc = c.getByTestId('foto-credito');
      await expect(cc).toBeVisible();
      await expect(cc.getByRole('link')).toHaveCount(2);
      for (const a of await cc.getByRole('link').all()) await expect(a).toHaveAttribute('href', /utm_source=ventu&utm_medium=referral/);
    }
    // Lagoa de Albufeira e Caparica em kite: substitutas de Sines
    await expect(page.getByTestId('home-cartao').first().getByTestId('foto-credito')).toHaveAttribute('data-estado', 'sub');
    await expect(page.getByTestId('home-cartao').first().getByTestId('foto-credito')).toContainText('· Sines');
  });

  test('Kite/Surf grava {d, v}, sobrevive ao reload e ?d= tem prioridade; a string antiga migra', async ({ page }) => {
    await abreHome(page);
    const modo = page.getByRole('group', { name: 'Modalidade', exact: true });
    await modo.getByRole('button', { name: 'Surf' }).click();
    await expect(page.getByTestId('home-v6')).toHaveAttribute('data-modalidade', 'surf');
    await expect(page).toHaveURL(/[?&]d=surf/);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ventu.modalidade')))!)).toEqual({ d: 'surf', v: {} });
    await page.goto('/pt/');
    await expect(page.getByTestId('home-v6')).toHaveAttribute('data-modalidade', 'surf', { timeout: 15_000 });
    await expect(modo.getByRole('button', { name: 'Surf' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/pt/?d=kite');
    await expect(page.getByTestId('home-v6')).toHaveAttribute('data-modalidade', 'kite', { timeout: 15_000 });
    await page.evaluate(() => localStorage.setItem('ventu.modalidade', 'surf'));
    await page.goto('/pt/');
    await expect(page.getByTestId('home-v6')).toHaveAttribute('data-modalidade', 'surf', { timeout: 15_000 });
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ventu.modalidade')))!)).toEqual({ d: 'surf', v: {} });
  });

  test('home → spot (Surf) e spot → home (Kite) pela mesma chave', async ({ page }) => {
    await abreHome(page);
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Surf' }).click();
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByTestId('spot-v6')).toHaveAttribute('data-modalidade', 'surf', { timeout: 20_000 });
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Kite' }).click();
    await page.goto('/pt/');
    await expect(page.getByTestId('home-v6')).toHaveAttribute('data-modalidade', 'kite', { timeout: 20_000 });
  });

  test('noite (22h): «Noite.», a costa fecha, a frase aponta para amanhã e a régua tem o bloco da noite', async ({ page }) => {
    await fixtureMaquete(page, NOITE_MAQUETE);
    await abreHome(page, '/pt/', { maquete: true });
    await expect(page.getByTestId('home-palavra')).toHaveText(/^Noite\.a costa fecha · vê amanhã/);
    await expect(page.getByTestId('home-palavra')).toHaveAttribute('data-palavra', 'noite');
    await expect(page.getByTestId('home-frase')).toHaveText(/^Amanhã de manhã: /);
    await expect(page.getByTestId('home-regua').locator('button[data-b="noite"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-v6')).toHaveClass(/e-noite/);
  });
});

test.describe('#183 home v6 — 1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('tudo acima da dobra: hero, nº 2 e nº 3, mapa ao lado e a régua', async ({ page }) => {
    await abreHome(page);
    const hero = await caixa(page, '[data-testid="home-hero"]');
    const mapa = await caixa(page, '[data-testid="home-mapa"]');
    const regua = await caixa(page, '[data-testid="home-regua"]');
    expect(hero!.r).toBeLessThanOrEqual(mapa!.x);
    expect(mapa!.b).toBeLessThanOrEqual(900);
    for (const c of await page.getByTestId('home-cartao').all()) expect((await c.boundingBox())!.y + (await c.boundingBox())!.height).toBeLessThanOrEqual(900);
    expect(regua!.b).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    // desktop: o cartão do mapa é a porta do /mapa (z=7, vento ligado); sem «Abrir mapa» nem diálogo
    const porta = page.getByTestId('home-mapa').getByRole('link', { name: 'Explorar o mapa da costa' });
    await expect(porta).toBeVisible();
    await expect(porta).toHaveAttribute('href', /^\/pt\/mapa\/\?sport=(kitesurf|surf)&wind=1&t=\d{1,2}(&dia=1)?&lat=39\.35&lon=-8\.95&z=7&de=home$/);
    await expect(page.getByRole('button', { name: /Abrir mapa|Fechar o mapa/ })).toHaveCount(0);
    // «Mapa da costa» é o 1.º item da navegação do cabeçalho
    const nav = page.getByRole('banner').getByRole('navigation').first();
    await expect(nav.locator('a, button').first()).toHaveText('Mapa da costa');
    await expect(nav.locator('a, button').first()).toHaveAttribute('href', '/pt/mapa/');
  });

  test('o mapa mostra rótulos de todos os spots da modalidade, sem sobreposição', async ({ page }) => {
    await fixtureMaquete(page);
    await abreHome(page, '/pt/', { maquete: true });
    await expect(page.getByTestId('home-mapa').locator('figure')).toHaveAttribute('data-pronto', '1', { timeout: 30_000 });
    const rs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="home-rotulos"] .rot')).map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(rs.length).toBeGreaterThanOrEqual(8);
    // #273: cada rótulo abre o /mapa com esse spot aberto (…&spot=<id>&de=home), não a página do spot
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-testid="home-rotulos"] .rot')).map((e) => [e.dataset.spot, e.getAttribute('href')]),
    );
    for (const [id, h] of hrefs) expect(h).toMatch(new RegExp(`^/pt/mapa/\\?sport=kitesurf&wind=1&t=14&lat=39\\.35&lon=-8\\.95&z=7&spot=${id}&de=home$`));
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        const sobre = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(sobre, `rótulos ${i} e ${j} sobrepostos`).toBe(false);
      }
  });
});

test.describe('#183 home v6 — HTML estático, bundle, WebGL e movimento', () => {
  test('palavra, frase nacional e nº 1 no HTML estático; MapLibre fora do bundle inicial', async ({ page, request }) => {
    const html = await (await request.get('/pt/')).text();
    expect(html).toMatch(/data-testid="home-palavra"[^>]*>(Vai\.|Dá\.|Não vai\.|Noite\.)/);
    expect(html).toMatch(/data-testid="home-frase"[^>]*><span>[^<]{3,}/);
    expect(html).toContain('data-testid="home-lider"');
    // a foto do hero é o único fetchpriority alto da página: uma só <img> e, no máximo, o
    // <link rel=preload> que o React emite para essa mesma <img> (mesmo ficheiro)
    const altos = [...html.matchAll(/<(?:img|link)\b[^>]*fetchpriority="high"[^>]*>/gi)].map((m) => m[0]);
    const imgsAltas = altos.filter((t) => /^<img/i.test(t));
    expect(imgsAltas).toHaveLength(1);
    expect(imgsAltas[0]).toContain('data-testid="home-hero-foto"');
    const fotoHero = /\ssrc="([^"]+)"/.exec(imgsAltas[0])![1];
    expect(altos.length).toBeLessThanOrEqual(2);
    for (const t of altos) expect(t).toContain(fotoHero);
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const s of srcs) {
      const js = await (await request.get(s)).text();
      expect(js, s).not.toContain('maplibregl');
      expect(js, s).not.toContain('MapLibre GL JS');
    }
    await abreHome(page);
    expect(await page.evaluate(() => (window as unknown as { maplibregl?: unknown }).maplibregl)).toBeUndefined();
  });

  test('sem WebGL2: fallback plano estático com setas, rótulos e legenda', async ({ page }) => {
    await page.addInitScript(() => {
      const og = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error — substituição de teste
      HTMLCanvasElement.prototype.getContext = function (tipo: string, ...a: unknown[]) {
        if (tipo === 'webgl2' || tipo === 'webgl' || tipo === 'experimental-webgl') return null;
        return og.call(this, tipo, ...a);
      };
    });
    await abreHome(page);
    const fig = page.getByTestId('home-mapa').locator('figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-modo', 'plano', { timeout: 15_000 });
    await expect(page.getByTestId('home-vento')).toHaveAttribute('data-estatico', '1');
    await expect(fig.locator('.estatica')).toBeVisible();
    await expect(page.getByTestId('home-rotulos').locator('.rot')).not.toHaveCount(0);
    await expect(fig.locator('svg.carta path').first()).toBeAttached();
  });

  test('?webgl=0 força o mapa plano', async ({ page }) => {
    await abreHome(page, '/pt/?webgl=0');
    const fig = page.getByTestId('home-mapa').locator('figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-modo', 'plano', { timeout: 15_000 });
  });

  test.describe('prefers-reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('setas paradas em vez de partículas, sem Ken Burns', async ({ page }) => {
      await abreHome(page, '/pt/?webgl=0');
      await page.getByTestId('home-mapa').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('home-mapa').locator('figure')).toHaveAttribute('data-pronto', '1', { timeout: 20_000 });
      await expect(page.getByTestId('home-vento')).toHaveAttribute('data-estatico', '1');
      const anim = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="home-hero-foto"]')!).animationName);
      expect(anim).toBe('none');
    });
  });

  test('nunca «/100» nem números > 10 junto a rótulos de nota (PT e EN)', async ({ page }) => {
    for (const url of ['/pt/', '/en/']) {
      await abreHome(page, url);
      const v6 = page.getByTestId('home-v6');
      await expect(v6).not.toContainText('/100');
      const notas = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="home-v6"] .nota, [data-testid="home-v6"] .bloco .bar, [data-testid="home-v6"] .rot .rn')).map((e) =>
          (e.childNodes[0]?.textContent ?? '').trim(),
        ),
      );
      expect(notas.length).toBeGreaterThan(0);
      for (const n of notas) if (n !== '–') expect(Number(n), `nota «${n}»`).toBeLessThanOrEqual(10);
    }
  });

  test('EN: the same page in English («Go.», «Explore the coast map», «Today»)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fixtureMaquete(page);
    await abreHome(page, '/en/', { maquete: true });
    await expect(page.getByTestId('home-palavra')).toHaveText(/^Go\./);
    await expect(page.getByTestId('home-frase')).toContainText('kite good to very good from Guincho to Lagoa, until 19:00.');
    await expect(page.getByTestId('home-mapa').getByRole('link', { name: 'Explore the coast map' })).toHaveAttribute('href', /^\/en\/mapa\/\?sport=kitesurf/);
    await expect(page.getByTestId('home-regua')).toContainText(/Today · 14h|Today · 14:00/);
  });
});
