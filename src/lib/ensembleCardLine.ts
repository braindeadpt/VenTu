/**
 * A linha secundária do cartão Onda (o «foot») é UM slot, não uma lista: existe
 * SEMPRE, com a mesma caixa, e só muda de conteúdo. Foi esta a correcção pedida
 * pela auditoria de 25/09 ao f2508ce66 — lá a banda era uma linha EXTRA que só
 * aparecia nas horas multi-modelo, e o cartão mudava de altura com a hora
 * escolhida (a página saltava ao mexer na régua e entre o HTML do build e o
 * relógio vivo). Mesma classe do CLS do hero (a737f4184).
 *
 * Prioridade (uma linha, sempre):
 *   1. banda ensemble da hora — é a incerteza do número grande, logo acima;
 *   2. mar de fundo (o que a linha mostrava antes, e continua a mostrar nas
 *      horas sem banda);
 *   3. nada — o placeholder mantém a caixa.
 *
 * O detalhe técnico (P10/P50/P90 por família, nº de modelos, skill por
 * horizonte) não vive aqui: vai para «Como sabemos» (regra v3 §8).
 */
import { isPublishableBand, type EnsembleFamily } from './ensembleBand';

/**
 * Placeholder da linha vazia: NBSP (U+00A0), não um espaço normal. Um espaço
 * normal colapsa com o whitespace do JSX e a linha perde a ALTURA — foi a
 * regressão do f2508ce66 (auditoria, ponto 3). Como constante, a unidade de
 * teste apanha a troca sem depender do ficheiro do cartão.
 */
export const SAME_BOX_PLACEHOLDER = '\u00A0';

export type EnsembleCardLine =
  | { kind: 'band'; p10: number; p90: number; n: number }
  | { kind: 'swell'; heightM: number; periodS: number }
  | { kind: 'blank' };

/**
 * Decide o conteúdo do slot a partir da hora escolhida. Puro: não formata nem
 * traduz — o cartão é que aplica `getInstrumentFmt` e as chaves i18n.
 *
 * A banda só entra com quantis finitos e membros ≥ ENSEMBLE_MIN_MEMBERS (o
 * mesmo gate do produtor, reaplicado aqui porque a leitura de uma família pode
 * vir de um `ens` externo). Sem banda válida cai para o mar de fundo, e sem
 * mar de fundo para o placeholder — nunca inventa um intervalo.
 */
export function ensembleCardLine(input: {
  band?: EnsembleFamily | null;
  swellHeightM?: number;
  swellPeriodS?: number;
}): EnsembleCardLine {
  const { band, swellHeightM, swellPeriodS } = input;
  if (isPublishableBand(band)) {
    return { kind: 'band', p10: band.p10, p90: band.p90, n: band.n };
  }
  if (swellHeightM !== undefined && swellPeriodS !== undefined) {
    return { kind: 'swell', heightM: swellHeightM, periodS: swellPeriodS };
  }
  return { kind: 'blank' };
}
