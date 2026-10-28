/**
 * Motor único (#218), PR 3 (+ PR 6): a nota v6 «agora» do /mapa e das listagens.
 *
 * O pipeline (`scripts/build-nota-v6-agora.js`, depois do merge das
 * observações) escreve em cada linha do `conditions.json` um
 * `notaV6: { t, kite, surf, windsurf, bodyboard, foil, … }` com a linha
 * «agora» de D4 — a dos
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
  getScoreTierLabel,
  getSportScore,
  type Conditions,
  type SportScore,
  type WindSafetyLevel,
} from '@/lib/sportScore';
import { scoreTierFromScore } from '@/lib/nota';
import { getTranslation } from '@/lib/i18n';
import {
  DESPORTO_PARA_AGORA,
  DESPORTOS_MOTOR_ANTIGO,
  isDesportoMotorAntigo,
  type DesportoMotorAntigo,
  type ModalidadeAgora,
} from '@/lib/desportosV6';

export type { ModalidadeAgora } from '@/lib/desportosV6';
export { DESPORTOS_MOTOR_ANTIGO } from '@/lib/desportosV6';

/** Modalidades de vento com aviso de direcção fora do kite (o do kite é `seg`). */
export type ModalidadeAgoraSeg = 'windsurf' | 'foil';
/** Vertente do foil que deu a nota (`def.foil.vertentes`). */
export type VertenteFoilAgora = 'wing' | 'kitefoil' | 'surffoil';

/**
 * O que o pipeline grava por spot (`conditions.json[id].notaV6`).
 * Cada modalidade: nota inteira /10 ou `null` (noite, ou sem dados quando a
 * modalidade vem em `sem`). `windsurf`, `bodyboard` e `foil` chegaram no PR 6:
 * num ficheiro anterior faltam e essas modalidades ficam «sem dados» até ao
 * run seguinte do pipeline (o motor antigo delas já não existe).
 */
export interface NotaV6Agora {
  /** Hora avaliada: etiqueta da hora coberta do forecast (16 caracteres). */
  t: string;
  kite: number | null;
  surf: number | null;
  windsurf?: number | null;
  bodyboard?: number | null;
  /** A melhor das três vertentes (wing, kitefoil, surffoil). */
  foil?: number | null;
  /** Vertente do foil que deu a nota (só quando há nota). */
  vf?: VertenteFoilAgora;
  /** Aviso de direcção do vento do kite (tecto de segurança #195). */
  seg?: WindSafetyLevel;
  /** O mesmo aviso no windsurf e no foil (só quando existe). */
  sg?: Partial<Record<ModalidadeAgoraSeg, WindSafetyLevel>>;
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

/** Chaves das modalidades do `notaV6`, pela ordem em que o pipeline as grava. */
export const MODALIDADES_AGORA: readonly ModalidadeAgora[] = ['kite', 'surf', 'windsurf', 'bodyboard', 'foil'];
const SEG_OK = new Set<string>(['offshore', 'side-offshore']);
const MOD_OK = new Set<string>(MODALIDADES_AGORA);
const VF_OK = new Set<string>(['wing', 'kitefoil', 'surffoil']);
const notaOk = (x: unknown): x is number | null =>
  x === null || (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 10);

/** Valida (sem confiar no ficheiro servido) o `notaV6` de uma linha; `null` se ausente ou estragado. */
export function lerNotaV6Agora(x: unknown): NotaV6Agora | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== 'string' || !notaOk(o.kite) || !notaOk(o.surf)) return null;
  const out: NotaV6Agora = { t: o.t, kite: o.kite, surf: o.surf };
  // PR 6: as outras modalidades v6 (podem faltar num ficheiro anterior; estragadas → ausentes)
  for (const m of ['windsurf', 'bodyboard', 'foil'] as const) if (notaOk(o[m])) out[m] = o[m] as number | null;
  if (typeof o.vf === 'string' && VF_OK.has(o.vf)) out.vf = o.vf as VertenteFoilAgora;
  if (typeof o.seg === 'string' && SEG_OK.has(o.seg)) out.seg = o.seg as WindSafetyLevel;
  if (o.sg && typeof o.sg === 'object') {
    const sg: NonNullable<NotaV6Agora['sg']> = {};
    for (const m of ['windsurf', 'foil'] as const) {
      const v = (o.sg as Record<string, unknown>)[m];
      if (typeof v === 'string' && SEG_OK.has(v)) sg[m] = v as WindSafetyLevel;
    }
    if (sg.windsurf || sg.foil) out.sg = sg;
  }
  if (o.sp === 1) out.sp = 1;
  if (Array.isArray(o.sem)) {
    const sem = o.sem.filter((m): m is ModalidadeAgora => typeof m === 'string' && MOD_OK.has(m));
    if (sem.length) out.sem = sem;
  }
  if (o.f && typeof o.f === 'object') {
    const f: NotaV6Agora['f'] = {};
    for (const m of MODALIDADES_AGORA) {
      const v = (o.f as Record<string, unknown>)[m];
      if (Array.isArray(v) && v.every((s) => typeof s === 'string')) f[m] = v as string[];
    }
    if (Object.keys(f).length) out.f = f;
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

/** A nota é de uma lógica de onda (surf, bodyboard, foil na vertente surffoil)? Decide o factor principal. */
function deOnda(nv: NotaV6Agora, d: ModalidadeAgora): boolean {
  return d === 'surf' || d === 'bodyboard' || (d === 'foil' && nv.vf === 'surffoil');
}

/** Aviso de direcção do vento desta modalidade (kite: `seg`; windsurf / foil: `sg`). */
function segDe(nv: NotaV6Agora, d: ModalidadeAgora): WindSafetyLevel | undefined {
  if (d === 'kite') return nv.seg;
  if (d === 'windsurf' || d === 'foil') return nv.sg?.[d];
  return undefined;
}

/**
 * O `notaV6` do pipeline → `SportScore` (o mesmo formato que
 * `notaUnica.sportScoreDeV6` dá a partir da avaliação v6):
 * `score` = nota × 10 (as bandas e o «Só ON» ≥ 65 coincidem com `bandaDe(n)`),
 * noite / sem dados → `score: 0`, `rating: 'N/A'` e a marca `noite` / `semDados`
 * (uma modalidade que o ficheiro não traz — anterior ao PR 6 — é «sem dados»);
 * `directionSafety` / `warning` de `seg` / `sg` com as strings `windSafety`.
 */
export function sportScoreDeNotaV6(nv: NotaV6Agora, d: ModalidadeAgora): SportScoreAgoraV6 {
  const v = nv[d];
  const n = v === undefined ? null : v;
  const score = n == null ? 0 : Math.max(0, Math.min(100, Math.round(n * 10)));
  const factorsEn = n == null ? [] : (nv.f?.[d] ?? []);
  const tier = scoreTierFromScore(score);
  const onda = deOnda(nv, d);
  const primary = factorsEn.find((f) => (onda ? /m waves$/.test(f) : /kt wind$/.test(f)));
  const out: SportScoreAgoraV6 = {
    score,
    rating: score > 0 ? getScoreTierLabel(tier, 'pt') : 'N/A',
    ratingEn: score > 0 ? getScoreTierLabel(tier, 'en') : 'N/A',
    factors: factorsEn.map(factorPt),
    factorsEn: [...factorsEn],
    primaryFactor: primary ? primary.replace(/ (wind|waves)$/, '') : '',
  };
  if (n == null) {
    if (v === undefined || nv.sem?.includes(d)) out.semDados = true;
    else out.noite = true;
  } else {
    const seg = segDe(nv, d);
    if (seg) {
      const key = seg === 'offshore' ? 'offshore' : 'sideOffshore';
      out.directionSafety = seg;
      out.warning = getTranslation('pt').windSafety[key];
      out.warningEn = getTranslation('en').windSafety[key];
    }
    if (d === 'kite' && nv.sp) {
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

/** Sem `notaV6` (ficheiro sem pipeline): as modalidades v6 ficam «sem dados» (o motor antigo delas já não existe). */
export function semNotaV6(): SportScoreAgoraV6 {
  return { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: [], factorsEn: [], primaryFactor: '', semDados: true };
}

/** Só as modalidades do motor antigo (SUP e wakeboard). */
export function scoresMotorAntigo(spot: Spot, input: Conditions): Record<DesportoMotorAntigo, SportScore> {
  const out = {} as Record<DesportoMotorAntigo, SportScore>;
  for (const s of DESPORTOS_MOTOR_ANTIGO) out[s] = getSportScore(spot, s, input);
  return out;
}

/**
 * `allScores` de uma linha: surf, kitesurf, windsurf, bodyboard e foil do
 * `notaV6` do pipeline (uma atribuição, sem motor), SUP e wakeboard no
 * `sportScore` (PR 6). Sem `notaV6` → as v6 ficam «sem dados» (score 0).
 */
export function allScoresComV6(
  spot: Spot,
  input: Conditions,
  nv: NotaV6Agora | null,
): Record<SportType, SportScore> {
  const out = { ...scoresMotorAntigo(spot, input) } as Record<SportType, SportScore>;
  for (const [sport, d] of Object.entries(DESPORTO_PARA_AGORA) as Array<[SportType, ModalidadeAgora]>) {
    out[sport] = nv ? sportScoreDeNotaV6(nv, d) : semNotaV6();
  }
  return out;
}

/**
 * O score «agora» de UM desporto para as páginas que só mostram uma
 * modalidade (favoritos, picker do comparar): as v6 do `notaV6` do pipeline
 * (o mesmo número do /mapa, das listas e do alerta), SUP e wakeboard no
 * `sportScore`. Sem `notaV6` → «sem dados» nas v6, como `allScoresComV6`.
 */
export function scoreAgoraComV6(
  spot: Spot,
  sport: SportType,
  input: Conditions,
  nv: NotaV6Agora | null,
): SportScoreAgoraV6 {
  if (isDesportoMotorAntigo(sport)) return getSportScore(spot, sport, input);
  const d = DESPORTO_PARA_AGORA[sport];
  return d && nv ? sportScoreDeNotaV6(nv, d) : semNotaV6();
}

/**
 * A modalidade está «sem dados» (v6 sem `notaV6` no ficheiro, ou sem o que a
 * modalidade precisa)? Compare / Favoritos mostram «Sem dados» e «—» em vez
 * de «0/10 · N/A» (#218, PR 6, decisão do Pedro 27/10).
 */
export function isSemDados(s: unknown): boolean {
  return !!s && typeof s === 'object' && (s as SportScoreAgoraV6).semDados === true;
}
