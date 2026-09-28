/**
 * Medição de uma página para o varrimento VISUAL (píxeis).
 *
 * Complementa `audit-invariants.ts` (que mede layout/HTML) com o que só se vê
 * no píxel: estado do tema que foi realmente aplicado, mapas que nunca
 * assentaram, esqueletos de carregamento congelados na captura, e as caixas dos
 * elementos de texto que o analisador vai recortar da imagem para medir
 * contraste REAL (píxel contra píxel, não `getComputedStyle` contra um fundo
 * presumido).
 *
 * Corre dentro do browser (`page.evaluate`): não pode importar nada.
 */

export interface ContrastSample {
  /** Rótulo curto e estável (tag + primeiras classes + texto). */
  sel: string;
  tag: string;
  text: string;
  /** Fundo com imagem/gradiente (o contraste medido em píxeis não é do texto). */
  bgImage: boolean;
  /** O elemento contém uma <img> (foto dentro de um cartão, etc.). */
  hasImg: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  /** Fundo do próprio elemento ou do primeiro ancestral com fundo opaco. */
  bg: string;
  opacity: number;
}

export interface MapSample {
  settled: string | null;
  w: number;
  h: number;
  cls: string;
  /** Cadeia de ancestrais com classe, para identificar o componente. */
  ancestor: string;
  tiles: number;
  panes: number;
}

export interface VisualMeasure {
  /** Versão do colector: os campos só existem a partir daqui. */
  measureVersion: number;
  vw: number;
  vh: number;
  docH: number;
  docW: number;
  readyState: string;
  htmlClass: string;
  bodyBg: string;
  bodyColor: string;
  themeOcean: boolean;
  prefersDark: boolean;
  fonts: string;
  imgs: { total: number; broken: number; incomplete: number; noAlt: number };
  maps: MapSample[];
  animRunning: number;
  animInfinite: number;
  animNames: string[];
  lazyImgs: number;
  skeleton: number;
  /** Esqueletos com área ≥2000 px² (versão 3 do registo); ausente nos registos anteriores. */
  skeletonBig?: number;
  mainCount: number;
  h1Count: number;
  textLen: number;
  /** Caixa do primeiro `<main>` — um topo em branco aparece aqui. */
  mainTop: number;
  mainHeight: number;
  /** Overlays fixos que cobrem a faixa do topo (cabeçalho, banners). */
  fixedOverlays: { cls: string; h: number; w: number }[];
  contrast: ContrastSample[];
}

export function collectVisual(): VisualMeasure {
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.15;
  };
  const label = (el: Element, max = 34): string => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c && !/^(is-|theme-|geist|space_grotesk)/.test(c))
      .slice(0, 3)
      .join('.');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
    return `${tag}${cls ? '.' + cls : ''}${text ? ` «${text}»` : ''}`;
  };
  const ancestorChain = (el: Element | null): string => {
    const out: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; i < 6 && cur; i++) {
      const cls = (cur.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !/^leaflet-/.test(c))
        .slice(0, 2)
        .join('.');
      if (cls) out.push(`${cur.tagName.toLowerCase()}.${cls}`);
      cur = cur.parentElement;
    }
    return out.join(' < ');
  };
  /** Fundo opaco efectivo: o mais próximo que declare uma cor com alpha > 0. */
  const bgOf = (el: Element): string => {
    let cur: Element | null = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',').map((v) => Number(v.trim()));
        const alpha = parts.length > 3 ? parts[3] : 1;
        if (alpha > 0.7) return bg;
      }
      cur = cur.parentElement;
    }
    return 'rgb(255,255,255)';
  };

  const doc = document.documentElement;
  const maps = [...document.querySelectorAll('.leaflet-container')].map((c) => {
    const r = c.getBoundingClientRect();
    const wrap = c.parentElement;
    return {
      settled: c.getAttribute('data-map-settled'),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cls: (c.getAttribute('class') ?? '').split(/\s+/).filter((x) => x !== 'leaflet-container').slice(0, 3).join('.'),
      ancestor: ancestorChain(wrap),
      tiles: c.querySelectorAll('img.leaflet-tile').length,
      panes: c.querySelectorAll('.leaflet-pane').length,
    };
  });

  const nosso = (a: Animation): boolean => {
    const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
    return !el?.closest?.('.leaflet-container');
  };
  const running = document.getAnimations().filter((a) => a.playState === 'running' && nosso(a));

  const main = document.querySelector('main');
  const mainRect = main?.getBoundingClientRect();

  const fixedOverlays: { cls: string; h: number; w: number }[] = [];
  for (const el of document.querySelectorAll('body > *, body *:not(.leaflet-container *)')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.width < 100 || r.top > 40 || r.bottom < 0) continue;
    fixedOverlays.push({ cls: label(el, 0), h: Math.round(r.height), w: Math.round(r.width) });
    if (fixedOverlays.length >= 4) break;
  }

  // Amostras de contraste: o texto que um humano lê primeiro. Seis caixas por
  // página (não mais) para o analisador recortar da imagem.
  const contrast: ContrastSample[] = [];
  const candidates: Element[] = [];
  const h1 = document.querySelector('main h1, h1');
  if (h1) candidates.push(h1);
  const h2 = document.querySelector('main h2, h2');
  if (h2) candidates.push(h2);
  for (const sel of ['main a[href]', 'main button', 'main [role="button"]', 'main p']) {
    for (const el of document.querySelectorAll(sel)) {
      if (candidates.length >= 6) break;
      if (!visible(el)) continue;
      const text = (el.textContent ?? '').trim();
      if (text.length < 3) continue;
      if (candidates.includes(el)) continue;
      candidates.push(el);
    }
    if (candidates.length >= 6) break;
  }
  for (const el of candidates) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // Fundo "sujo": se o elemento (ou até 3 ancestrais) tem imagem ou gradiente,
    // o contraste medido na caixa não é o contraste do TEXTO — o analisador
    // tem de o saber para não acusar fotos de serem texto ilegível.
    let bgImage = false;
    let cur: Element | null = el;
    for (let i = 0; i < 4 && cur; i++) {
      const c = getComputedStyle(cur);
      if (c.backgroundImage && c.backgroundImage !== 'none') bgImage = true;
      cur = cur.parentElement;
    }
    contrast.push({
      sel: label(el),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
      bgImage,
      hasImg: !!el.querySelector('img'),
      x: Math.round(r.left),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: Math.round(Number(cs.fontSize.replace('px', '')) || 0),
      fontWeight: Number(cs.fontWeight) || 400,
      color: cs.color,
      bg: bgOf(el),
      opacity: Number(cs.opacity),
    });
  }

  const imgs = [...document.images];
  return {
    // 3 = tem `skeletonBig` (área ≥2000 px²). Os 10 476 registos do varrimento
    // de 2026-09-27 estão TODOS em 2 e nenhum tem `skeletonBig`: a versão 2 foi
    // estampada antes e depois do campo existir, e como o número não mudou só se
    // descobriu isto ao contar as chaves dos registos. Qualquer campo novo nest
    // medida tem de subir esta versão, senão a mistura fica invisível.
    measureVersion: 3,
    vw: window.innerWidth,
    vh: window.innerHeight,
    docH: doc.scrollHeight,
    docW: doc.scrollWidth,
    readyState: document.readyState,
    htmlClass: doc.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    themeOcean: doc.classList.contains('theme-ocean'),
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    fonts: document.fonts.status,
    imgs: {
      total: imgs.length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      incomplete: imgs.filter((i) => !i.complete).length,
      noAlt: imgs.filter((i) => i.getAttribute('alt') === null).length,
    },
    maps,
    animRunning: running.length,
    animInfinite: running.filter((a) => a.effect?.getTiming?.().iterations === Infinity).length,
    animNames: running
      .slice(0, 6)
      .map((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return `${(a as unknown as { animationName?: string }).animationName ?? '?'}@${el ? label(el, 0) : '?'}`;
      }),
    lazyImgs: document.querySelectorAll('img[loading="lazy"]').length,
    skeleton: document.querySelectorAll(
      '[data-skeleton], .animate-pulse, [aria-busy="true"], [data-loading="true"], .skeleton',
    ).length,
    // Só o que pode ser um esqueleto: a primeira versão contava qualquer
    // `.animate-pulse`, e isso são 97 rotas de spot acusadas por um ponto de
    // estado de 8×8 px (`span.w-2.h-2.rounded-full.bg-score-good`) — verificado
    // ao vivo. Um esqueleto a sério ocupa área.
    skeletonBig: [...document.querySelectorAll(
      '[data-skeleton], .animate-pulse, [aria-busy="true"], [data-loading="true"], .skeleton',
    )].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height >= 2_000;
    }).length,
    mainCount: document.querySelectorAll('main').length,
    h1Count: document.querySelectorAll('h1').length,
    // `innerText` e não `textContent`: o segundo inclui o texto dos <script>s
    // inline (a home dava 826 079 «caracteres de texto»).
    textLen: (main?.innerText ?? document.body.innerText ?? '').trim().length,
    mainTop: mainRect ? Math.round(mainRect.top + window.scrollY) : -1,
    mainHeight: mainRect ? Math.round(mainRect.height) : -1,
    fixedOverlays,
    contrast,
  };
}
