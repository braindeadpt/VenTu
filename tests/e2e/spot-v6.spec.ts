import { test, expect, type Page } from '@playwright/test';

/**
 * #184 — página de spot v6 «Atlântico» (contrato: docs/design/maquetes/v6-atlantico).
 *
 *  - 390: o primeiro ecrã mostra nome, nota, palavra da banda, frase e a régua inteira;
 *    sem scroll horizontal a 360 e 390;
 *  - «a mesma hora dá o mesmo número»: veredicto, régua, Porquê, cor do mar, chip do
 *    vento e tabela lêem o mesmo objecto da hora;
 *  - nunca «/100» nem números > 10 junto a rótulos de nota;
 *  - régua `role="slider"` por teclado; toques ≥ 44 × 44 px;
 *  - `ventu.modalidade` no formato {d, v}, nos dois sentidos com a home;
 *  - WebGL2 obrigatório para o 3D (fallback plano) e prefers-reduced-motion;
 *  - MapLibre fora do bundle inicial; fotos com crédito.
 */

const URL_G = '/pt/spots/guincho/';

async function abre(page: Page, url = URL_G, nome: RegExp = /Guincho/i) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible({ timeout: 20_000 });
  await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
  await expect(page.getByTestId('spot-v6')).toBeVisible();
}

/** O que cada superfície mostra para a hora escolhida. */
async function leituraDaHora(page: Page) {
  return page.evaluate(() => {
    const raiz = document.querySelector('[data-testid="spot-v6"]') as HTMLElement;
    const nota = raiz.querySelector('[data-testid="spot-veredicto"] .nota') as HTMLElement;
    const slider = raiz.querySelector('[role="slider"]') as HTMLElement;
    const i = Number(slider.getAttribute('aria-valuenow'));
    const barra = raiz.querySelectorAll('.faixa i')[i] as HTMLElement;
    const linha = raiz.querySelector(`#estudo tr[data-hora="${i}"]`) as HTMLElement;
    const ventoPorque = raiz.querySelector('[data-fator="vento"] .val')?.firstChild?.textContent?.trim();
    const chip = raiz.querySelector('[data-testid="vento-chip"]')?.textContent ?? '';
    return {
      i,
      hora: raiz.dataset.hora,
      notaHero: nota.dataset.nota ?? 'noite',
      bandaHero: nota.dataset.banda,
      bandaRegua: barra?.dataset.banda,
      valueText: slider.getAttribute('aria-valuetext') ?? '',
      notaTabela: linha?.querySelector('td.n')?.textContent?.trim(),
      linhaSel: linha?.classList.contains('sel'),
      ventoTabela: linha?.querySelectorAll('td')[2]?.textContent?.trim(),
      ventoPorque,
      chip,
      bandaMar: (raiz.querySelector('[data-testid="praia-3d"] figure') as HTMLElement)?.dataset.banda,
    };
  });
}

test.describe('#184 spot v6 — 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('primeiro ecrã: nome, nota, palavra, frase e régua inteira', async ({ page }) => {
    await abre(page);
    const r = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)?.getBoundingClientRect();
      return {
        h1: box('#spot-n'),
        nota: box('[data-testid="spot-veredicto"] .nota'),
        pal: box('[data-testid="spot-veredicto"] .pal'),
        l1: box('[data-testid="spot-veredicto"] .l1'),
        regua: box('[data-testid="regua-48h"]'),
        vh: window.innerHeight,
      };
    });
    for (const k of ['h1', 'nota', 'pal', 'l1'] as const) {
      expect(r[k], k).toBeTruthy();
      expect(r[k]!.top, k).toBeGreaterThanOrEqual(0);
      expect(r[k]!.bottom, k).toBeLessThanOrEqual(r.regua!.top + 1);
    }
    expect(r.regua!.top).toBeGreaterThan(0);
    expect(r.regua!.bottom).toBeLessThanOrEqual(r.vh + 1);
  });

  for (const w of [360, 390]) {
    test(`sem scroll horizontal a ${w} px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 });
      await abre(page);
      await page.locator('#estudo summary').click();
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw).toBeLessThanOrEqual(w);
    });
  }

  test('toques ≥ 44 × 44: voltar, Kite/Surf (≥ 44 × 76), setas da régua, resumo «Estudar o spot»', async ({ page }) => {
    await abre(page);
    const caixas = await page.evaluate(() => {
      const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
      const raiz = document.querySelector('[data-testid="spot-v6"]')!;
      return {
        voltar: r(raiz.querySelector('.voltar')),
        modos: [...raiz.querySelectorAll('[data-testid="modalidade-toggle"] button')].map((b) => r(b)),
        setas: [...raiz.querySelectorAll('.r-cab button')].map((b) => r(b)),
        resumo: r(raiz.querySelector('#estudo summary')),
      };
    });
    const ok = (b: DOMRect | null, w = 44, h = 44) => {
      expect(b).toBeTruthy();
      expect(Math.round(b!.width)).toBeGreaterThanOrEqual(w);
      expect(Math.round(b!.height)).toBeGreaterThanOrEqual(h);
    };
    ok(caixas.voltar);
    expect(caixas.modos).toHaveLength(2);
    caixas.modos.forEach((b) => ok(b, 76, 44));
    expect(caixas.setas).toHaveLength(2);
    caixas.setas.forEach((b) => ok(b));
    ok(caixas.resumo);
  });
});

test.describe('#184 spot v6 — a mesma hora dá o mesmo número', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('veredicto, régua, Porquê, mar, chip do vento e tabela recebem o mesmo objecto da hora', async ({ page }) => {
    await abre(page);
    const slider = page.getByRole('slider');
    await slider.focus();
    for (const passos of [0, 3, 9, 14]) {
      for (let k = 0; k < passos; k++) await page.keyboard.press('ArrowRight');
      const x = await leituraDaHora(page);
      expect(x.linhaSel).toBe(true);
      // nota: herói = tabela = régua (texto e cor)
      const nTab = x.notaTabela === '–' ? 'noite' : x.notaTabela;
      expect(nTab).toBe(x.notaHero);
      expect(x.bandaRegua).toBe(x.bandaHero);
      expect(x.bandaMar).toBe(x.bandaHero);
      if (x.notaHero !== 'noite') expect(x.valueText).toContain(`${x.notaHero} em 10`);
      // vento: Porquê = tabela = chip da cena
      expect(x.ventoPorque).toBe(x.ventoTabela);
      expect(x.chip).toContain(` ${x.ventoPorque} nós`);
    }
  });

  test('régua por teclado: ← → ±1 h, End/Home aos limites', async ({ page }) => {
    await abre(page);
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', String(Number(await slider.getAttribute('aria-valuemax'))));
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByTestId('regua-hora')).toContainText('Agora');
  });

  test('nunca «/100» nem números > 10 junto a rótulos de nota (PT e EN)', async ({ page }) => {
    for (const url of [URL_G, '/en/spots/guincho/']) {
      await abre(page, url);
      await page.locator('#estudo summary').click();
      const txt = await page.getByTestId('spot-v6').innerText();
      expect(txt).not.toMatch(/\/\s*100/);
      const notas = await page.locator('[data-testid="spot-v6"] .nota[data-nota], #estudo td.n').allInnerTexts();
      for (const n of notas) {
        const v = Number(n.replace('/10', '').trim());
        if (Number.isFinite(v)) expect(v).toBeLessThanOrEqual(10);
      }
    }
  });
});

test.describe('#184 spot v6 — ventu.modalidade {d, v}', () => {
  test('Kite/Surf grava {d, v}, sobrevive ao reload e ?d= tem prioridade', async ({ page }) => {
    await abre(page);
    const grupo = page.getByRole('group', { name: 'Modalidade', exact: true });
    await grupo.getByRole('button', { name: 'Surf' }).click();
    await expect(grupo.getByRole('button', { name: 'Surf' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ventu.modalidade')))!)).toEqual({ d: 'surf', v: {} });
    await page.reload();
    await expect(page.getByTestId('spot-v6')).toHaveAttribute('data-modalidade', 'surf');
    await page.goto(`${URL_G}?d=kite`);
    await expect(page.getByTestId('spot-v6')).toHaveAttribute('data-modalidade', 'kite');
  });

  test('lê a string antiga da maquete e migra-a', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ventu.modalidade', 'surf'));
    await abre(page);
    await expect(page.getByTestId('spot-v6')).toHaveAttribute('data-modalidade', 'surf');
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ventu.modalidade')))!)).toEqual({ d: 'surf', v: {} });
  });

  test('home → spot: Surf nos pills da home abre o spot em Surf', async ({ page }) => {
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await hero.getByRole('button', { name: 'Surf', exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ventu.modalidade'))).toBe('{"d":"surf","v":{}}');
    await abre(page);
    await expect(page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Surf' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('spot → home: Kite no spot fica escolhido na home', async ({ page }) => {
    await abre(page, `${URL_G}?d=surf`);
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Kite' }).click();
    await page.goto('/pt/');
    const hero = page.getByRole('region', { name: /Mapa interactivo/i });
    await expect(hero.getByRole('button', { name: 'Kitesurf', exact: true })).toHaveAttribute('aria-pressed', 'true', {
      timeout: 15_000,
    });
  });
});

test.describe('#184 spot v6 — praia em 3D', () => {
  test('MapLibre fora do bundle inicial (nenhum script do HTML o traz)', async ({ page, request }) => {
    const html = await (await request.get(URL_G)).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const s of srcs) {
      const js = await (await request.get(s)).text();
      expect(js, s).not.toContain('maplibregl');
      expect(js, s).not.toContain('MapLibre GL JS');
    }
    await abre(page);
    await expect(page.locator('[data-testid="praia-3d"] figure')).toHaveAttribute('data-modo', 'poster');
  });

  test('sem WebGL2: fallback plano estático com setas, rótulo e legenda', async ({ page }) => {
    await page.addInitScript(() => {
      // substituição de teste: sem contextos WebGL
      const proto = HTMLCanvasElement.prototype as unknown as { getContext: (tipo: string, ...r: unknown[]) => unknown };
      const orig = proto.getContext;
      proto.getContext = function (this: HTMLCanvasElement, tipo: string, ...r: unknown[]) {
        if (tipo === 'webgl2' || tipo === 'webgl' || tipo === 'experimental-webgl') return null;
        return orig.call(this, tipo, ...r);
      };
    });
    await abre(page);
    const fig = page.locator('[data-testid="praia-3d"] figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-modo', 'plano', { timeout: 15_000 });
    await expect(fig.locator('.estatica')).toBeVisible();
    await expect(page.getByTestId('legenda-bandas')).toBeVisible();
    await expect(page.getByTestId('vento-chip')).toBeVisible();
  });

  test('?webgl=0 força a vista plana', async ({ page }) => {
    await abre(page, `${URL_G}?webgl=0`);
    const fig = page.locator('[data-testid="praia-3d"] figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute('data-modo', 'plano', { timeout: 15_000 });
  });
});

test.describe('#184 spot v6 — prefers-reduced-motion', () => {
  test('sem Ken Burns, sem transição da agulha, mudar de hora troca o estado directo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abre(page);
    const est = await page.evaluate(() => ({
      kb: getComputedStyle(document.querySelector('[data-testid="spot-hero-foto"] img') ?? document.body).animationName,
      agulha: getComputedStyle(document.querySelector('.agulha')!).transitionDuration,
      pista: getComputedStyle(document.querySelector('.modo .pista')!).transitionDuration,
    }));
    expect(est.kb).toBe('none');
    // 0s, ou os 0,01 ms da guarda global de reduced-motion (globals.css).
    const seg = (v: string) => parseFloat(v) * (v.endsWith('ms') ? 0.001 : 1);
    expect(seg(est.agulha)).toBeLessThanOrEqual(0.00001);
    expect(seg(est.pista)).toBeLessThanOrEqual(0.00001);
    await page.getByRole('slider').focus();
    await page.keyboard.press('ArrowRight');
    // Nada com duração real (a guarda global reduz tudo a 0,01 ms); as de
    // 0,01 ms esvaziam no frame seguinte, também em software GL.
    const reais = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.getComputedTiming();
        return a.playState === 'running' && Number(t?.duration ?? 0) + Number(t?.delay ?? 0) > 0.01;
      }).length,
    );
    expect(reais).toBe(0);
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), { timeout: 2_000 })
      .toBe(0);
  });
});

test.describe('#184 spot v6 — fotos', () => {
  test('a foto do hero tem crédito visível com ligações; o kite do Guincho é CC BY-SA 3.0', async ({ page }) => {
    await abre(page, `${URL_G}?d=kite`);
    const cred = page.locator('[data-testid="spot-v6"] .hero [data-testid="foto-credito"]');
    await expect(cred).toBeVisible();
    await expect(cred).toContainText('Alvesgaspar');
    await expect(cred).toContainText('CC BY-SA 3.0');
    await expect(cred.getByRole('link')).toHaveCount(2);
    await page.getByRole('group', { name: 'Modalidade', exact: true }).getByRole('button', { name: 'Surf' }).click();
    await expect(cred).toContainText('Unsplash');
    await expect(cred.getByRole('link').last()).toHaveAttribute('href', /utm_source=ventu&utm_medium=referral/);
    await expect(page.locator('[data-testid="spot-hero-foto"] img')).toHaveAttribute('fetchpriority', 'high');
  });

  test('substitutas dizem o sítio real', async ({ page }) => {
    await abre(page, '/pt/spots/costa-caparica/?d=kite', /Caparica/i);
    const cred = page.locator('.hero [data-testid="foto-credito"]');
    await expect(cred).toHaveAttribute('data-estado', 'sub');
    await expect(cred).toContainText('Sines');
  });
});

/** Colunas da grelha do «O que se mede»: cartões por coluna (x), fundo de cada coluna e maior intervalo vertical. */
async function colunasMedeSabe(page: Page) {
  return page.evaluate(() => {
    const g = document.querySelector('[data-testid="spot-mede-sabe-grelha"]') as HTMLElement;
    const G = g.getBoundingClientRect();
    const cols = new Map<number, { top: number; bottom: number }[]>();
    for (const c of Array.from(g.children) as HTMLElement[]) {
      const r = c.getBoundingClientRect();
      if (!r.height) continue;
      const x = Math.round(r.left);
      cols.set(x, [...(cols.get(x) ?? []), { top: r.top - G.top, bottom: r.bottom - G.top }]);
    }
    return [...cols.values()].map((cs) => {
      cs.sort((a, b) => a.top - b.top);
      let maiorIntervalo = cs[0].top;
      for (let i = 1; i < cs.length; i++) maiorIntervalo = Math.max(maiorIntervalo, cs[i].top - cs[i - 1].bottom);
      return { n: cs.length, fundo: cs[cs.length - 1].bottom, maiorIntervalo };
    });
  });
}

test.describe('#184 spot v6 — «O que se mede» sem buracos', () => {
  // Pedido do Pedro (2026-10-15): a 1440 ficavam ~170 px vazios debaixo de «Sol e ar».
  // As colunas acabam todas à mesma altura e nenhum intervalo passa o gap da grelha,
  // seja qual for o conteúdo (aqui também sem clima nem isóbatas = menos cartões).
  for (const { w, cols } of [
    { w: 1440, cols: 3 },
    { w: 1024, cols: 2 },
    { w: 800, cols: 2 },
  ]) {
    for (const menos of [false, true]) {
      test(`${w} px, ${cols} colunas${menos ? ', sem clima nem isóbatas' : ''}: colunas à mesma altura`, async ({ page }) => {
        if (menos) {
          await page.route('**/data/climatology.json', (r) => r.fulfill({ status: 404, body: '' }));
          await page.route('**/data/spot-isobaths.json', (r) => r.fulfill({ status: 404, body: '' }));
        }
        await page.setViewportSize({ width: w, height: 900 });
        await abre(page, `${URL_G}?d=kite&estudo=1`);
        const grelha = page.getByTestId('spot-mede-sabe-grelha');
        // a grelha pode ser substituída na hidratação: o scroll vai pelo DOM do momento
        await expect(grelha).toBeAttached({ timeout: 15_000 });
        await page.evaluate(() => document.querySelector('[data-testid="spot-mede-sabe-grelha"]')?.scrollIntoView({ block: 'center' }));
        await expect(grelha).toHaveAttribute('data-mas', /^[23]$/, { timeout: 15_000 });
        // dá tempo aos cartões assíncronos (boia, clima, fundo) e à redistribuição
        // os cartões chegam em momentos diferentes (boia, clima, fundo): espera pelo estado estável
        const ok = (cs: Awaited<ReturnType<typeof colunasMedeSabe>>) =>
          cs.length === Math.min(cols, cs.reduce((s, c) => s + c.n, 0)) &&
          Math.max(...cs.map((c) => c.fundo)) - Math.min(...cs.map((c) => c.fundo)) <= 2 &&
          cs.every((c) => c.maiorIntervalo <= 14);
        await expect.poll(async () => ok(await colunasMedeSabe(page)), { timeout: 20_000 }).toBe(true);
        const cs = await colunasMedeSabe(page);
        expect(cs.length, JSON.stringify(cs)).toBe(Math.min(cols, cs.reduce((s, c) => s + c.n, 0)));
        for (const c of cs) expect(c.maiorIntervalo, JSON.stringify(cs)).toBeLessThanOrEqual(14);
        // Dentro de cada cartão (também no esticado), nada fica afastado do anterior mais do que o
        // intervalo do cartão: a linha da fonte vem logo a seguir ao conteúdo, a folga fica no fim.
        const buracos = await page.evaluate(() => {
          const g = document.querySelector('[data-testid="spot-mede-sabe-grelha"]') as HTMLElement;
          const out: string[] = [];
          for (const c of Array.from(g.children) as HTMLElement[]) {
            const cs = getComputedStyle(c);
            if (cs.gridTemplateColumns.trim().split(/\s+/).length > 1) continue;
            const gap = parseFloat(cs.rowGap || '0') || 0;
            const fs = (Array.from(c.children) as HTMLElement[]).filter((f) => f.getClientRects().length > 0);
            for (let i = 1; i < fs.length; i++) {
              const d = fs[i].getBoundingClientRect().top - fs[i - 1].getBoundingClientRect().bottom;
              if (d > gap + 6) out.push(`${c.dataset.ec ?? c.className}: ${Math.round(d)}px antes de ${fs[i].className}`);
            }
          }
          return out;
        });
        expect(buracos).toEqual([]);
      });
    }
  }
});

test.describe('#184 spot v6 — 390: fim da página', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sem buraco entre as acções e o rodapé; a régua fixa não tapa o conteúdo do rodapé', async ({ page }) => {
    await abre(page, `${URL_G}?d=kite`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const m = await page.evaluate(() => {
      // fim do último conteúdo da v6: as acções ou, se houver, a nota «faltam dados» logo abaixo
      const v6 = document.querySelector('[data-testid="spot-v6"]') as HTMLElement;
      const ultimos = (Array.from(v6.children) as HTMLElement[]).filter((e) => !e.classList.contains('regua') && e.getBoundingClientRect().height > 0);
      const acoes = ultimos[ultimos.length - 1].getBoundingClientRect();
      const footer = document.querySelector('[data-site-footer]') as HTMLElement;
      const fr = footer.getBoundingClientRect();
      const regua = document.querySelector('[data-testid="spot-v6"] .regua')!.getBoundingClientRect();
      // fundo do último conteúdo do rodapé (sem o padding)
      // (só o que se vê: fora os itens dos acordeões fechados, cortados por um antepassado com overflow)
      const visivel = (e: Element) => {
        const r = e.getBoundingClientRect();
        if (!r.height || !r.width || !(e as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true, checkOpacity: true })) return false;
        for (let a = e.parentElement; a && a !== footer.parentElement; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflow !== 'visible' || cs.overflowY !== 'visible') {
            const ar = a.getBoundingClientRect();
            if (r.top >= ar.bottom - 1 || r.bottom <= ar.top + 1) return false;
          }
        }
        return true;
      };
      const conteudo = Math.max(...Array.from(footer.querySelectorAll('a, p, span, button')).filter(visivel).map((e) => e.getBoundingClientRect().bottom));
      return { vazio: fr.top - acoes.bottom, conteudo, reguaTopo: regua.top, fimRodape: fr.bottom, alturaJanela: innerHeight };
    });
    expect(m.vazio, JSON.stringify(m)).toBeLessThanOrEqual(64);
    expect(m.conteudo, JSON.stringify(m)).toBeLessThanOrEqual(m.reguaTopo + 1);
    expect(Math.abs(m.fimRodape - m.alturaJanela), JSON.stringify(m)).toBeLessThanOrEqual(2);
  });
});
