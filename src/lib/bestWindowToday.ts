/**
 * Tipos das janelas e a escolha por filtro (leve: vai para o bundle da home e
 * do /spots). O cálculo — v6 para kitesurf/surf (#218, PR 5) e o motor antigo
 * para as outras modalidades — está em `bestWindowBuild.ts` (só servidor).
 */
import type { SportType } from '@/lib/sportRatings';

export interface BestWindowToday {
  /** Hora de parede da etiqueta do forecast (a da régua do spot). */
  start: number;
  end: number;
  score: number;
  sport: SportType;
}

export type BestWindowsBySport = Partial<
  Record<SportType, Pick<BestWindowToday, 'start' | 'end' | 'score'>>
>;

/**
 * Melhor janela das próximas 48 h — kitesurf/surf a partir das notas v6 hora a
 * hora (as da régua do spot, #218 PR 5), por isso uma linha de «Próximas
 * janelas» nunca discorda da página do spot. Ao contrário de `BestWindowToday`
 * (hora do dia), traz as etiquetas ISO para rotular «Hoje»/«Amanhã»/dia da
 * semana no relógio de quem lê.
 */
export interface UpcomingWindow {
  /** ISO forecast timestamp of the window start. */
  startIso: string;
  /** ISO forecast timestamp of the window end (last good hour). */
  endIso: string;
  score: number;
}

export type UpcomingWindowsBySport = Partial<Record<SportType, UpcomingWindow>>;

export interface ForecastHourRow {
  time: string;
  waveHeight?: number;
  wavePeriod?: number;
  windSpeed?: number;
  windDirection?: number;
  windGust?: number;
  waterTemp?: number;
}

/**
 * Janela de hoje para um filtro (home / O teu dia / tabela do /spots).
 * Com um desporto concreto, só a janela DESSE desporto (ou `null`): a de outro
 * desporto não pode aparecer na coluna do escolhido (#218 PR 5 — com o v6 há
 * menos janelas de kite, e a de windsurf/heurística aparecia no lugar dela).
 * Com `all`, a melhor de todas.
 */
export function resolveBestWindowForSport(
  bestWindowToday: BestWindowToday | null | undefined,
  bestWindowsBySport: BestWindowsBySport | undefined,
  sport: SportType | 'all',
): BestWindowToday | null {
  if (sport === 'all') return bestWindowToday ?? null;
  const w = bestWindowsBySport?.[sport];
  return w ? { ...w, sport } : null;
}
