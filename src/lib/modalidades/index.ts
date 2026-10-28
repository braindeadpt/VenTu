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
 * - Vento forte no kite (decisão do Pedro, 25/10): a partir de 30 kt de vento
 *   médio, lateral ou lateral de mar, a hora traz `soProfissionais: true` e a
 *   faixa (`forte`: forte / muito-forte / tempestade). A nota (para os outros
 *   níveis) fica baixa mas nunca abaixo do piso 3 (definição `kite.forte`). Os
 *   tectos de segurança de cima continuam por cima de tudo.
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

/**
 * Chaves da definição que o motor avalia para o site (#218, PR 6): as duas
 * visíveis e as que pontuam as outras modalidades do /mapa e das listas
 * (windsurf, bodyboard e as três vertentes do foil). A UI continua a mostrar só
 * `MODALIDADES_VISIVEIS`; o wakeboard (`plana`) fica de fora (motor antigo).
 */
export const MODALIDADES_MOTOR = ['kite', 'surf', 'windsurf', 'bodyboard', 'wing', 'kitefoil', 'surffoil'] as const;
export type ModalidadeMotor = (typeof MODALIDADES_MOTOR)[number];

/** As vertentes do foil (`def.foil.vertentes`): a nota do foil é a melhor das três em cada hora (decisão do Pedro, 27/10). */
export const VERTENTES_FOIL = ['wing', 'kitefoil', 'surffoil'] as const satisfies readonly ModalidadeMotor[];
export type VertenteFoil = (typeof VERTENTES_FOIL)[number];

/** «Dá» a partir daqui: o mínimo da banda «Dá» da #210. */
export const DA = NOTA_BAND_MIN.fair;

export const MOTOR = modAvalia(MODALIDADES_DEF, { DA });

export function defDe(d: ModalidadeMotor): DefModalidade {
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
  d: ModalidadeMotor,
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

/** Modalidade v6 de um desporto do site: uma chave do motor ou o foil (as três vertentes). */
export type ModalidadeSite = Exclude<ModalidadeMotor, VertenteFoil> | 'foil';

/** Avaliação de uma hora com a chave da definição que a deu (no foil, a vertente vencedora). */
export interface AvaliacaoHoraSite extends AvaliacaoHora {
  chave: ModalidadeMotor;
}

/**
 * O foil numa hora: a melhor das três vertentes pela nota final (já com o
 * tecto de segurança do vento). Empate → a primeira pela ordem de
 * `VERTENTES_FOIL`. Sem nota em nenhuma: «sem dados» só se faltam dados às
 * três; senão é noite (o sol é o mesmo para todas).
 */
export function melhorVertente(porVertente: ReadonlyArray<AvaliacaoHora>): AvaliacaoHoraSite {
  let best = -1;
  porVertente.forEach((a, i) => {
    if (a.n != null && (best < 0 || a.n > (porVertente[best].n as number))) best = i;
  });
  if (best < 0) {
    const i = porVertente.findIndex((a) => !a.semDados);
    best = i >= 0 ? i : 0;
  }
  return { ...porVertente[best], chave: VERTENTES_FOIL[best] };
}

/**
 * `avaliaHoras` para uma modalidade do site (#218, PR 6): as chaves simples
 * passam directas; o foil avalia as três vertentes e fica com a melhor em cada
 * hora (decisão do Pedro, 27/10).
 */
export function avaliaHorasSite(
  sp: SpotModalidade,
  d: ModalidadeSite,
  horas: readonly HoraModalidade[],
): AvaliacaoHoraSite[] {
  if (d !== 'foil') return avaliaHoras(sp, d, horas).map((a) => ({ ...a, chave: d }));
  const porVertente = VERTENTES_FOIL.map((v) => avaliaHoras(sp, v, horas));
  return horas.map((_, i) => melhorVertente(porVertente.map((av) => av[i])));
}
