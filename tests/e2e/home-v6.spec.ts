import { test, expect, type Page } from '@playwright/test';
import { abreHome, caixa, fixtureMaquete, NOITE_MAQUETE } from './helpers/homeV6';

/**
 * #183 — home v6 «Atlântico» (contrato: docs/design/maquetes/v6-atlantico).
 *
 *  - 390: o primeiro ecrã mostra a palavra, a frase nacional e o nº 1; 1440: tudo acima da dobra;
 *    sem scroll horizontal a 360 e 390;
 *  - palavra e frase no HTML estático (LCP), MapLibre fora do bundle inicial;
 *  - lista única: nº 1 = melhor da régua = 1.º rótulo do mapa = foto do hero; top 3 = 3 rótulos;
 *  - régua de blocos (aria-pressed, teclado) muda palavra, frase, top 3 e fotos;
 *  - diálogo do mapa: foco no «Fechar», Esc fecha, foco volta ao «Abrir mapa», aria-expanded;
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

  test('toques ≥ 44 × 44: Kite/Surf (≥ 44 × 76), os blocos, «Abrir mapa»/«Fechar», cartões', async ({ page }) => {
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
    const abrir = page.getByRole('button', { name: 'Abrir mapa' });
    await abrir.scrollIntoViewIfNeeded();
    await medir(abrir, 'Abrir mapa');
    await abrir.click();
    await medir(page.getByRole('button', { name: 'Fechar o mapa' }), 'Fechar');
    await page.keyboard.press('Escape');
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

  test('diálogo do mapa: «Abrir mapa» → foco no «Fechar», Esc fecha e o foco volta; aria-expanded; sem scroll', async ({ page }) => {
    await abreHome(page);
    const abrir = page.getByRole('button', { name: 'Abrir mapa' });
    await abrir.scrollIntoViewIfNeeded();
    await expect(abrir).toHaveAttribute('aria-expanded', 'false');
    await abrir.click();
    const dlg = page.getByRole('dialog', { name: /Mapa interactivo/i });
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Fechar o mapa' })).toBeFocused();
    await expect(abrir).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    const r = await caixa(page, '#mapa-sec');
    expect(r!.w).toBeGreaterThanOrEqual(390 - 1);
    expect(r!.h).toBeGreaterThanOrEqual(844 - 1);
    // a régua fica visível por baixo, por cima do mapa
    await expect(page.getByTestId('home-regua')).toBeInViewport();
    await expect(dlg.getByTestId('legenda-bandas')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(abrir).toBeFocused();
    await expect(abrir).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    // «Fechar» também fecha
    await abrir.click();
    await page.getByRole('button', { name: 'Fechar o mapa' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(abrir).toBeFocused();
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
    // desktop: o mapa não tem «Abrir mapa» (está vivo ao lado)
    await expect(page.getByRole('button', { name: 'Abrir mapa' })).toBeHidden();
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
    // a foto do hero é o único fetchpriority alto da página
    expect(html.match(/fetchpriority="high"/gi) ?? []).toHaveLength(1);
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
        // @ts-expect-error — repõe a original
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

  test('EN: the same page in English («Go.», «Open map», «Today»)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fixtureMaquete(page);
    await abreHome(page, '/en/', { maquete: true });
    await expect(page.getByTestId('home-palavra')).toHaveText(/^Go\./);
    await expect(page.getByTestId('home-frase')).toContainText('kite good to very good from Guincho to Lagoa, until 19:00.');
    await expect(page.getByRole('button', { name: 'Open map' })).toBeAttached();
    await expect(page.getByTestId('home-regua')).toContainText(/Today · 14h|Today · 14:00/);
  });
});
