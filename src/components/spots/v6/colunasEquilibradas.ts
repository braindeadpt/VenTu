'use client';

/**
 * Colunas equilibradas pelo conteúdo para a grelha de cartões do «O que se
 * mede» (v6). As CSS columns deixam buracos quando os cartões têm alturas
 * muito diferentes (a 1440 ficavam ~170 px vazios debaixo de «Sol e ar»);
 * aqui mede-se a altura natural de cada cartão, escolhe-se a distribuição
 * por colunas com a coluna mais alta mais baixa possível e o último cartão
 * de cada coluna estica até ao fundo da mais alta: as colunas acabam todas
 * à mesma altura, seja qual for o conteúdo (boia fresca ou antiga, UV 0, um
 * cartão que não aparece…).
 *
 * O número de colunas vem do CSS (`--ec-cols`, por media query); sem JS ou
 * antes de medir, a grelha fica nas CSS columns (o fallback de v6-atlantico.css).
 */
import { useEffect, type RefObject } from 'react';

export interface Distribuicao {
  /** Coluna (0…k−1) de cada cartão, pela ordem do DOM. */
  coluna: number[];
  /** Altura de cada coluna (px, com os intervalos). */
  alturas: number[];
}

/**
 * Distribui cartões (na ordem do DOM; dentro de cada coluna a ordem mantém-se)
 * por `k` colunas: minimiza a coluna mais alta, depois a diferença entre a
 * mais alta e a mais baixa; em empate fica a distribuição mais perto da ordem
 * de leitura. Exaustivo até 8 cartões (k^n ≤ 6561), guloso acima disso.
 */
export function distribuir(alturas: readonly number[], k: number, gap: number): Distribuicao {
  const n = alturas.length;
  const cols = Math.max(1, Math.min(k, n || 1));
  const somar = (coluna: number[]) => {
    const h = new Array(cols).fill(0);
    const c = new Array(cols).fill(0);
    coluna.forEach((col, i) => {
      h[col] += alturas[i] + (c[col] ? gap : 0);
      c[col]++;
    });
    return h as number[];
  };
  if (n === 0) return { coluna: [], alturas: [] };
  if (n > 8) {
    const coluna: number[] = [];
    const h = new Array(cols).fill(0);
    alturas.forEach((a) => {
      let m = 0;
      for (let j = 1; j < cols; j++) if (h[j] < h[m] - 0.5) m = j;
      h[m] += a + (h[m] ? gap : 0);
      coluna.push(m);
    });
    return { coluna, alturas: h };
  }
  let melhor: { coluna: number[]; max: number; dif: number; ordem: number } | null = null;
  const total = cols ** n;
  for (let code = 0; code < total; code++) {
    const coluna: number[] = [];
    let x = code;
    for (let i = 0; i < n; i++) {
      coluna.push(x % cols);
      x = Math.floor(x / cols);
    }
    // Todas as colunas com pelo menos um cartão e numeradas pela ordem em que
    // aparecem (a 1.ª coluna tem o 1.º cartão…): elimina simetrias.
    let proxima = 0;
    let valida = true;
    for (const col of coluna) {
      if (col > proxima) {
        valida = false;
        break;
      }
      if (col === proxima) proxima++;
    }
    if (!valida || proxima !== cols) continue;
    const h = somar(coluna);
    const max = Math.max(...h);
    const dif = max - Math.min(...h);
    // desvio da ordem de leitura: soma das colunas (menor = cartões cedo à esquerda)
    const ordem = coluna.reduce((s, col, i) => s + col * (n - i), 0);
    const ganha =
      !melhor ||
      max < melhor.max - 0.5 ||
      (Math.abs(max - melhor.max) <= 0.5 && (dif < melhor.dif - 0.5 || (Math.abs(dif - melhor.dif) <= 0.5 && ordem < melhor.ordem)));
    if (ganha) melhor = { coluna, max, dif, ordem };
  }
  const coluna = melhor ? melhor.coluna : alturas.map((_, i) => i % cols);
  return { coluna, alturas: somar(coluna) };
}

const visiveis = (el: HTMLElement) => (Array.from(el.children) as HTMLElement[]).filter((f) => f.getClientRects().length > 0);
const umaColuna = (el: HTMLElement) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length <= 1;

/**
 * Altura natural de um cartão, independente de estar esticado: num cartão de uma
 * coluna, a soma dos filhos e dos intervalos (o último filho pode estar encostado
 * ao fundo); nos outros (Sol e ar, 2 colunas), do topo ao fim do filho mais baixo.
 */
function alturaNatural(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const pad = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0') + parseFloat(cs.borderTopWidth || '0') + parseFloat(cs.borderBottomWidth || '0');
  const filhos = visiveis(el);
  if (!filhos.length) return Math.ceil(pad);
  if (umaColuna(el)) {
    const gap = parseFloat(cs.rowGap || '0') || 0;
    const soma = filhos.reduce((s, f) => {
      const fs = getComputedStyle(f);
      return s + f.getBoundingClientRect().height + parseFloat(fs.marginTop || '0') + parseFloat(fs.marginBottom || '0');
    }, 0);
    return Math.ceil(soma + gap * (filhos.length - 1) + pad);
  }
  const r = el.getBoundingClientRect();
  let fundo = r.top;
  for (const f of filhos) fundo = Math.max(fundo, f.getBoundingClientRect().bottom + parseFloat(getComputedStyle(f).marginBottom || '0'));
  return Math.ceil(fundo - r.top + parseFloat(cs.paddingBottom || '0') + parseFloat(cs.borderBottomWidth || '0'));
}

/** Cartão esticado de uma coluna que acaba na fonte (`.ec-fonte`): a fonte desce até ao fundo do cartão. */
function encostaFonte(el: HTMLElement, sim: boolean) {
  for (const f of Array.from(el.children) as HTMLElement[]) f.style.alignSelf = '';
  el.style.gridTemplateRows = '';
  if (!sim || !umaColuna(el)) return;
  const filhos = visiveis(el);
  // só a linha da fonte desce; se o cartão acaba noutra coisa (ex.: maré observada), a folga fica no fim
  if (filhos.length < 2 || !filhos[filhos.length - 1].classList.contains('ec-fonte')) return;
  el.style.gridTemplateRows = `repeat(${filhos.length - 1}, auto) 1fr`;
  filhos[filhos.length - 1].style.alignSelf = 'end';
}

export function useColunasEquilibradas(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const grelha = ref.current;
    if (!grelha || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    let raf = 0;
    let ultimo = '';
    const limpar = () => {
      delete grelha.dataset.mas;
      for (const c of Array.from(grelha.children) as HTMLElement[]) {
        c.style.gridColumn = '';
        c.style.gridRow = '';
        delete c.dataset.estica;
        encostaFonte(c, false);
      }
      ultimo = '';
    };
    const aplicar = () => {
      raf = 0;
      const k = parseInt(getComputedStyle(grelha).getPropertyValue('--ec-cols'), 10) || 1;
      const cartoes = (Array.from(grelha.children) as HTMLElement[]).filter((c) => c.offsetParent !== null || c.getClientRects().length);
      if (k < 2 || cartoes.length < 2) {
        if (grelha.dataset.mas) limpar();
        return;
      }
      const gap = parseFloat(getComputedStyle(grelha).getPropertyValue('--ec-gap')) || 12;
      const alturas = cartoes.map(alturaNatural);
      const { coluna, alturas: hs } = distribuir(alturas, k, gap);
      const cols = Math.max(...coluna) + 1;
      const max = Math.max(...hs);
      const chave = `${cols}|${alturas.join(',')}|${coluna.join(',')}`;
      if (chave === ultimo) return;
      ultimo = chave;
      grelha.dataset.mas = String(cols);
      grelha.style.setProperty('--ec-mas-cols', String(cols));
      const topo = new Array(cols).fill(0);
      const ultimoDe = new Array(cols).fill(-1);
      coluna.forEach((col, i) => (ultimoDe[col] = i));
      cartoes.forEach((c, i) => {
        const col = coluna[i];
        const inicio = topo[col];
        const fim = ultimoDe[col] === i ? max : inicio + alturas[i];
        topo[col] = fim + gap;
        // linhas de 1 px (grid-auto-rows:1px, sem row-gap): início e fim em px
        c.style.gridColumn = String(col + 1);
        c.style.gridRow = `${Math.round(inicio) + 1} / ${Math.round(fim) + 1}`;
        const estica = ultimoDe[col] === i && fim - inicio > alturas[i] + 0.5;
        if (estica) c.dataset.estica = '';
        else delete c.dataset.estica;
        encostaFonte(c, estica);
      });
    };
    const agenda = () => {
      if (!raf) raf = requestAnimationFrame(aplicar);
    };
    // O conteúdo dos cartões não depende da altura do cartão (align-content:start):
    // observar os filhos de cada cartão não entra em ciclo quando o último estica.
    const ro = new ResizeObserver(agenda);
    const observar = () => {
      ro.disconnect();
      ro.observe(grelha);
      for (const c of Array.from(grelha.children)) for (const f of Array.from(c.children)) ro.observe(f);
    };
    const mo = new MutationObserver(() => {
      observar();
      agenda();
    });
    mo.observe(grelha, { childList: true, subtree: true });
    observar();
    agenda();
    void document.fonts?.ready.then(agenda);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      limpar();
    };
  }, [ref]);
}
