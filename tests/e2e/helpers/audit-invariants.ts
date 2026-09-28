import fs from 'node:fs';
import path from 'node:path';

/**
 * Bateria de invariantes de LAYOUT/HTML que se mede em qualquer página sem
 * olhar para o produto: transbordo horizontal, texto cortado em silêncio,
 * alvos de toque, imagens, nomes acessíveis, ids duplicados, headings, `lang`,
 * âncoras mortas, animações em curso e `tabindex` positivo.
 *
 * Roda dentro do browser (`page.evaluate`), por isso não pode depender de nada
 * fora do seu argumento: é serializada.
 */

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  kind: string;
  severity: Severity;
  detail: string;
  selector?: string;
}

export interface InvariantOpts {
  /** Locale da rota — o `<html lang>` tem de bater. */
  locale: string;
  /** `mobile` liga os alvos de toque (a regra do projecto é ≥44 px fora de tabelas). */
  viewport: 'mobile' | 'desktop';
}

export function collectInvariants(opts: InvariantOpts): Finding[] {
  const out: Finding[] = [];
  const push = (kind: string, severity: Severity, detail: string, selector?: string) =>
    out.push({ kind, severity, detail, selector });

  const label = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${tag}${id}${cls}${text ? ` («${text}»)` : ''}`;
  };
  const visible = (el: Element): boolean => {
    // `sr-only` (skip-link, rótulos só para leitores de ecrã) mede 1×1 px: não é
    // um alvo, não é texto visível e não conta para nada desta bateria.
    if (el.closest('.sr-only')) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  /** Tailwind `line-clamp-N` corta com reticências POR DESENHO. O Chromium
   *  expõe `line-clamp` (a propriedade padrão) e o legado `-webkit-line-clamp`;
   *  os tipos do TS ainda não conhecem a primeira. */
  const clampOf = (cs: CSSStyleDeclaration): string => {
    const c = cs as unknown as { lineClamp?: string; webkitLineClamp?: string };
    return c.lineClamp ?? c.webkitLineClamp ?? '';
  };

  const vw = window.innerWidth;
  const doc = document.documentElement;

  // ── 1. Transbordo horizontal (a barra de scroll lateral) ────────────────
  if (doc.scrollWidth > vw + 1) {
    const offenders: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push(`${label(el)} @${Math.round(r.left)}..${Math.round(r.right)}`);
        if (offenders.length >= 4) break;
      }
    }
    push(
      'overflow-x',
      'error',
      `documento ${doc.scrollWidth}px > viewport ${vw}px`,
      offenders.join(' | ') || '(nenhum elemento isolado)',
    );
  }

  const scope = document.querySelectorAll('main *, header *, footer *, nav *');
  const clipX: string[] = [];
  const clipY: string[] = [];
  const ellipsisSpot: string[] = [];
  for (const el of scope) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.children.length > 0) continue; // folhas só
    if (el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    const dir = el.closest('a[href*="/spots/"]') ? 'spot' : null;

    // Cortado EM SILÊNCIO: overflow escondido e sem ellipsis pelo caminho.
    const striped = cs.textOverflow === 'ellipsis' || /\d/.test(clampOf(cs));
    if (/hidden|clip/.test(cs.overflowX) && el.clientWidth > 2 && el.scrollWidth > el.clientWidth + 1) {
      if (striped) {
        if (dir === 'spot') ellipsisSpot.push(`${label(el)} (${el.clientWidth}<${el.scrollWidth}px)`);
      } else {
        clipX.push(`${label(el)} (${el.clientWidth}<${el.scrollWidth}px)`);
      }
    }
    if (
      /hidden|clip/.test(cs.overflowY) &&
      el.clientHeight > 2 &&
      el.scrollHeight > el.clientHeight + 1 &&
      !/\d/.test(clampOf(cs))
    ) {
      clipY.push(`${label(el)} (${el.clientHeight}<${el.scrollHeight}px)`);
    }
  }
  if (clipX.length) push('clip-texto', 'error', `${clipX.length} folha(s) com texto cortado sem ellipsis`, clipX.slice(0, 4).join(' | '));
  if (clipY.length) push('clip-altura', 'warn', `${clipY.length} folha(s) cortada(s) na vertical`, clipY.slice(0, 3).join(' | '));
  if (ellipsisSpot.length) push('nome-spot-cortado', 'warn', `${ellipsisSpot.length} nome(s) de spot com reticências (regra v3 §8)`, ellipsisSpot.slice(0, 3).join(' | '));

  // ── 2. Alvos de toque (só no viewport móvel) ────────────────────────────
  // Controlos: regra do projecto, ≥44 px (warn). Links de texto: a WCAG 2.5.8
  // isenta-os e o rodapé/directório têm centenas — ficam como 'info' agregado,
  // senão o relatório afoga-se em ruído e esconde os controlos a sério.
  if (opts.viewport === 'mobile') {
    const small: string[] = [];
    const narrow: string[] = [];
    const smallLinks: string[] = [];
    for (const el of document.querySelectorAll(
      'a[href], button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], select, input:not([type="hidden"]), textarea, summary',
    )) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      const entry = `${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`;
      if (el.tagName === 'A' && cs.display === 'inline') continue; // texto corrido
      // A ALTURA é que manda (é a dimensão da linha de toque, e é o que o
      // `map-touch-targets` já impõe): uma pastilha de 32×44 está conforme.
      if (r.height < 44) {
        if (el.tagName === 'A') smallLinks.push(entry);
        else small.push(entry);
      } else if (r.width < 44) {
        narrow.push(entry);
      }
    }
    if (small.length) push('alvo-toque', 'warn', `${small.length} controlo(s) com menos de 44 px de ALTURA`, small.slice(0, 6).join(' | '));
    if (narrow.length) push('alvo-estreito', 'info', `${narrow.length} controlo(s) ≥44 de altura mas <44 de largura`, narrow.slice(0, 4).join(' | '));
    if (smallLinks.length) {
      push('link-baixo', 'info', `${smallLinks.length} link(s) < 44 px de altura (isento em texto corrido)`, smallLinks.slice(0, 3).join(' | '));
    }
  }

  // ── 3. Imagens ─────────────────────────────────────────────────────────
  const noAlt: string[] = [];
  const broken: string[] = [];
  for (const img of document.querySelectorAll('img')) {
    if (img.getAttribute('alt') === null) noAlt.push(label(img));
    if (img.complete && img.naturalWidth === 0) broken.push(`${label(img)} src=${img.currentSrc || img.src}`);
  }
  if (broken.length) push('imagem-quebrada', 'error', `${broken.length} imagem(ns) não carregada(s)`, broken.slice(0, 3).join(' | '));
  if (noAlt.length) push('img-sem-alt', 'warn', `${noAlt.length} <img> sem atributo alt`, noAlt.slice(0, 3).join(' | '));

  // ── 4. Nomes acessíveis em controlos ───────────────────────────────────
  const semNome: string[] = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="link"]')) {
    if (!visible(el)) continue;
    const hasText = (el.textContent ?? '').trim().length > 0;
    const hasAria =
      el.getAttribute('aria-label') !== null ||
      el.getAttribute('aria-labelledby') !== null ||
      el.getAttribute('title') !== null;
    const hasImgAlt = !!el.querySelector('img[alt]:not([alt=""])');
    const hasSvgTitle = !!el.querySelector('svg title');
    if (!hasText && !hasAria && !hasImgAlt && !hasSvgTitle) semNome.push(label(el));
  }
  if (semNome.length) push('controlo-sem-nome', 'error', `${semNome.length} controlo(s) sem nome acessível`, semNome.slice(0, 4).join(' | '));

  // ── 5. Estrutura ───────────────────────────────────────────────────────
  const ids = new Map<string, number>();
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  const dup = [...ids.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
  if (dup.length) push('id-duplicado', 'error', `${dup.length} id(s) repetido(s)`, dup.slice(0, 4).join(' | '));

  const mains = document.querySelectorAll('main');
  if (mains.length === 0) push('sem-main', 'warn', 'a página não tem landmark <main>');
  if (mains.length > 1) push('main-multiplo', 'warn', `${mains.length} elementos <main>`);

  // Um `<h1 class="sr-only">` é técnica legítima (a home, o mapa e o callback
  // usam-na): conta como h1. Só se NENHUM for visível é que fica a nota.
  const h1todos = document.querySelectorAll('h1');
  const h1visiveis = [...h1todos].filter((el) => !el.closest('.sr-only'));
  if (h1todos.length === 0) push('sem-h1', 'error', 'a página não tem nenhum <h1>');
  else if (h1visiveis.length === 0) {
    push('h1-so-sr-only', 'info', 'só há <h1> escondido (sr-only) — válido para leitores de ecrã');
  }
  if (h1todos.length > 1) push('h1-multiplo', 'warn', `${h1todos.length} <h1>`, [...h1todos].map(label).join(' | '));

  const lang = document.documentElement.lang;
  if (!lang || !lang.toLowerCase().startsWith(opts.locale)) {
    push('lang-errado', 'error', `html lang="${lang}" numa rota /${opts.locale}/`);
  }

  const title = document.title.trim();
  const desc = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';
  if (!title) push('sem-title', 'error', 'documento sem <title>');
  if (!desc) push('sem-description', 'warn', 'sem meta description');
  else if (desc.length < 50) push('description-curta', 'info', `meta description com ${desc.length} caracteres`);

  // Páginas-gate (conta, favoritos, admin) têm pouco conteúdo por desenho:
  // só abaixo de 40 caracteres é que é uma página que não renderizou.
  const body = (mains[0]?.textContent ?? document.body.textContent ?? '').trim();
  if (body.length < 40) push('pagina-vazia', 'error', `conteúdo principal com ${body.length} caracteres`);
  else if (body.length < 150) push('pagina-curta', 'info', `conteúdo principal com ${body.length} caracteres`);

  // ── 6. Âncoras mortas ──────────────────────────────────────────────────
  const mortas: string[] = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (!visible(a)) continue;
    // Os controlos do Leaflet são `href="#"` por desenho (biblioteca).
    if (a.closest('.leaflet-control')) continue;
    const href = a.getAttribute('href') ?? '';
    if (href === '#' || href === '' || href === 'javascript:void(0)') mortas.push(label(a));
  }
  if (mortas.length) push('ancora-morta', 'warn', `${mortas.length} link(s) sem destino`, mortas.slice(0, 4).join(' | '));

  // ── 7. Teclado ─────────────────────────────────────────────────────────
  const tabPositivo: string[] = [];
  for (const el of document.querySelectorAll('[tabindex]')) {
    const v = Number(el.getAttribute('tabindex'));
    if (Number.isFinite(v) && v > 0) tabPositivo.push(`${label(el)} tabindex=${v}`);
  }
  if (tabPositivo.length) push('tabindex-positivo', 'warn', `${tabPositivo.length} elemento(s) fora da ordem natural`, tabPositivo.slice(0, 3).join(' | '));

  // ── 8. Movimento ───────────────────────────────────────────────────────
  // As animações do Leaflet (o fade de 10 ms dos tiles) são da biblioteca, não
  // nossas: o resto do varrimento já salta `.leaflet-control`, isto salta o
  // mapa todo. Sem este filtro, qualquer página com mapa pintava de vermelho.
  const nosso = (a: Animation) => {
    const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
    return !el?.closest?.('.leaflet-container');
  };
  const nome = (a: Animation) => {
    const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
    const cls = (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return `${(a as unknown as { animationName?: string }).animationName ?? a.constructor.name}@${el ? el.tagName.toLowerCase() + (cls ? '.' + cls : '') : '?'}`;
  };
  const running = document.getAnimations().filter((a) => a.playState === 'running' && nosso(a));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce && running.length > 0) {
    push(
      'movimento-reduzido',
      'error',
      `${running.length} animação(ões) a correr com prefers-reduced-motion`,
      running.slice(0, 4).map(nome).join(' | '),
    );
  } else if (running.length > 0) {
    const infinite = running.filter((a) => {
      const t = a.effect?.getTiming?.();
      return t?.iterations === Infinity;
    });
    if (infinite.length > 0) {
      push('animacao-infinita', 'info', `${infinite.length} animação(ões) infinitas em curso após assentar`);
    } else {
      push('animacao-em-curso', 'info', `${running.length} animação(ões) ainda a correr após assentar`);
    }
  }

  return out;
}

/** Código-fonte da bateria, para `page.evaluate` sem re-serializar closures. */
export const COLLECT_INVARIANTS_SOURCE = collectInvariants.toString();

// NÃO usar `test-results/`: o Playwright apaga essa pasta no início de cada
// corrida, pelo que varrimentos diferentes apagavam-se uns aos outros. `_audit/`
// é ignorado pelo git e sobrevive entre corridas.
// `AUDIT_RAW_DIR` permite correr duas vezes para pastas diferentes e comparar
// (é assim que se prova que a recolha é reprodutível: 2 corridas, 0 diferenças).
const RAW_DIR = process.env.AUDIT_RAW_DIR
  ? path.resolve(process.env.AUDIT_RAW_DIR)
  : path.join(process.cwd(), '_audit', 'mega-2026-09-26', 'raw');

/** Uma página → um ficheiro. Os workers são processos separados, por isso
 *  não há agregação em memória: o relatório junta os ficheiros no fim. */
export function writeRaw(name: string, payload: unknown): void {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify(payload, null, 1));
}

export const RAW_DIR_PATH = RAW_DIR;
