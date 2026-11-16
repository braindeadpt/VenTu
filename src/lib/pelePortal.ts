'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Pele dos portais (#458 §3). Popovers e folhas que saem por `createPortal`
 * para o `document.body` deixam a árvore `[data-pele='v6']` do /mapa e
 * perdiam os tokens, as fontes e as regras da pele. Em vez de passar a pele
 * por props a componentes partilhados com o resto do site, o portal herda-a
 * da âncora: se o elemento que o abriu vive dentro de `[data-pele='v6']`, o
 * portal leva o mesmo atributo. Fora do /mapa (página de spot, /spots) não
 * há antepassado com a pele e nada muda.
 */
export function pelePortalDe(el: Element | null | undefined): 'v6' | undefined {
  return el?.closest('[data-pele]')?.getAttribute('data-pele') === 'v6' ? 'v6' : undefined;
}

/** Lê a pele da âncora sempre que o portal abre. */
export function usePelePortal(
  anchorRef: RefObject<Element | null>,
  open: boolean,
): 'v6' | undefined {
  const [pele, setPele] = useState<'v6' | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) return;
    setPele(pelePortalDe(anchorRef.current));
  }, [open, anchorRef]);
  return pele;
}
