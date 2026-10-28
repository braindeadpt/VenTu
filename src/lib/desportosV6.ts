/**
 * Motor único (#218), PR 6: que modalidade do site pontua em que motor, e a
 * regra do «Todos» (`best`). Módulo LEVE de propósito (vai no bundle do /mapa:
 * só tipos e `getCompatibleSports`, nada do motor).
 *
 * - Surf, kitesurf, windsurf, bodyboard e foil → motor v6 (o foil é a melhor
 *   das três vertentes — wing, kitefoil, surffoil — em cada hora). A Big Wave
 *   lê o surf v6 (D8).
 * - SUP e wakeboard → motor antigo (`sportScore`): o SUP não tem definição v6
 *   e a lógica `plana` do wakeboard só pontua água plana curada, que nenhum
 *   spot de wake é (decisão do Pedro, 27/10).
 * - «Todos» = o máximo das modalidades v6 com nota. O SUP e o wakeboard só
 *   contam num spot que não tenha nenhuma modalidade v6 compatível (um
 *   wakepark, um spot só de SUP): assim o «Todos» nunca compara escalas de dois
 *   motores. Com as v6 todas sem nota (noite) o «Todos» também é noite.
 * - Alertas de condições (email / Telegram): o wakeboard está DESLIGADO por
 *   agora (decisão do Pedro, 27/10) — ver `temAlertasCondicoes`.
 */
import type { Spot } from '@/types';
import { ALL_SPORTS, getCompatibleSports, type SportType } from '@/lib/sportRatings';

/** Chave do `notaV6` «agora» (pipeline) de cada desporto v6. */
export type ModalidadeAgora = 'kite' | 'surf' | 'windsurf' | 'bodyboard' | 'foil';

/** Desporto do site → chave v6 (os que não estão aqui ficam no motor antigo). */
export const DESPORTO_PARA_AGORA: Readonly<Partial<Record<SportType, ModalidadeAgora>>> = {
  kitesurf: 'kite',
  surf: 'surf',
  windsurf: 'windsurf',
  bodyboard: 'bodyboard',
  foil: 'foil',
};

/** Desportos do site no motor v6, pela ordem do `ALL_SPORTS`. */
export const DESPORTOS_V6: readonly SportType[] = ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'foil'];

/** Desportos que ficam no motor antigo (`sportScore`). */
export const DESPORTOS_MOTOR_ANTIGO = ['wakeboard', 'sup'] as const;
export type DesportoMotorAntigo = (typeof DESPORTOS_MOTOR_ANTIGO)[number];

export function isDesportoV6(sport: SportType): boolean {
  return DESPORTO_PARA_AGORA[sport] != null;
}

export function isDesportoMotorAntigo(sport: SportType): sport is DesportoMotorAntigo {
  return sport === 'wakeboard' || sport === 'sup';
}

type SpotTodos = Pick<Spot, 'type' | 'compatibleSports'>;

/** O spot tem pelo menos uma modalidade v6 compatível? (senão o «Todos» lê o SUP / wakeboard). */
export function spotTemModalidadeV6(spot: SpotTodos): boolean {
  return getCompatibleSports(spot as Spot).some(isDesportoV6);
}

/** Desportos que entram no «Todos» deste spot: as v6, ou o SUP / wakeboard num spot sem nenhuma v6. */
export function desportosTodos(spot: SpotTodos): readonly SportType[] {
  return spotTemModalidadeV6(spot) ? DESPORTOS_V6 : DESPORTOS_MOTOR_ANTIGO;
}

/**
 * «Todos» a partir de um valor por desporto (`null`/`undefined` = sem nota):
 * máximo das v6 com nota; num spot sem modalidade v6 compatível, máximo do SUP
 * e do wakeboard. `null` quando nenhuma das que contam tem nota (noite).
 */
export function melhorTodos(spot: SpotTodos, valorDe: (sport: SportType) => number | null | undefined): number | null {
  let best: number | null = null;
  for (const s of desportosTodos(spot)) {
    const v = valorDe(s);
    if (typeof v === 'number' && Number.isFinite(v) && (best == null || v > best)) best = v;
  }
  return best;
}

/** «Todos» de um `allScores` (o score de noite é 0, por isso o resultado é sempre um número ≥ 0). */
export function scoreTodos(
  spot: SpotTodos,
  allScores: Partial<Record<SportType, { score?: number } | undefined>>,
): number {
  return Math.max(0, melhorTodos(spot, (s) => allScores[s]?.score || 0) ?? 0);
}

/** O desporto do «Todos» (o que tem o score mais alto entre os que contam; empate → o primeiro). */
export function desportoTodos(
  spot: SpotTodos,
  allScores: Partial<Record<SportType, { score?: number } | undefined>>,
): SportType | null {
  let best: SportType | null = null;
  let bestScore = 0;
  for (const s of desportosTodos(spot)) {
    const v = allScores[s]?.score || 0;
    if (v > bestScore) {
      best = s;
      bestScore = v;
    }
  }
  return best;
}

/**
 * Desportos SEM alertas de condições (email / Telegram). O wakeboard está
 * desligado por agora (#218, PR 6, decisão do Pedro 27/10): o `plana` do v6 não
 * pontua nenhum spot de wake (nenhum é água plana curada) e o motor antigo, que
 * a lista e o /mapa ainda usam para o wake, não é o dos alertas. Os avisos
 * oficiais (IPMA / costeiros) dos favoritos continuam a seguir.
 */
export const DESPORTOS_SEM_ALERTAS: readonly string[] = ['wakeboard'];

/** O desporto tem alertas de condições? (`false` → o alerta nunca dispara; o formulário não o oferece.) */
export function temAlertasCondicoes(sport: string): boolean {
  return !DESPORTOS_SEM_ALERTAS.includes(sport);
}

/** Desportos que o formulário de alertas oferece, pela ordem do `ALL_SPORTS`. */
export const DESPORTOS_ALERTAS: readonly SportType[] = ALL_SPORTS.filter((s) => temAlertasCondicoes(s));
