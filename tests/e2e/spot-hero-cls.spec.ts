import { test, expect, type Page } from '@playwright/test';

/**
 * SP-A §1 — o hero (#agora) tem caixa reservada: altura constante e nada
 * cortado a 320, 390 e 1350 px.
 *
 * O bug (auditoria de 25 set, 26ª regra: «o bloco cresce 20 px ~2 s depois do
 * load»): a grelha do hero era `grid-cols-[minmax(0,1fr)_auto]` — a coluna do
 * NOME era o resto, não uma medida, e a coluna do SCORE era `auto`, logo a sua
 * largura era a do NÚMERO do score (153,2 px com 2 dígitos, 188,4 px com 3,
 * 112 px com 1). Como o score passa do valor baked para o valor vivo com
 * correcção observada depois de hidratar (count-up de 320 ms), um dígito a mais
 * encolhia a coluna do nome o suficiente para a linha hora+pill mudar de linha:
 * medido a 390 px, `hourLineH` 21,4 → 40,8 px e o hero 343,1 → 362,5 px (a linha
 * porquê desaparecer nas horas de previsão compensava ~19 px, o que mascarava o
 * defeito ao arrastar a régua e o tornava intermitente entre builds/dias).
 * A 320 px o nome ficava com 118,8 px e o par região+coordenadas (189,3 px) e o
 * H1 «Guincho» (182 px) apareciam cortados — falha do `spot-v3-verdict`.
 *
 * Correção: abaixo de `sm` o score passa para a linha de baixo (spec v3 §1,
 * «nome e score na mesma linha SE COUBER, senão o score por baixo»), o número
 * do score tem caixa reservada para 3 dígitos (o count-up deixa de
 * redimensionar a coluna do score — medido a 390 px: 25 → 100 movia a caixa da
 * coluna 35 px, CLS 0,002) e a linha porquê fica sempre na caixa (invisível
 * fora do «agora»). A largura do nome deixa de depender de conteúdo.
 *
 * As provas aqui são de layout, não de data: o score é reescrito no DOM
 * (1 e 3 dígitos) para exercitar o pior caso sem depender dos dados do dia, e
 * cada asserção tem um controlo que a tem de fazer falhar quando o mecanismo
 * antigo é reposto.
 */

const SPOT_URL = '/pt/spots/guincho/';

const VIEWPORTS = [
  { name: '320', width: 320, height: 844 },
  { name: '390', width: 390, height: 844 },
  { name: '1350', width: 1350, height: 900 },
] as const;

interface HeroClsRecord {
  t: number;
  value: number;
  insideHero: boolean;
  source: string;
}

/**
 * Observador de `layout-shift` desde o primeiro frame (buffered), com
 * atribuição: cada entrada diz se a caixa que se moveu está DENTRO do hero.
 * Uma entrada com `insideHero` é o hero a empurrar o resto da página.
 */
const CLS_PROBE = () => {
  const w = window as unknown as { __heroCls?: HeroClsRecord[] };
  w.__heroCls = [];
  const heroOf = () => document.querySelector('#agora');
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as (PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources?: { node: Node | null }[];
    })[]) {
      if (e.hadRecentInput) continue;
      const hero = heroOf();
      const sources = e.sources ?? [];
      w.__heroCls!.push({
        t: Math.round(e.startTime),
        value: e.value,
        insideHero: sources.some(
          (s) => !!s.node && s.node.nodeType === 1 && !!hero && hero.contains(s.node),
        ),
        source: sources
          .map((s) => (s.node as Element | null)?.tagName ?? '?')
          .join(','),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

interface HeroSample {
  t: number;
  h: number;
  top: number;
}

/**
 * Amostrador barato (setInterval 50 ms, sem forçar layout a cada frame) que
 * regista cada MUDANÇA de caixa do hero, do primeiro frame até ao fim do load.
 * Só conta a partir do momento em que o hero tem caixa (antes disso é o
 * boundary do RSC a ser resolvido).
 */
const GEOM_WATCH = () => {
  const w = window as unknown as { __heroGeom?: HeroSample[] };
  w.__heroGeom = [];
  const t0 = performance.now();
  const iv = window.setInterval(() => {
    const hero = document.querySelector('#agora');
    if (!hero) return;
    const r = hero.getBoundingClientRect();
    if (r.height <= 0) return;
    const s: HeroSample = {
      t: Math.round(performance.now() - t0),
      h: Math.round(r.height * 10) / 10,
      top: Math.round(r.top * 10) / 10,
    };
    const prev = w.__heroGeom![w.__heroGeom!.length - 1];
    if (!prev || prev.h !== s.h || prev.top !== s.top) w.__heroGeom!.push(s);
    if (performance.now() - t0 > 15_000) window.clearInterval(iv);
  }, 50);
};

interface HeroGeom {
  heroH: number;
  heroTop: number;
  nameW: number;
  nameH: number;
  hourLineH: number;
  score: string;
  clips: string[];
}

/**
 * Uma medição só, síncrona: com `scoreText` (pior caso de largura — p.ex.
 * «100») escreve primeiro no meter e devolve as caixas já relayoutadas. Tudo
 * na mesma avaliação, para nenhum re-render do React poder repor o valor a
 * meio. `null` = medir o que está.
 */
const measureHero = (scoreText: string | null): HeroGeom => {
  const hero = document.querySelector('#agora') as HTMLElement;
  const grid = hero.querySelector('div.grid') as HTMLElement;
  const nameCol = grid.children[0] as HTMLElement;
  const hourLine = nameCol.children[2] as HTMLElement;
  const meter = hero.querySelector('[role="meter"]') as HTMLElement | null;
  if (scoreText !== null && meter) meter.textContent = scoreText;
  const clips = Array.from(hero.querySelectorAll('h1, p'))
    .filter((el) => !el.classList.contains('truncate'))
    .filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1)
    .map((el) => `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 34)}`);
  const hr = hero.getBoundingClientRect();
  const nr = nameCol.getBoundingClientRect();
  return {
    heroH: Math.round(hr.height * 10) / 10,
    heroTop: Math.round(hr.top * 10) / 10,
    nameW: Math.round(nr.width * 10) / 10,
    nameH: Math.round(nr.height * 10) / 10,
    hourLineH: Math.round(hourLine.getBoundingClientRect().height * 10) / 10,
    score: meter?.textContent ?? '',
    clips,
  };
};

async function openSpot(page: Page): Promise<void> {
  await page.goto(`${SPOT_URL}`);
  await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
    timeout: 40_000,
  });
  await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
  await page.waitForTimeout(1_500);
}

/** CPU 4× — alarga a janela insert→assentar (a mesma taxa da auditoria). */
async function throttleCpu(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

for (const vp of VIEWPORTS) {
  test.describe(`SP-A §1 hero @ ${vp.name}px`, () => {
    test.use({
      serviceWorkers: 'block',
      viewport: { width: vp.width, height: vp.height },
    });

    test('altura reservada: o hero não cresce durante o load (CLS)', async ({ page }) => {
      test.setTimeout(120_000);
      await throttleCpu(page, 4);
      await page.addInitScript(CLS_PROBE);
      await page.addInitScript(GEOM_WATCH);

      await openSpot(page);

      // ── 1. Do primeiro frame com caixa até assentar, a altura e o topo
      //    do hero são constantes. Era aqui que os 20 px apareciam.
      const samples = await page.evaluate(
        () => (window as unknown as { __heroGeom: HeroSample[] }).__heroGeom,
      );
      expect(samples.length).toBeGreaterThan(0);
      const heights = samples.map((s) => s.h);
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(
        spread,
        `alturas do hero durante o load: ${JSON.stringify(samples)}`,
      ).toBeLessThanOrEqual(1);
      // Topo fixo: nada acima do hero (faixa de segurança, header) cresce.
      expect(new Set(samples.map((s) => s.top)).size).toBe(1);
      // E o hero medido no fim bate com a primeira medição.
      const settled = await page.evaluate(measureHero, null);
      expect(Math.abs(settled.heroH - heights[heights.length - 1])).toBeLessThanOrEqual(1);

      // ── 2. Nenhum layout-shift atribuído a uma caixa dentro do hero.
      const shifts = await page.evaluate(
        () => (window as unknown as { __heroCls: HeroClsRecord[] }).__heroCls,
      );
      const heroShifts = shifts.filter((s) => s.insideHero && s.value > 0.001);
      expect(heroShifts, JSON.stringify(heroShifts, null, 1)).toEqual([]);

      // ── 3. Controlo: o observador TEM de ver um shift do hero. Empurrar o
      //    hero 40 px para baixo (ou 40 px de conteúdo) é exactamente o que a
      //    regressão fazia — sem esta prova, o passo 2 podia passar por o
      //    observador estar cego.
      await page.evaluate(() => {
        const hero = document.querySelector('#agora') as HTMLElement;
        hero.style.paddingTop = '40px';
      });
      await page.waitForTimeout(300);
      const after = await page.evaluate(
        () => (window as unknown as { __heroCls: HeroClsRecord[] }).__heroCls,
      );
      expect(after.filter((s) => s.insideHero && s.value > 0.001).length).toBeGreaterThan(0);
    });

    test('caixa reservada: nada cortado e a largura do nome não depende do score', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(SPOT_URL);
      await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
      await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
        timeout: 40_000,
      });
      await page.waitForTimeout(1_500);

      const base = await page.evaluate(measureHero, null);

      // A auditoria de 25 set falhava aqui: «H1: Guincho» e
      // «P: Cascais · 38,73° N · 9,47° O» cortados a 320 px.
      expect(base.clips, JSON.stringify(base, null, 1)).toEqual([]);

      // Pior caso de largura do score (3 dígitos) e melhor (1 dígito): a
      // grelha do hero não pode reagir. É este o mecanismo do CLS.
      const wide = await page.evaluate(measureHero, '100');
      const narrow = await page.evaluate(measureHero, '8');
      expect(wide.score).toBe('100');
      expect(Math.abs(wide.heroH - base.heroH)).toBeLessThanOrEqual(1);
      expect(Math.abs(narrow.heroH - base.heroH)).toBeLessThanOrEqual(1);
      expect(Math.abs(wide.nameW - base.nameW)).toBeLessThanOrEqual(1);
      expect(Math.abs(narrow.nameW - base.nameW)).toBeLessThanOrEqual(1);
      // A linha hora+pill não ganha uma linha com o score maior.
      expect(Math.abs(wide.hourLineH - base.hourLineH)).toBeLessThanOrEqual(1);

      // ── Controlo do acima, só onde a grelha antiga era `1fr | auto`
      //    (<lg): repor essa regra E tirar a reserva do número faz a largura
      //    do nome depender do score — se não fizer, a asserção acima não
      //    está a medir nada. São as duas metades do defeito original (grelha
      //    que alimenta a coluna do nome + número que redimensiona a coluna
      //    do score); só a primeira já não chega porque a reserva fixa a
      //    caixa do número.
      if (vp.width < 1024) {
        await page.addStyleTag({
          content:
            '#agora div.grid{grid-template-columns:minmax(0,1fr) auto !important;column-gap:1rem !important;row-gap:0 !important}' +
            '#agora [role="meter"]{min-width:0 !important;text-align:left !important}',
        });
        const forcedWide = await page.evaluate(measureHero, '100');
        const forcedNarrow = await page.evaluate(measureHero, '8');
        expect(forcedWide.score).toBe('100');
        expect(forcedNarrow.score).toBe('8');
        expect(
          Math.abs(forcedWide.nameW - forcedNarrow.nameW),
          `grelha antiga não reagiu ao score: ${JSON.stringify([forcedWide.nameW, forcedNarrow.nameW])}`,
        ).toBeGreaterThan(5);
      }
    });
  });
}

/**
 * Correcção HERO-390 (2.ª volta): abaixo de sm a linha de proveniência é
 * só a decisão — confiança + frescura + link «Como sabemos» — porque a
 * linha completa truncava exactamente esses dois dados (medido pela
 * auditoria: scrollWidth 563 vs clientWidth 246 a 390 px em guincho).
 * Nem a versão pedida com o rótulo completo cabe: «confiança baixa ·
 * actualizado há 45 min · Comment nous le savons →» mede 391 px em FR
 * contra 288 px úteis a 320 px — por isso o link é ícone-só em <sm
 * (aria-label completo, como os fantasmas) e as fontes ficam a ≥sm,
 * onde truncam entre si mas nunca a decisão.
 *
 * Prova: scrollWidth ≤ clientWidth e uma só linha, a 320/360/390 px,
 * nas 5 línguas, com correcção observada (guincho: boia + estação) e sem
 * (matosinhos: modelo). A 768 px as fontes voltam a ver-se e a decisão
 * continua inteira dentro da linha.
 */
const PROV_LOCALES = ['pt', 'en', 'es', 'de', 'fr'] as const;
const PROV_SPOTS = [
  { slug: 'guincho', note: 'com correcção' },
  { slug: 'matosinhos', note: 'sem correcção' },
] as const;
/** Frescura mais comprida por língua — «…45 min» (idade <1 h). */
const WORST_AGE: Record<(typeof PROV_LOCALES)[number], string> = {
  pt: 'actualizado há 45 min',
  en: 'updated 45m ago',
  es: 'actualizado hace 45 min',
  de: 'aktualisiert vor 45 min',
  fr: 'actualisé il y a 45 min',
};

interface ProvMeasure {
  sw: number;
  cw: number;
  h: number;
  text: string;
  srcDisplay: string | null;
  linkAria: string | null;
  linkIcon: boolean;
  linkTextVisible: boolean;
  overflowers: string[];
}

const measureProvenance = (): ProvMeasure | null => {
  const link = document.querySelector('#agora a[href="#como-sabemos"]') as HTMLElement | null;
  const p = link?.closest('p') as HTMLElement | null;
  if (!link || !p) return null;
  const src = p.querySelector('[data-provenance-sources]') as HTMLElement | null;
  const labelSpan = link.querySelector('span') as HTMLElement | null;
  const pr = p.getBoundingClientRect();
  const overflowers = Array.from(p.children)
    .filter((c) => c !== src)
    .filter((c) => {
      const r = (c as HTMLElement).getBoundingClientRect();
      return r.width > 1 && r.right > pr.right + 1;
    })
    .map((c) => (c.textContent ?? '').slice(0, 30));
  return {
    sw: p.scrollWidth,
    cw: p.clientWidth,
    h: Math.round(pr.height * 10) / 10,
    text: (p.textContent ?? '').trim(),
    srcDisplay: src ? getComputedStyle(src).display : null,
    linkAria: link.getAttribute('aria-label'),
    linkIcon: !!link.querySelector('svg'),
    linkTextVisible: labelSpan ? getComputedStyle(labelSpan).display !== 'none' : false,
    overflowers,
  };
};

test.describe('SP-A §1 proveniência: decisão nunca cortada (5 línguas)', () => {
  for (const locale of PROV_LOCALES) {
    test(`${locale}: confiança+frescura+link cabem numa linha 320/360/390`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const spot of PROV_SPOTS) {
        await page.goto(`/${locale}/spots/${spot.slug}/`);
        await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
        for (const width of [320, 360, 390]) {
          await page.setViewportSize({ width, height: 844 });
          const m = await page.evaluate(measureProvenance);
          expect(m, `${locale}/${spot.slug} (${spot.note}) @${width}: sem linha`).not.toBeNull();
          if (!m) continue;
          const ctx = `${locale}/${spot.slug} @${width} → "${m.text}"`;
          expect(m.sw, `${ctx} sw=${m.sw} cw=${m.cw}`).toBeLessThanOrEqual(m.cw + 1);
          expect(m.h, `${ctx} — mais de uma linha`).toBeLessThanOrEqual(20);
          // Fontes escondidas em <sm; a decisão fica no texto.
          expect(m.srcDisplay, ctx).toBe('none');
          expect(m.text, ctx).toMatch(/confian|confidence|Konfidenz|confiance/i);
          expect(m.text, ctx).toMatch(/há |ago|hace|vor |il y a|actualiz|updated|aktualis/i);
          // Link presente e nomeado; em <sm é só o ícone.
          expect(m.linkAria, ctx).toBeTruthy();
          expect(m.linkIcon, ctx).toBe(true);
          expect(m.linkTextVisible, ctx).toBe(false);
          expect(m.overflowers, ctx).toEqual([]);
        }
        // Pior caso de frescura («…45 min» é o formato mais comprido) a
        // 320 px — o estado real do dia pode ser «há 1d», mais curto.
        await page.setViewportSize({ width: 320, height: 844 });
        const worst = await page.evaluate((ageText) => {
          const age = document.querySelector('#agora [data-prov="age"]') as HTMLElement | null;
          if (age) age.textContent = ageText;
          const link = document.querySelector('#agora a[href="#como-sabemos"]');
          const p = link?.closest('p') as HTMLElement;
          return { sw: p.scrollWidth, cw: p.clientWidth };
        }, WORST_AGE[locale]);
        expect(
          worst.sw,
          `${locale}/${spot.slug} @320 pior caso «${WORST_AGE[locale]}» → sw=${worst.sw} cw=${worst.cw}`,
        ).toBeLessThanOrEqual(worst.cw + 1);

        // ≥sm: as fontes reaparecem e podem truncar ENTRE SI — a decisão
        // e o link (já com rótulo) ficam sempre inteiros dentro da linha.
        await page.setViewportSize({ width: 768, height: 900 });
        const m = await page.evaluate(measureProvenance);
        expect(m).not.toBeNull();
        if (!m) continue;
        const ctx = `${locale}/${spot.slug} @768 → "${m.text}"`;
        expect(m.srcDisplay, ctx).not.toBe('none');
        expect(m.linkTextVisible, ctx).toBe(true);
        expect(m.sw, `${ctx} sw=${m.sw} cw=${m.cw}`).toBeLessThanOrEqual(m.cw + 1);
        expect(m.overflowers, ctx).toEqual([]);
      }
    });
  }
});

/**
 * Nível do dia em <sm: a pill sai da linha do porquê (que a cortava —
 * «ondas 2,0 m · perío…») para a linha do score, alinhada à esquerda na
 * faixa do rótulo de banda. Junto ao NÚMERO só há ~90 px livres a 320 px
 * (medido: dígitos reservam 3ch + «/100» ≈ 198 px); na linha do rótulo
 * sobram ~240 px — a forma curta (<sm) das chaves levelToday* cabe em
 * todas as línguas. A caixa fica reservada dentro dessa linha quando não
 * há mensagem, e o porquê volta a ter a largura toda.
 *
 * Prova: pill visível, numa linha e sem corte na faixa do score; porquê a
 * ocupar a linha toda; caixa invisível presente sem mensagem — a 320/360/
 * 390 px nas 5 línguas, com warn (nazare), good (baleal) e sem (guincho).
 */
const LEVEL_SPOTS = [
  { slug: 'nazare', note: 'warn' },
  { slug: 'baleal', note: 'good' },
  // Intermediate com score ≥50 no bake → resolveSpotLevelToday = null:
  // a caixa invisível tem de continuar na linha do score.
  { slug: 'afife', note: 'sem mensagem' },
] as const;

test.describe('SP-A §1 nível do dia na linha do score em <sm', () => {
  for (const locale of PROV_LOCALES) {
    for (const spot of LEVEL_SPOTS) {
      test(`${locale}/${spot.slug} (${spot.note}): pill sem corte + porquê com largura toda`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        await page.goto(`/${locale}/spots/${spot.slug}/`);
        await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
        for (const width of [320, 360, 390]) {
          await page.setViewportSize({ width, height: 844 });
          const m = await page.evaluate(() => {
            const hero = document.querySelector('#agora') as HTMLElement;
            const heroRect = hero.getBoundingClientRect();
            // A pill do <sm vive na linha da banda — é a instância visível.
            const pills = Array.from(
              hero.querySelectorAll(
                'p[role="status"], p[aria-hidden].invisible:not([data-why])',
              ),
            ) as HTMLElement[];
            const visible = pills.filter((p) => {
              const r = p.getBoundingClientRect();
              const cs = getComputedStyle(p);
              return r.width > 1 && cs.display !== 'none';
            });
            const pill = visible.find(
              (p) => getComputedStyle(p).visibility !== 'hidden',
            );
            const reserve = visible.find(
              (p) => getComputedStyle(p).visibility === 'hidden',
            );
            const band = Array.from(
              hero.querySelectorAll('span.font-display.uppercase'),
            ).pop() as HTMLElement | undefined;
            const bandRow = band?.parentElement as HTMLElement | null;
            const why = hero.querySelector('[data-why]') as HTMLElement | null;
            const whyRow = why?.parentElement as HTMLElement | null;
            const pillRect = pill?.getBoundingClientRect();
            const whyRect = why?.getBoundingClientRect();
            const whyRowRect = whyRow?.getBoundingClientRect();
            return {
              pillInBandRow: !!pill && !!bandRow && bandRow.contains(pill),
              reserveInBandRow: !!reserve && !!bandRow && bandRow.contains(reserve),
              pill: pillRect
                ? {
                    l: pillRect.left - heroRect.left,
                    r: heroRect.right - pillRect.right,
                    w: pillRect.width,
                    h: pillRect.height,
                    sw: (pill as HTMLElement).scrollWidth,
                    cw: (pill as HTMLElement).clientWidth,
                    top: pillRect.top,
                  }
                : null,
              bandTop: band?.getBoundingClientRect().top ?? null,
              whyRight:
                whyRect && whyRowRect
                  ? whyRowRect.right - whyRect.right
                  : null,
              whySw: why?.scrollWidth ?? null,
              whyCw: why?.clientWidth ?? null,
            };
          });
          const ctx = `${locale}/${spot.slug} (${spot.note}) @${width}`;
          if (spot.note === 'sem mensagem') {
            // Caixa reservada invisível na linha da banda; sem pill visível.
            expect(m.reserveInBandRow, `${ctx} — sem caixa reservada`).toBe(true);
            expect(m.pill, `${ctx} — não devia haver pill visível`).toBeNull();
          } else {
            expect(m.pill, `${ctx} — sem pill visível`).not.toBeNull();
            expect(m.pillInBandRow, `${ctx} — pill fora da linha do score`).toBe(true);
            if (m.pill) {
              // Dentro do hero, uma linha, sem corte, alinhada à esquerda
              // e na mesma faixa vertical que o rótulo de banda.
              expect(m.pill.sw, `${ctx} — pill cortada sw=${m.pill.sw} cw=${m.pill.cw}`).toBeLessThanOrEqual(m.pill.cw + 1);
              expect(m.pill.h, `${ctx} — pill em 2 linhas`).toBeLessThanOrEqual(30);
              expect(m.pill.l, `${ctx} — pill fora à esquerda`).toBeGreaterThanOrEqual(14);
              expect(m.pill.r, `${ctx} — pill fora à direita`).toBeGreaterThanOrEqual(14);
              if (m.bandTop != null) {
                expect(
                  Math.abs(m.pill.top - m.bandTop),
                  `${ctx} — pill não está na linha do score`,
                ).toBeLessThanOrEqual(8);
              }
            }
          }
          // O porquê tem a largura toda em <sm (sem pill ao lado) e não
          // fica cortado com os factores reais do dia.
          if (m.whyRight != null) {
            expect(m.whyRight, `${ctx} — porquê sem largura toda`).toBeLessThanOrEqual(4);
            expect(
              m.whySw!,
              `${ctx} — porquê cortado sw=${m.whySw} cw=${m.whyCw}`,
            ).toBeLessThanOrEqual(m.whyCw! + 1);
          }
        }
      });
    }
  }
});

/**
 * «Como chegar» tem SEMPRE texto a partir de 360 px — é a acção primária
 * e um ícone sozinho não diz «direcções». Para caber com livecam ao lado,
 * o fantasma da câmara passa para dentro do menu «Mais» abaixo de 400 px
 * (item com o mesmo rótulo e destino). Abaixo de 360 px o primário fica
 * ícone-só com aria-label. Alvos ≥44 px em todos os casos.
 */
test.describe('SP-A §1 acções: primário com rótulo ≥360 px + livecam no «Mais» <400 px', () => {
  const CTA_SPOTS = [
    { slug: 'guincho', livecam: true },
    { slug: 'mosteiros', livecam: false },
  ] as const;

  for (const locale of PROV_LOCALES) {
    for (const spot of CTA_SPOTS) {
      test(`${locale}/${spot.slug}: «Como chegar» com texto a 360/390/768`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.goto(`/${locale}/spots/${spot.slug}/`);
        await page.waitForSelector('html.is-hydrated', { timeout: 40_000 });
        for (const width of [320, 360, 390, 768]) {
          await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
          const m = await page.evaluate(() => {
            const a = document.querySelector('#agora a[target="_blank"]') as HTMLElement | null;
            if (!a) return null;
            const label = a.querySelector('span:last-of-type') as HTMLElement | null;
            const row = a.parentElement as HTMLElement;
            const lr = label?.getBoundingClientRect();
            // O fantasma da livecam é filho directo da linha de acções; o
            // item do menu só existe no DOM quando o popover está aberto.
            const camGhost = row.querySelector(
              ':scope > a[href="#spot-livecam"]',
            ) as HTMLElement | null;
            return {
              btnH: Math.round(a.getBoundingClientRect().height * 10) / 10,
              rowH: Math.round(row.getBoundingClientRect().height * 10) / 10,
              rowSw: row.scrollWidth,
              rowCw: row.clientWidth,
              aria: a.getAttribute('aria-label'),
              labelVisible: label ? getComputedStyle(label).display !== 'none' : false,
              labelH: lr ? Math.round(lr.height) : 0,
              camGhostVisible: camGhost
                ? getComputedStyle(camGhost).display !== 'none'
                : null,
            };
          });
          const ctx = `${locale}/${spot.slug} @${width}`;
          expect(m, `${ctx}: sem botão`).not.toBeNull();
          if (!m) continue;
          expect(m.btnH, ctx).toBeLessThanOrEqual(46);
          expect(m.rowH, ctx).toBeLessThanOrEqual(46);
          expect(m.rowSw, `${ctx} — linha de acções estoura`).toBeLessThanOrEqual(m.rowCw + 1);
          expect(m.aria, ctx).toBeTruthy();
          if (width < 360) {
            expect(m.labelVisible, `${ctx} — o rótulo devia estar escondido`).toBe(false);
          } else {
            expect(m.labelVisible, `${ctx} — o rótulo devia ver-se`).toBe(true);
            // Uma linha de text-sm ≈ 20 px; 2 linhas seriam ~40 px.
            expect(m.labelH, `${ctx} — o rótulo partiu`).toBeLessThanOrEqual(24);
          }
          // Fantasma da livecam: escondido <400 px, visível a partir daí.
          if (spot.livecam) {
            expect(
              m.camGhostVisible,
              `${ctx} — fantasma da livecam no estado errado`,
            ).toBe(width < 400 ? false : true);
          }
        }
        // O item da livecam no «Mais» só aparece quando o fantasma está
        // escondido (<400 px): abre o menu nos dois lados do limiar.
        if (spot.livecam) {
          for (const width of [390, 768]) {
            await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
            const moreBtn = page.locator('#agora button[aria-haspopup="true"]');
            await moreBtn.click();
            const item = page.locator('#agora [role="group"] a[href="#spot-livecam"]');
            const visible = await item.evaluate((el) => {
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && r.height >= 44;
            });
            expect(
              visible,
              `${locale} @${width} — livecam no «Mais» ${width < 400 ? 'devia' : 'não devia'} ver-se`,
            ).toBe(width < 400);
            await page.keyboard.press('Escape');
          }
        }
      });
    }
  }
});
