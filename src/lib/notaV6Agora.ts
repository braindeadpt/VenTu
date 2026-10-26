/**
 * Motor único (#218), PR 3: a nota v6 «agora» do /mapa e das listagens.
 *
 * O pipeline (`scripts/build-nota-v6-agora.js`, depois do merge das
 * observações) escreve em cada linha do `conditions.json` um
 * `notaV6: { t, kite, surf, seg, … }` com a linha «agora» de D4 — a dos
 * alertas: a hora coberta do forecast com as observações frescas por cima
 * (`alertRowAt` + `rawToScoreInput`, ver `notaV6AgoraBuild.ts`). O bake
 * (`buildSpotData`) e o refresh do cliente (`refreshGridSpotScores`) só
 * TRADUZEM esse objecto para o formato `SportScore` com
 * `sportScoreDeNotaV6` — uma atribuição por spot, zero cálculo do motor no
 * render. Marcadores, clusters, popup, pré-visualização, lista, filtros,
 * legenda e narrativa mudam de número sem mudar de código.
 *
 * Módulo LEVE de propósito (vai no bundle do /mapa): só a escala da nota e
 * as etiquetas; o motor v6, o editorial e a construção vivem em
 * `notaV6AgoraBuild.ts` (só pipeline / testes).
 */
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import {
  getAllSportScores,
  getScoreTierLabel,
  getSportScore,
  type Conditions,
  type SportScore,
  type WindSafetyLevel,
} from '@/lib/sportScore';
import { scoreTierFromScore } from '@/lib/nota';
import { getTranslation } from '@/lib/i18n';

/** Modalidades v6 do «agora» (as outras ficam no `sportScore`, D5). */
export type ModalidadeAgora = 'kite' | 'surf';

/**
 * O que o pipeline grava por spot (`conditions.json[id].notaV6`).
 * `kite` / `surf`: nota inteira /10 ou `null` (noite, ou sem dados quando a
 * modalidade vem em `sem`).
 */
export interface NotaV6Agora {
  /** Hora avaliada: etiqueta da hora coberta do forecast (16 caracteres). */
  t: string;
  kite: number | null;
  surf: number | null;
  /** Aviso de direcção do vento do kite (tecto de segurança #195). */
  seg?: WindSafetyLevel;
  /** Kite com vento forte (≥ 30 kt médios): «Só profissionais». */
  sp?: 1;
  /** Modalidades sem nota por falta de dados (sem elas, `null` = noite). */
  sem?: ModalidadeAgora[];
  /** Factores (`factorsEn` do adaptador `notaUnica.sportScoreDeV6`), por ordem do que pesa. */
  f?: Partial<Record<ModalidadeAgora, string[]>>;
}

/** `SportScore` do «agora» v6, com o que o v6 sabe a mais. */
export interface SportScoreAgoraV6 extends SportScore {
  /** Sol abaixo do limiar da definição: sem nota (score 0, não é «0 · Não dá»). */
  noite?: true;
  /** A fonte não traz o que a modalidade precisa nesta hora. */
  semDados?: true;
  /** Kite com vento forte: «Só profissionais». */
  soProfissionais?: true;
}

const SEG_OK = new Set<string>(['offshore', 'side-offshore']);
const MOD_OK = new Set<string>(['kite', 'surf']);
const notaOk = (x: unknown): x is number | null =>
  x === null || (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 10);

/** Valida (sem confiar no ficheiro servido) o `notaV6` de uma linha; `null` se ausente ou estragado. */
export function lerNotaV6Agora(x: unknown): NotaV6Agora | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== 'string' || !notaOk(o.kite) || !notaOk(o.surf)) return null;
  const out: NotaV6Agora = { t: o.t, kite: o.kite, surf: o.surf };
  if (typeof o.seg === 'string' && SEG_OK.has(o.seg)) out.seg = o.seg as WindSafetyLevel;
  if (o.sp === 1) out.sp = 1;
  if (Array.isArray(o.sem)) {
    const sem = o.sem.filter((m): m is ModalidadeAgora => typeof m === 'string' && MOD_OK.has(m));
    if (sem.length) out.sem = sem;
  }
  if (o.f && typeof o.f === 'object') {
    const f: NotaV6Agora['f'] = {};
    for (const m of ['kite', 'surf'] as const) {
      const v = (o.f as Record<string, unknown>)[m];
      if (Array.isArray(v) && v.every((s) => typeof s === 'string')) f[m] = v as string[];
    }
    if (f.kite || f.surf) out.f = f;
  }
  return out;
}

/**
 * `notaV6` do PRÓPRIO spot (`conditions.json[spot.id]`): os spots com
 * `conditionsSource` partilham as condições da fonte, mas a nota depende da
 * praia de cada um (editorial), por isso o pipeline grava uma por spot.
 */
export function notaV6DoSpot(spot: Pick<Spot, 'id'>, conditionsJson: Record<string, unknown>): NotaV6Agora | null {
  const own = conditionsJson[spot.id];
  return own && typeof own === 'object' ? lerNotaV6Agora((own as Record<string, unknown>).notaV6) : null;
}

const PT_DE_EN: ReadonlyArray<[RegExp, string]> = [
  [/^(\S+)kt wind$/, '$1kt vento'],
  [/^(\S+)m waves$/, '$1m ondas'],
  [/^(\S+)s period$/, '$1s período'],
  [/^Small waves$/, 'Ondas pequenas'],
];

/** Os factores PT do adaptador são os EN com as palavras traduzidas (`notaUnica.factoresDe`). */
function factorPt(en: string): string {
  for (const [re, pt] of PT_DE_EN) if (re.test(en)) return en.replace(re, pt);
  return en;
}

/**
 * O `notaV6` do pipeline → `SportScore` (o mesmo formato que
 * `notaUnica.sportScoreDeV6` dá a partir da avaliação v6):
 * `score` = nota × 10 (as bandas e o «Só ON» ≥ 65 coincidem com `bandaDe(n)`),
 * noite / sem dados → `score: 0`, `rating: 'N/A'` e a marca `noite` / `semDados`;
 * `directionSafety` / `warning` de `seg` com as strings `windSafety` do motor antigo.
 */
export function sportScoreDeNotaV6(nv: NotaV6Agora, d: ModalidadeAgora): SportScoreAgoraV6 {
  const n = nv[d];
  const score = n == null ? 0 : Math.max(0, Math.min(100, Math.round(n * 10)));
  const factorsEn = n == null ? [] : (nv.f?.[d] ?? []);
  const tier = scoreTierFromScore(score);
  const primary = factorsEn.find((f) => (d === 'kite' ? /kt wind$/.test(f) : /m waves$/.test(f)));
  const out: SportScoreAgoraV6 = {
    score,
    rating: score > 0 ? getScoreTierLabel(tier, 'pt') : 'N/A',
    ratingEn: score > 0 ? getScoreTierLabel(tier, 'en') : 'N/A',
    factors: factorsEn.map(factorPt),
    factorsEn: [...factorsEn],
    primaryFactor: primary ? primary.replace(/ (wind|waves)$/, '') : '',
  };
  if (n == null) {
    if (nv.sem?.includes(d)) out.semDados = true;
    else out.noite = true;
  }
  if (d === 'kite' && n != null) {
    if (nv.seg) {
      const key = nv.seg === 'offshore' ? 'offshore' : 'sideOffshore';
      out.directionSafety = nv.seg;
      out.warning = getTranslation('pt').windSafety[key];
      out.warningEn = getTranslation('en').windSafety[key];
    }
    if (nv.sp) {
      out.soProfissionais = true;
      // o aviso de direcção (offshore) ganha; senão, o do vento forte
      if (!out.warning) {
        out.warning = getTranslation('pt').windSafety.soProfissionais;
        out.warningEn = getTranslation('en').windSafety.soProfissionais;
      }
    }
  }
  return out;
}

/** Modalidades que ficam no `sportScore` (D5); a Big Wave lê o surf (D8). */
export const DESPORTOS_MOTOR_ANTIGO: readonly SportType[] = ['windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'];

/** Só as modalidades do motor antigo (sem kitesurf nem surf). */
export function scoresMotorAntigo(spot: Spot, input: Conditions): Partial<Record<SportType, SportScore>> {
  const out: Partial<Record<SportType, SportScore>> = {};
  for (const s of DESPORTOS_MOTOR_ANTIGO) out[s] = getSportScore(spot, s, input);
  return out;
}

/**
 * `allScores` de uma linha: kitesurf e surf do `notaV6` do pipeline (uma
 * atribuição, sem motor), bodyboard / windsurf / foil / wakeboard / sup no
 * `sportScore` (D5). Sem `notaV6` (um `conditions.json` anterior ao PR 3, até
 * ao primeiro run do pipeline) → o motor antigo nas 7, como até aqui.
 */
export function allScoresComV6(
  spot: Spot,
  input: Conditions,
  nv: NotaV6Agora | null,
): Record<SportType, SportScore> {
  if (!nv) return getAllSportScores(spot, input);
  return {
    ...scoresMotorAntigo(spot, input),
    kitesurf: sportScoreDeNotaV6(nv, 'kite'),
    surf: sportScoreDeNotaV6(nv, 'surf'),
  } as Record<SportType, SportScore>;
}
