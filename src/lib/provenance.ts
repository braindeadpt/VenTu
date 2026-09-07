/**
 * VenTu — gramática única de proveniência.
 *
 * O VenTu mostra sempre de onde vem cada número: é isso que separa um score
 * honesto de um número inventado, e é a razão pela qual a proveniência fica
 * VISÍVEL (e não escondida atrás de um ⓘ). O problema nunca foi mostrá-la —
 * foi mostrá-la em oito dialectos: raios diferentes (`rounded` vs `rounded-pill`),
 * escalas de texto diferentes (`text-xs` vs `text-meta-sm`), uns componentes com
 * ícone e outros sem, bordas a /30 num sítio e a /40 no outro, e dois mecanismos
 * de detalhe incompatíveis (`title` nativo — invisível no telemóvel e ao teclado
 * — contra popover portalizado).
 *
 * Este módulo define COMO a proveniência se mostra. As FRASES continuam a viver
 * no domínio (`scoreConditions`, `forecastConfidence`, `observedWave`,
 * `dataFreshness`), que é onde a honestidade é calculada.
 *
 * Três perguntas, um vocabulário:
 *   1. De onde vem este número?  → tier (measured | adjusted | modeled)
 *   2. Sobre que grandeza?       → axis  (wave | wind | calibration | …)
 *   3. A fonte está de pé?       → tier `degraded`
 */

/**
 * Origem do número — a única escala de cor da proveniência.
 *
 * A cor NUNCA codifica «bom/mau»: um `modeled` neutro não é um defeito, é
 * uma previsão. Só `degraded` é vermelho, porque só aí a fonte falhou.
 */
export type ProvenanceTier =
  /** Medição real (boia, estação IPMA/Ecowitt/METAR). */
  | 'measured'
  /** Previsão corrigida por observação (viés regional, recalibração, proxy). */
  | 'adjusted'
  /** Previsão pura do modelo — sem correcção. */
  | 'modeled'
  /** A fonte está em baixo, sem chave, ou a leitura está velha. */
  | 'degraded';

/** Grandeza a que a afirmação de proveniência se refere. */
export type ProvenanceAxis =
  | 'wave'
  | 'wind'
  | 'calibration'
  | 'confidence'
  | 'freshness';

/**
 * Classes por tier — bordas, fundo e tinta com o MESMO peso em toda a app.
 *
 * Antes: onda/vento a `/40`, confiança a `/30`, frescura com `rounded` e um
 * um fundo mais opaco. Três pesos para a mesma ideia. Agora, um.
 */
export const PROVENANCE_TIER_CLASS: Record<ProvenanceTier, string> = {
  measured: 'border-score-good/40 bg-score-good/10 text-score-good',
  adjusted: 'border-score-fair/40 bg-score-fair/10 text-score-fair',
  modeled: 'border-divider bg-surface-1/[0.04] text-fg-muted',
  degraded: 'border-score-poor/40 bg-score-poor/10 text-score-poor',
};

/**
 * Ordem de leitura canónica de uma fila de proveniência.
 *
 * Sempre a mesma, em todas as superfícies: primeiro o que alimentou o score
 * (onda, vento), depois o ajuste aplicado (calibração), depois o quanto
 * confiamos (confiança) e por fim há quanto tempo (frescura). Uma fila que
 * muda de ordem entre o hero e o card obriga a reler — e reler é o oposto
 * de escanear.
 */
export const PROVENANCE_AXIS_ORDER: readonly ProvenanceAxis[] = [
  'wave',
  'wind',
  'calibration',
  'confidence',
  'freshness',
] as const;

/** Índice de ordenação de um eixo (desconhecidos vão para o fim). */
export function provenanceAxisRank(axis: ProvenanceAxis): number {
  const i = PROVENANCE_AXIS_ORDER.indexOf(axis);
  return i === -1 ? PROVENANCE_AXIS_ORDER.length : i;
}

/**
 * Escala de tamanho — duas, e só duas.
 *
 * `sm` para filas dentro de cards; `md` para o cartão de score do hero. Ambas
 * partilham raio (pill), peso (medium) e a mesma família de tokens de texto,
 * para que dois chips lado a lado nunca tenham alturas diferentes.
 */
export const PROVENANCE_SIZE_CLASS = {
  sm: 'gap-1 px-2 py-0.5 text-meta-sm',
  md: 'gap-1.5 px-2.5 py-1 text-meta',
} as const;

export type ProvenanceSize = keyof typeof PROVENANCE_SIZE_CLASS;

/** Dimensão do glifo por tamanho — o ícone acompanha o texto, não flutua. */
export const PROVENANCE_ICON_CLASS: Record<ProvenanceSize, string> = {
  sm: 'w-3 h-3 shrink-0',
  md: 'w-3.5 h-3.5 shrink-0',
};

/** Prefixo do `aria-label` — diz ao leitor de ecrã de que eixo se trata. */
export function provenanceAxisAria(axis: ProvenanceAxis, isPt: boolean): string {
  switch (axis) {
    case 'wave':
      return isPt ? 'Fonte da onda' : 'Wave source';
    case 'wind':
      return isPt ? 'Fonte do vento' : 'Wind source';
    case 'calibration':
      return isPt ? 'Calibração da leitura' : 'Reading calibration';
    case 'confidence':
      return isPt ? 'Confiança da previsão' : 'Forecast confidence';
    case 'freshness':
      return isPt ? 'Frescura dos dados' : 'Data freshness';
  }
}
