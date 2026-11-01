/**
 * Pele v6 «Atlântico» do /mapa — fase B, PR B0 (estudo aprovado a 01/11).
 *
 * A pele vive atrás de uma flag até à PR B9: `?pele=v6` liga-a e grava-a em
 * `localStorage['ventu:map:pele']`; qualquer outro `?pele=` (`?pele=0`,
 * `?pele=actual`) desliga-a e apaga a chave; sem `?pele=` vale o que está
 * gravado. Com a flag desligada o /mapa fica exactamente como hoje.
 *
 * Lida SÓ depois de montar (num efeito): o HTML estático e o 1.º render do
 * cliente saem sempre sem pele, por isso não há divergência de hidratação
 * (React #418) nem leitura de `window` no render.
 */
import { useEffect, useState } from 'react';

export const MAP_PELE_PARAM = 'pele';
export const MAP_PELE_LS_KEY = 'ventu:map:pele';

export type MapPele = 'v6';

export interface MapPeleDecisao {
  /** A pele activa nesta visita (`null` = o /mapa de hoje). */
  pele: MapPele | null;
  /** O que fazer à preferência gravada: gravar `v6`, apagar, ou não mexer. */
  gravar: 'v6' | 'apagar' | null;
}

/** Decisão pura (testada): o parâmetro do URL vence sempre o que está gravado. */
export function resolveMapPele(param: string | null, gravado: string | null): MapPeleDecisao {
  if (param !== null) {
    return param.trim().toLowerCase() === 'v6'
      ? { pele: 'v6', gravar: 'v6' }
      : { pele: null, gravar: 'apagar' };
  }
  return { pele: gravado === 'v6' ? 'v6' : null, gravar: null };
}

/**
 * Hook do contentor do /mapa: devolve `'v6'` ou `null`. Com a flag desligada
 * nunca muda de estado (nenhum render extra, nenhum custo no arranque).
 */
export function useMapPele(): MapPele | null {
  const [pele, setPele] = useState<MapPele | null>(null);
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
      if (d.gravar === 'v6') localStorage.setItem(MAP_PELE_LS_KEY, 'v6');
      else if (d.gravar === 'apagar') localStorage.removeItem(MAP_PELE_LS_KEY);
    } catch {
      /* noop */
    }
    if (d.pele) setPele(d.pele);
  }, []);
  return pele;
}
