/**
 * Pele v6 do /mapa — PR B8: o cabeçalho do site.
 *
 * O `<header class="site-header">` vem do layout, fora do contentor `[data-pele=v6]`, e um
 * segundo `data-pele` partiria os e2e que exigem um só. Por isso a pele marca o cabeçalho com
 * um atributo próprio, `data-pele-cabecalho="v6"`, que só existe enquanto a pele está ligada
 * no /mapa: sai ao desligar a flag e ao desmontar (navegar para fora do /mapa). O CSS vive em
 * src/styles/mapa-pele-cabecalho.css. Corre num efeito, depois de montar: o HTML estático e o
 * 1.º render saem sem o atributo, como o resto da pele (sem React #418).
 */
import { useEffect } from 'react';
import type { MapPele } from './mapPele';

export const MAP_PELE_CABECALHO_ATTR = 'data-pele-cabecalho';
export const MAP_PELE_CABECALHO_SELECTOR = 'header.site-header';

/** Aplica ou retira a marca; devolve a função que a retira. Pura em relação ao DOM dado (testada). */
export function marcarCabecalho(doc: Pick<Document, 'querySelector'>, pele: MapPele | null): () => void {
  const el = doc.querySelector(MAP_PELE_CABECALHO_SELECTOR);
  if (!el) return () => {};
  if (pele !== 'v6') {
    el.removeAttribute(MAP_PELE_CABECALHO_ATTR);
    return () => {};
  }
  el.setAttribute(MAP_PELE_CABECALHO_ATTR, 'v6');
  return () => el.removeAttribute(MAP_PELE_CABECALHO_ATTR);
}

export function useMapPeleCabecalho(pele: MapPele | null): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    return marcarCabecalho(document, pele);
  }, [pele]);
}
