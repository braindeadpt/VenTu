/**
 * Formatador partilhado da linha «porquê este score» — usado pelo popup do
 * mapa, pelo sheet/preview do spot e pela lista sincronizada. Uma só
 * gramática canónica (ex. «offshore 12 kt · período 11 s · swell NW»);
 * a lista densa usa `short`, a versão curta dos MESMOS factores.
 *
 * NÃO recalcula score: a selecção de factores lê `SportScore.factorsEn`
 * (o scorer já escolheu o que pesa, por ordem); este módulo só decide a
 * ordem final, deduplica por tipo e escreve cada factor com os números
 * das condições actuais.
 */

import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import { getCompatibleSports } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { classifyWind } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';

export type ScoreFactorKind =
  | 'wind'
  | 'period'
  | 'waves'
  | 'swell'
  | 'flat'
  | 'water'
  | 'other';

export interface ScoreFactorSegment {
  kind: ScoreFactorKind;
  /** Etiqueta completa, ex. «offshore 12 kt». */
  label: string;
  /** Versão curta do mesmo factor para linhas densas, ex. «off 12kt». */
  short: string;
}

export interface SpotScoreFactorsInput {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
  /** Desporto seleccionado no mapa; 'all' → o desporto com melhor score. */
  sport: GridSportFilter;
  locale: string;
  /** Máximo de factores (default 3). */
  max?: number;
}

type FactorLocale = 'pt' | 'en' | 'es' | 'de' | 'fr';

const FACTOR_WORDS: Record<FactorLocale, {
  waves: string;
  period: string;
  flat: string;
  flatShort: string;
  water: string;
}> = {
  pt: { waves: 'ondas', period: 'período', flat: 'água plana', flatShort: 'plano', water: 'água' },
  en: { waves: 'waves', period: 'period', flat: 'flat water', flatShort: 'flat', water: 'water' },
  es: { waves: 'olas', period: 'periodo', flat: 'agua plana', flatShort: 'plano', water: 'agua' },
  de: { waves: 'Wellen', period: 'Periode', flat: 'flaches Wasser', flatShort: 'flach', water: 'Wasser' },
  fr: { waves: 'vagues', period: 'période', flat: 'eau plate', flatShort: 'plate', water: 'eau' },
};

const WIND_CAT_SHORT: Record<string, string> = {
  offshore: 'off',
  onshore: 'on',
  'side-offshore': 's-off',
  'side-onshore': 's-on',
};

function factorLocale(locale: string): FactorLocale {
  return locale === 'en' || locale === 'es' || locale === 'de' || locale === 'fr' ? locale : 'pt';
}

/** O desporto explicado: o seleccionado no mapa, ou o melhor quando 'all'. */
export function resolveExplainedSport(
  spot: Spot,
  allScores: Record<SportType, SportScore>,
  sport: GridSportFilter,
): SportType | null {
  if (sport === 'big-wave') return 'surf';
  if (sport !== 'all') return sport;
  const compatible = new Set(getCompatibleSports(spot));
  let best: SportType | null = null;
  let bestScore = -1;
  for (const [s, sc] of Object.entries(allScores) as [SportType, SportScore][]) {
    if (!compatible.has(s)) continue;
    const v = sc?.score ?? 0;
    if (v > bestScore) { best = s; bestScore = v; }
  }
  return best;
}

/**
 * Mapeia um factor EN do scorer para o tipo canónico. `factorsEn` é a fonte
 * estável (templates fechados em sportScore.ts); o tipo decide a gramática
 * e a cor — nunca se volta a calcular pontos.
 */
function factorKind(factorEn: string): ScoreFactorKind | 'windcat' {
  const f = factorEn.trim();
  if (/^[\d.]+m waves$/.test(f)) return 'waves';
  if (/^[\d.]+s period$/.test(f)) return 'period';
  if (/^[\d.]+°C water$/.test(f)) return 'water';
  if (f === 'Flat water') return 'flat';
  if (f === 'Small waves') return 'waves';
  if (f === 'offshore' || f === 'onshore' || f === 'side-offshore' || f === 'side-onshore') return 'windcat';
  if (/wind/i.test(f)) return 'wind';
  return 'other';
}

export function getSpotScoreFactors(input: SpotScoreFactorsInput): ScoreFactorSegment[] {
  const { spot, conditions, allScores, sport, locale, max = 3 } = input;
  const loc = factorLocale(locale);
  const w = FACTOR_WORDS[loc];
  const isPt = loc === 'pt';
  const explained = resolveExplainedSport(spot, allScores, sport);
  const score = explained ? allScores[explained] : undefined;

  const windKt = Math.round(conditions.windSpeed * MS_TO_KNOTS);
  const windCat = classifyWind(spot, conditions.windDirection);
  const waveH = conditions.waveHeight;
  const periodS = Math.round(conditions.wavePeriod);

  const renderers: Record<Exclude<ScoreFactorKind, 'other'>, () => ScoreFactorSegment> = {
    wind: () => ({
      kind: 'wind',
      label: `${windCat} ${windKt} kt`,
      short: `${WIND_CAT_SHORT[windCat] ?? windCat} ${windKt}kt`,
    }),
    period: () => ({
      kind: 'period',
      label: `${w.period} ${periodS} s`,
      short: `${periodS} s`,
    }),
    waves: () => ({
      kind: 'waves',
      label: `${w.waves} ${waveH.toFixed(1)} m`,
      short: `${waveH.toFixed(1)} m`,
    }),
    swell: () => {
      const dir = getCardinalLabel(conditions.swellDirection ?? conditions.waveDirection);
      return { kind: 'swell', label: `swell ${dir}`, short: `swl ${dir}` };
    },
    flat: () => ({
      kind: 'flat',
      label: w.flat,
      short: w.flatShort,
    }),
    water: () => ({
      kind: 'water',
      label: `${w.water} ${Math.round(conditions.waterTemp)} °C`,
      short: `${Math.round(conditions.waterTemp)} °C`,
    }),
  };

  const segments: ScoreFactorSegment[] = [];
  const seen = new Set<ScoreFactorKind>();
  const push = (seg: ScoreFactorSegment) => {
    if (segments.length >= max || seen.has(seg.kind)) return;
    seen.add(seg.kind);
    segments.push(seg);
  };

  const factorsEn = score?.factorsEn ?? [];
  const factorsPt = score?.factors ?? [];
  factorsEn.forEach((f, i) => {
    const kind = factorKind(f);
    if (kind === 'windcat' || kind === 'wind') {
      // A categoria do vento funde-se no segmento de vento — «Xkt wind» e
      // «side-offshore» do scorer viram «side-offshore 18 kt» uma só vez.
      push(renderers.wind());
    } else if (kind === 'other') {
      // Factores qualitativos do scorer (infra wake, etc.) mantêm o texto dele.
      const text = isPt ? (factorsPt[i] ?? f) : f;
      push({ kind: 'other', label: text, short: text });
    } else {
      push(renderers[kind]());
    }
  });

  // «swell NW» contextualiza os factores de onda quando há direcção de swell.
  if (
    segments.length < max &&
    conditions.swellDirection !== undefined &&
    (seen.has('waves') || seen.has('period'))
  ) {
    push(renderers.swell());
  }

  // Fallback: score sem factores (ex. condições fracas) — a linha explica na
  // mesma com as métricas canónicas.
  if (segments.length === 0) {
    push(renderers.waves());
    push(renderers.period());
    push(renderers.wind());
  }

  return segments;
}

/** Classe de cor do factor — tokens --data-* do design system. */
export function scoreFactorClass(kind: ScoreFactorKind): string {
  switch (kind) {
    case 'wind': return 'text-data-wind';
    case 'period': return 'text-data-period';
    case 'waves':
    case 'swell':
    case 'flat': return 'text-data-waves';
    case 'water': return 'text-data-water';
    default: return 'text-fg-muted';
  }
}
