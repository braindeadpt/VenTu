/**
 * Estado dos tiles OpenSeaMap (sinalização da «Carta náutica»).
 *
 * O servidor devolve 200 com um PNG transparente onde não há sinais, por isso
 * um erro de tile é falha do serviço, não «zona vazia». Basta um tile bom
 * para a camada estar viva; só com SEAMARKS_DOWN_AFTER erros seguidos e
 * nenhum tile carregado a damos como indisponível. Um tile que carregue
 * depois repõe o estado (o serviço voltou).
 */
export const SEAMARKS_DOWN_AFTER = 4;

export interface SeamarksTally {
  loads: number;
  errors: number;
}

export type SeamarksEvent = 'load' | 'error';

export function nextSeamarksTally(prev: SeamarksTally, ev: SeamarksEvent): SeamarksTally {
  // Um tile bom zera os erros: o serviço está a responder.
  if (ev === 'load') return { loads: prev.loads + 1, errors: 0 };
  return { loads: prev.loads, errors: prev.errors + 1 };
}

export function seamarksDown(tally: SeamarksTally): boolean {
  return tally.errors >= SEAMARKS_DOWN_AFTER;
}
