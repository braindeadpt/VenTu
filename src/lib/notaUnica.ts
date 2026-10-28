/**
 * Motor único (#218): o caminho único da nota de UMA hora e o adaptador para o
 * formato `SportScore` que o /mapa e as listas lêem.
 *
 * - `notaHora(spot, desporto, linhas, j)`: a nota de UMA hora do forecast.
 *   Surf, kitesurf, windsurf, bodyboard e foil → motor v6 (`horaDeLinha` +
 *   `avaliaHorasSite`, o mesmo caminho da página do spot e da home; o foil é a
 *   melhor das três vertentes). Só o SUP e o wakeboard ficam no `sportScore`
 *   (PR 6, decisão do Pedro 27/10 — ver `desportosV6.ts`).
 * - `sportScoreDeV6(av, h, chave)`: o adaptador da avaliação v6 para o
 *   formato `SportScore`. Marcadores, clusters, popup, pré-visualização,
 *   lista, filtros, legenda e narrativa do /mapa lêem `SportScore`; com o
 *   adaptador mudam de número sem mudar de código.
 *     · `score` = nota v6 × 10 (inteira), por isso `scoreToNota(score)` devolve
 *       a nota v6 e as bandas da #210 (`scoreTierFromScore`, «Só ON» ≥ 65)
 *       coincidem com `bandaDe(n)`;
 *     · noite e «sem dados» → `score: 0`, `rating: 'N/A'` e a marca
 *       `noite` / `semDados`;
 *     · `directionSafety`/`warning` vêm de `AvaliacaoHora.seguranca` com as
 *       mesmas strings `windSafety`;
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
import { scoreTierFromScore } from '@/lib/nota';
import { getTranslation } from '@/lib/i18n';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import {
  avaliaHorasSite,
  defDe,
  VERTENTES_FOIL,
  type AvaliacaoHora,
  type DefOnda,
  type DefVento,
  type HoraModalidade,
  type ModalidadeMotor,
  type ModalidadeSite,
  type VertenteFoil,
} from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { DESPORTO_PARA_AGORA, isDesportoMotorAntigo } from '@/lib/desportosV6';

/** Desportos do site que passam pelo v6 (só o SUP e o wakeboard ficam no `sportScore`). */
export const DESPORTO_PARA_MODALIDADE: Readonly<Partial<Record<SportType, ModalidadeSite>>> = DESPORTO_PARA_AGORA;

/** Modalidade v6 de um desporto do site, ou `null` se fica no motor antigo (SUP, wakeboard). */
export function modalidadeDe(sport: SportType): ModalidadeSite | null {
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
  /** Kite com vento forte (≥ 30 kt médios): «Só profissionais» (a nota fica baixa para os outros níveis). */
  soProfissionais?: true;
  /** Foil: a vertente que deu a nota (a melhor das três nesta hora). */
  vertente?: VertenteFoil;
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
  d: ModalidadeMotor,
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
 * `d` é a chave da definição que deu a nota (no foil, a vertente vencedora).
 * `praiaVirada` é a do editorial do spot (a mesma que `avaliaHoras` usou);
 * `aguaInterior` idem (direcção neutra, sem categoria de vento).
 */
export function sportScoreDeV6(
  av: AvaliacaoHora,
  h: HoraModalidade,
  d: ModalidadeMotor,
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
  if ((VERTENTES_FOIL as readonly string[]).includes(d)) base.vertente = d as VertenteFoil;
  if (av.semDados) base.semDados = true;
  else if (n == null && !av.fora) base.noite = true;
  if (av.seguranca) {
    const key = av.seguranca === 'offshore' ? 'offshore' : 'sideOffshore';
    base.directionSafety = av.seguranca;
    base.warning = getTranslation('pt').windSafety[key];
    base.warningEn = getTranslation('en').windSafety[key];
  }
  if (av.soProfissionais) {
    base.soProfissionais = true;
    // o aviso de direcção (offshore) ganha; senão, o do vento forte
    if (!base.warning) {
      base.warning = getTranslation('pt').windSafety.soProfissionais;
      base.warningEn = getTranslation('en').windSafety.soProfissionais;
    }
  }
  return base;
}

type SpotLocal = Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>;

/**
 * Nota de UMA hora do forecast (`linhas[j]`; as vizinhas só dão o sentido da
 * maré), pelo motor que essa modalidade usa: v6 para surf, kitesurf,
 * windsurf, bodyboard e foil; o `sportScore` para o SUP e o wakeboard.
 */
export function notaHora(
  spot: SpotLocal,
  sport: SportType,
  linhas: readonly LinhaForecast[],
  j: number,
): NotaHora {
  const d = modalidadeDe(sport);
  if (!d) {
    if (!isDesportoMotorAntigo(sport)) throw new Error(`notaHora: desporto desconhecido ${sport}`);
    const s = getSportScore(spot as Spot, sport, rawToScoreInput(linhas[j] as unknown as Record<string, unknown>));
    return { ...s, motor: 'antigo' };
  }
  const ed = editorialDe(spot);
  const h = horaDeLinha(linhas, j, { lat: spot.lat, lon: spot.lon, praiaVirada: ed.praiaVirada });
  const [av] = avaliaHorasSite(spotModalidadeDe(ed), d, [h]);
  return sportScoreDeV6(av, h, av.chave, ed.praiaVirada, !!ed.aguaInterior);
}
