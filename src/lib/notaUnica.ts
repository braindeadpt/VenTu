/**
 * Motor único (#218), PR 0: rede de segurança. Ainda NINGUÉM importa isto na
 * app — o comportamento do site não muda neste PR. Os PRs seguintes trocam o
 * motor antigo (`sportScore`) pelo v6 superfície a superfície, sempre através
 * destas duas funções:
 *
 * - `notaHora(spot, desporto, linhas, j)`: a nota de UMA hora do forecast.
 *   Kitesurf e surf → motor v6 (`horaDeLinha` + `avaliaHoras`, o mesmo caminho
 *   da página do spot e da home). As restantes modalidades (bodyboard,
 *   windsurf, foil, wakeboard, sup) ficam no `sportScore` até o PR 6 decidir
 *   (D5 da auditoria).
 * - `sportScoreDeV6(av, h, modalidade)`: o adaptador da avaliação v6 para o
 *   formato `SportScore`. Marcadores, clusters, popup, pré-visualização,
 *   lista, filtros, legenda e narrativa do /mapa lêem `SportScore`; com o
 *   adaptador mudam de número sem mudar de código.
 *     · `score` = nota v6 × 10 (inteira), por isso `scoreToNota(score)` devolve
 *       a nota v6 e as bandas da #210 (`scoreTierFromScore`, «Só ON» ≥ 65)
 *       coincidem com `bandaDe(n)`;
 *     · noite e «sem dados» → `score: 0`, `rating: 'N/A'` e a marca
 *       `noite` / `semDados` (o estado visual novo chega no PR 2, D3);
 *     · `directionSafety`/`warning` vêm de `AvaliacaoHora.seguranca` com as
 *       mesmas strings `windSafety` do motor antigo;
 *     · `factorsEn` usa os templates que `spotScoreFactors.factorKind`
 *       reconhece («1.4m waves», «11s period», «18kt wind», categoria do vento).
 */
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import {
  getScoreTierLabel,
  getSportScore,
  windSportDirectionSafety,
  type SportScore,
} from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { scoreTierFromScore, scoreToNota } from '@/lib/nota';
import { getTranslation } from '@/lib/i18n';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import {
  avaliaHoras,
  bandaDe,
  defDe,
  type AvaliacaoHora,
  type BandaK,
  type DefOnda,
  type DefVento,
  type HoraModalidade,
  type Modalidade,
} from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';

/** Desportos do site que já passam pelo v6 (os outros ficam no `sportScore`, D5). */
export const DESPORTO_PARA_MODALIDADE: Readonly<Partial<Record<SportType, Modalidade>>> = {
  kitesurf: 'kite',
  surf: 'surf',
};

/** Modalidade v6 de um desporto do site, ou `null` se ainda fica no motor antigo. */
export function modalidadeDe(sport: SportType): Modalidade | null {
  return DESPORTO_PARA_MODALIDADE[sport] ?? null;
}

/** `SportScore` com o que o v6 sabe a mais. */
export interface SportScoreV6 extends SportScore {
  motor: 'v6';
  /** Nota inteira /10, ou `null` (noite ou sem dados). */
  nota: number | null;
  /** Sol abaixo do limiar da definição: sem nota (não é 0). */
  noite?: true;
  /** A fonte não traz o que a modalidade precisa nesta hora. */
  semDados?: true;
}

export interface SportScoreAntigo extends SportScore {
  motor: 'antigo';
}

export type NotaHora = SportScoreV6 | SportScoreAntigo;

const r1 = (x: number) => Math.round(x * 10) / 10;

function ratingDe(score: number): { rating: string; ratingEn: string } {
  if (!(score > 0)) return { rating: 'N/A', ratingEn: 'N/A' };
  const tier = scoreTierFromScore(score);
  return { rating: getScoreTierLabel(tier, 'pt'), ratingEn: getScoreTierLabel(tier, 'en') };
}

interface Factor {
  pt: string;
  en: string;
}

const fVento = (h: HoraModalidade): Factor => ({ pt: `${h.w}kt vento`, en: `${h.w}kt wind` });
const fOnda = (h: HoraModalidade): Factor => ({ pt: `${r1(h.hs).toFixed(1)}m ondas`, en: `${r1(h.hs).toFixed(1)}m waves` });
const fPeriodo = (h: HoraModalidade): Factor => ({ pt: `${h.tp}s período`, en: `${h.tp}s period` });

/**
 * Factores pela ordem do que pesa, a partir do `motivo` e dos efeitos `f` do
 * motor v6 (nunca se recalculam pontos).
 */
function factoresDe(
  av: AvaliacaoHora,
  h: HoraModalidade,
  d: Modalidade,
  praiaVirada: number,
  aguaInterior: boolean,
): Factor[] {
  const def = defDe(d);
  const out: Factor[] = [];
  if (def.logica === 'vento') {
    const p = def as DefVento;
    out.push(fVento(h));
    // categoria do vento, a mesma banda que pontua o tecto (#195); em água
    // interior não há categoria (direcção neutra, #326)
    const cat = windSportDirectionSafety({ coastOrientation: praiaVirada, aguaInterior: aguaInterior || undefined }, h.wd)
      .direction;
    if (cat) out.push({ pt: cat, en: cat });
    if (av.f.onda === 1 && h.hs < p.onda.calma) out.push({ pt: 'Ondas pequenas', en: 'Small waves' });
    else if (av.f.onda === -1) out.push(fOnda(h));
    return out;
  }
  if (def.logica === 'onda') {
    const p = def as DefOnda;
    const periodoConta = h.tp >= p.periodo.bom || h.tp < p.periodo.curto;
    if (av.motivo === 'vento') out.push(fVento(h));
    out.push(fOnda(h));
    if (periodoConta) out.push(fPeriodo(h));
    if (av.motivo !== 'vento' && av.f.vento !== 0) out.push(fVento(h));
    return out;
  }
  out.push(fVento(h));
  return out;
}

/**
 * Avaliação v6 de uma hora → formato `SportScore` (ver cabeçalho).
 * `praiaVirada` é a do editorial do spot (a mesma que `avaliaHoras` usou);
 * `aguaInterior` idem (direcção neutra, sem categoria de vento).
 */
export function sportScoreDeV6(
  av: AvaliacaoHora,
  h: HoraModalidade,
  d: Modalidade,
  praiaVirada: number,
  aguaInterior = false,
): SportScoreV6 {
  const n = av.n;
  const score = n == null ? 0 : Math.max(0, Math.min(100, Math.round(n * 10)));
  const factores = n == null ? [] : factoresDe(av, h, d, praiaVirada, aguaInterior);
  const base: SportScoreV6 = {
    motor: 'v6',
    nota: n,
    score,
    ...ratingDe(score),
    factors: factores.map((f) => f.pt),
    factorsEn: factores.map((f) => f.en),
    primaryFactor: defDe(d).logica === 'onda' ? `${r1(h.hs).toFixed(1)}m` : `${h.w}kt`,
  };
  if (av.semDados) base.semDados = true;
  else if (n == null && !av.fora) base.noite = true;
  if (av.seguranca) {
    const key = av.seguranca === 'offshore' ? 'offshore' : 'sideOffshore';
    base.directionSafety = av.seguranca;
    base.warning = getTranslation('pt').windSafety[key];
    base.warningEn = getTranslation('en').windSafety[key];
  }
  return base;
}

type SpotLocal = Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>;

/**
 * Nota de UMA hora do forecast (`linhas[j]`; as vizinhas só dão o sentido da
 * maré), pelo motor que essa modalidade usa: v6 para kitesurf e surf, o
 * `sportScore` para as restantes.
 */
export function notaHora(
  spot: SpotLocal,
  sport: SportType,
  linhas: readonly LinhaForecast[],
  j: number,
): NotaHora {
  const d = modalidadeDe(sport);
  if (!d) {
    const s = getSportScore(spot as Spot, sport, rawToScoreInput(linhas[j] as unknown as Record<string, unknown>));
    return { ...s, motor: 'antigo' };
  }
  const ed = editorialDe(spot);
  const h = horaDeLinha(linhas, j, { lat: spot.lat, lon: spot.lon, praiaVirada: ed.praiaVirada });
  const [av] = avaliaHoras(spotModalidadeDe(ed), d, [h]);
  return sportScoreDeV6(av, h, d, ed.praiaVirada, !!ed.aguaInterior);
}

/** Banda (chaves v6) de um score 0–100 do motor antigo. */
export function bandaDoScore(score: number): Exclude<BandaK, 'noite'> {
  return bandaDe(scoreToNota(score)) as Exclude<BandaK, 'noite'>;
}

export interface ComparacaoHora {
  spot: string;
  sport: SportType;
  t: string;
  antigo: { score: number; nota: number; banda: Exclude<BandaK, 'noite'> };
  v6: { nota: number | null; banda: BandaK | 'sem-dados' };
}

/**
 * Os dois motores sobre a MESMA linha do forecast (a tabela antes/depois da
 * issue, `scripts/paridade-motor.ts`, e o golden «antes»). Só kitesurf e surf.
 */
export function comparaHora(
  spot: SpotLocal,
  sport: 'kitesurf' | 'surf',
  linhas: readonly LinhaForecast[],
  j: number,
): ComparacaoHora {
  const antigo = getSportScore(spot as Spot, sport, rawToScoreInput(linhas[j] as unknown as Record<string, unknown>)).score;
  const v6 = notaHora(spot, sport, linhas, j) as SportScoreV6;
  return {
    spot: spot.id,
    sport,
    t: String(linhas[j].time).slice(0, 16),
    antigo: { score: antigo, nota: scoreToNota(antigo), banda: bandaDoScore(antigo) },
    v6: { nota: v6.nota, banda: v6.semDados ? 'sem-dados' : bandaDe(v6.nota) },
  };
}
