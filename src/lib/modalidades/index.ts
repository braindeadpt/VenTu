/**
 * Modalidades v6 (#184, partilhado com a home #183).
 *
 * - O motor é `avalia.ts` (porta do `modalidades-avalia.js`), lido da
 *   definição `modalidades-def.json`. O JSON não se corta: o modelo continua a
 *   aceitar windsurf, foil, bodyboard…, mas a UI só expõe `MODALIDADES_VISIVEIS`.
 * - Escala e bandas: só as da #210 (`src/lib/nota.ts`). Nenhum limiar aqui.
 * - Segurança do vento (#192/#210) por cima do motor, só nas modalidades de
 *   vento: side-offshore limita a nota a 5,0 e offshore a 2,5 (/10), com a
 *   mesma classificação (`windSportDirectionSafety`). O tecto arredonda PARA
 *   BAIXO (2,5 → 2 · Não dá): arredondar ao meio mostrava o tecto offshore
 *   como «3 · Fraco», acima do próprio tecto (auditoria de dados 16/10, M7).
 * - Sem dados (auditoria 16/10, M2): uma hora sem vento (lógica de vento) ou
 *   sem onda (lógica de onda) na fonte não tem nota: `n = null` com
 *   `semDados: true` (a UI diz «sem dados», não «noite» nem 0).
 */
import defJson from './modalidades-def.json';
import {
  modAvalia,
  type Avaliacao,
  type DefModalidade,
  type HoraModalidade,
  type ModalidadesDef,
  type SpotModalidade,
} from './avalia';
import { notaTier, NOTA_BAND_MIN } from '@/lib/nota';
import { windSportDirectionSafety, type WindSafetyLevel } from '@/lib/sportScore';
import type { Spot } from '@/types';

export * from './avalia';

export const MODALIDADES_DEF = defJson as unknown as ModalidadesDef;

/** Modalidades que a UI mostra (#184: só kite e surf, por esta ordem). */
export const MODALIDADES_VISIVEIS = ['kite', 'surf'] as const;
export type Modalidade = (typeof MODALIDADES_VISIVEIS)[number];
export const MODALIDADE_OMISSAO: Modalidade = 'kite';

export function isModalidade(x: unknown): x is Modalidade {
  return typeof x === 'string' && (MODALIDADES_VISIVEIS as readonly string[]).includes(x);
}

/** «Dá» a partir daqui: o mínimo da banda «Dá» da #210. */
export const DA = NOTA_BAND_MIN.fair;

export const MOTOR = modAvalia(MODALIDADES_DEF, { DA });

export function defDe(d: Modalidade): DefModalidade {
  return MODALIDADES_DEF.def[d] as DefModalidade;
}

/** Banda v6 (chaves de `cores.md`). */
export type BandaK = 'nao' | 'fraco' | 'da' | 'bom' | 'mb' | 'noite';
export const BANDAS_ORDEM: ReadonlyArray<Exclude<BandaK, 'noite'>> = ['nao', 'fraco', 'da', 'bom', 'mb'];

/** Banda de uma nota /10 (inteira), pela escala da #210; `null` → noite. */
export function bandaDe(n: number | null): BandaK {
  if (n == null) return 'noite';
  switch (notaTier(n)) {
    case 'epic':
      return 'mb';
    case 'good':
      return 'bom';
    case 'fair':
      return 'da';
    case 'poor':
      return 'fraco';
    default:
      return 'nao';
  }
}

/** Posição da banda (noite = −1), para comparar janelas como na maquete. */
export const bandaRank = (b: BandaK) => (b === 'noite' ? -1 : BANDAS_ORDEM.indexOf(b));

/** Nota mínima de cada banda (para «a partir de»). */
export const BANDA_MIN: Record<Exclude<BandaK, 'noite'>, number> = {
  nao: 0,
  fraco: NOTA_BAND_MIN.poor,
  da: NOTA_BAND_MIN.fair,
  bom: NOTA_BAND_MIN.good,
  mb: NOTA_BAND_MIN.epic,
};

export interface AvaliacaoHora extends Avaliacao {
  /** A fonte não traz o que esta modalidade precisa nesta hora: `n = null`, mas não é noite. */
  semDados?: true;
  /** Nota do motor antes do tecto de segurança (paridade com a maquete). */
  nMotor: number | null;
  /** Componente offshore do vento (só modalidades de vento). */
  seguranca: WindSafetyLevel | null;
}

/**
 * Tecto da nota inteira para um nível de segurança: arredonda para baixo, para
 * a nota mostrada nunca passar o tecto (offshore 2,5 → 2 · Não dá; side-offshore
 * 5,0 → 5 · Dá). Auditoria de dados 16/10 (M7): `Math.round(2.5) = 3 · Fraco`.
 */
export function tectoSeguranca(cap: number | null): number | null {
  return cap == null ? null : Math.max(0, Math.min(10, Math.floor(cap + 1e-9)));
}

/** Avalia as horas de um spot numa modalidade (motor + tecto de segurança do vento). */
export function avaliaHoras(
  sp: SpotModalidade,
  d: Modalidade,
  horas: readonly HoraModalidade[],
): AvaliacaoHora[] {
  const L = MOTOR.para(sp);
  const def = defDe(d);
  const coast = { coastOrientation: sp.praiaVirada, aguaInterior: sp.aguaInterior ? true : undefined } as Spot;
  const precisa = def.logica === 'vento' ? 'vento' : def.logica === 'onda' ? 'onda' : null;
  return horas.map((h) => {
    if (precisa && h.semDados?.includes(precisa))
      return { n: null, f: { vento: 0, onda: 0, mare: 0 }, nMotor: null, seguranca: null, semDados: true as const };
    const r = L.avalia(d, h);
    if (def.logica !== 'vento' || r.n == null) return { ...r, nMotor: r.n, seguranca: null };
    const s = windSportDirectionSafety(coast, h.wd);
    const tecto = tectoSeguranca(s.scoreCap);
    const n = tecto != null ? Math.min(r.n, tecto) : r.n;
    return { ...r, n, nMotor: r.n, seguranca: s.safety };
  });
}
