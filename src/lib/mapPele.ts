/**
 * Pele v6 «Atlântico» do /mapa — fase B (estudo aprovado a 01/11; B0–B8 atrás de flag).
 *
 * PR B9 (aprovada pelo Pedro a 12/11/2026): a pele é o /mapa por defeito. `?pele=0`
 * (ou `actual`, `off`…) mostra o /mapa anterior e grava `off` em
 * `localStorage['ventu:map:pele']`; `?pele=v6` volta à pele e grava `v6`.
 * O 1.º render já sai com a pele; a leitura de `window`/`localStorage` fica num
 * efeito (sem React #418).
 */
import { useEffect, useState } from 'react';

export const MAP_PELE_PARAM = 'pele';
export const MAP_PELE_LS_KEY = 'ventu:map:pele';

export type MapPele = 'v6';

export interface MapPeleDecisao {
  /** A pele activa nesta visita (`null` = o /mapa de hoje). */
  pele: MapPele | null;
  /** O que fazer à preferência gravada: gravar `v6`, apagar, ou não mexer. */
  gravar: 'v6' | 'off' | null;
}

/** Valor gravado quando o utilizador pede o /mapa anterior (`?pele=0`, `?pele=actual`…). */
export const MAP_PELE_OFF = 'off';

/**
 * Decisão pura (testada). PR B9: a pele v6 passa a ser o /mapa por defeito.
 * O parâmetro do URL vence sempre o que está gravado: `?pele=v6` liga (e grava `v6`);
 * qualquer outro `?pele=` pede o /mapa anterior e grava `off`. Sem parâmetro, só um
 * `off` gravado desliga; tudo o resto (nada, `v6`, lixo) é a pele.
 */
export function resolveMapPele(param: string | null, gravado: string | null): MapPeleDecisao {
  if (param !== null) {
    return param.trim().toLowerCase() === 'v6'
      ? { pele: 'v6', gravar: 'v6' }
      : { pele: null, gravar: 'off' };
  }
  return { pele: gravado === MAP_PELE_OFF ? null : 'v6', gravar: null };
}

/**
 * Hook do contentor do /mapa: devolve `'v6'` (por defeito, desde a B9) ou `null`
 * (o /mapa anterior, só com `?pele=0` ou `off` gravado). O 1.º render e o HTML estático
 * já saem com a pele, por isso a maioria das visitas não pisca; quem optou por sair
 * vê a troca depois de montar (a leitura de `window` fica no efeito, sem React #418).
 */
export function useMapPele(): MapPele | null {
  const [pele, setPele] = useState<MapPele | null>('v6');
  useEffect(() => {
    let gravado: string | null = null;
    try {
      gravado = localStorage.getItem(MAP_PELE_LS_KEY);
    } catch {
      /* modo privado / quota */
    }
    const param = new URLSearchParams(window.location.search).get(MAP_PELE_PARAM);
    const d = resolveMapPele(param, gravado);
    try {
      if (d.gravar) localStorage.setItem(MAP_PELE_LS_KEY, d.gravar);
    } catch {
      /* noop */
    }
    if (!d.pele) setPele(null);
  }, []);
  return pele;
}

/**
 * PR B6 (D1): o recolor da base «Mapa» tem uma flag própria, por cima da pele.
 * `?pelebase=v6` liga-a e grava-a em `localStorage['ventu:map:pele-base']`;
 * qualquer outro valor desliga-a e apaga a chave (a mesma regra da pele). Só vale
 * com a pele ligada: sem `?pele=v6` o /mapa fica exactamente como hoje.
 */
export const MAP_PELE_BASE_PARAM = 'pelebase';
export const MAP_PELE_BASE_LS_KEY = 'ventu:map:pele-base';

/**
 * Decisão pura (testada): a flag da base só conta com a pele activa. Continua opt-in
 * depois da B9 (a aceitação (a) da D1 está por fazer): só `v6` liga; outro valor apaga.
 */
export function resolveMapPeleBase(
  pele: MapPele | null,
  param: string | null,
  gravado: string | null,
): { activa: boolean; gravar: 'v6' | 'apagar' | null } {
  if (param !== null) {
    const on = param.trim().toLowerCase() === 'v6';
    return { activa: pele === 'v6' && on, gravar: on ? 'v6' : 'apagar' };
  }
  return { activa: pele === 'v6' && gravado === 'v6', gravar: null };
}

/** Hook do contentor do /mapa: `true` só com a pele e a flag da base ligadas. */
export function useMapPeleBase(pele: MapPele | null): boolean {
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    let gravado: string | null = null;
    try {
      gravado = localStorage.getItem(MAP_PELE_BASE_LS_KEY);
    } catch {
      /* modo privado / quota */
    }
    const param = new URLSearchParams(window.location.search).get(MAP_PELE_BASE_PARAM);
    const d = resolveMapPeleBase(pele, param, gravado);
    try {
      if (d.gravar === 'v6') localStorage.setItem(MAP_PELE_BASE_LS_KEY, 'v6');
      else if (d.gravar === 'apagar') localStorage.removeItem(MAP_PELE_BASE_LS_KEY);
    } catch {
      /* noop */
    }
    setActiva(d.activa);
  }, [pele]);
  return activa;
}
