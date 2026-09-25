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
 * «nome e score na mesma linha SE COUBER, senão o score por baixo») e a linha
 * porquê fica sempre na caixa (invisível fora do «agora»). A largura do nome
 * deixa de depender de conteúdo.
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
      //    (<lg): repor essa regra faz a largura do nome depender do score —
      //    se não fizer, a asserção acima não está a medir nada.
      if (vp.width < 1024) {
        await page.addStyleTag({
          content: '#agora div.grid{grid-template-columns:minmax(0,1fr) auto !important;column-gap:1rem !important;row-gap:0 !important}',
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
