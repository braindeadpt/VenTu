/**
 * Noite fora do /mapa (opção A, aprovada pelo Pedro 28/10): o estado «Noite»
 * das listas, cartões, comparador e widget. Módulo LEVE (vai no bundle da
 * home e do /spots): só lê o que a linha já traz — a marca `noite` dos
 * `allScores` (`isNoite`) e a janela de `upcomingWindowsBySport`, o mesmo
 * objecto da régua do spot e das «Próximas janelas» da home. Sem pipeline,
 * sem campos novos.
 *
 * - Uma linha está «de noite» quando um desporto do filtro tem a marca `noite`
 *   e nenhum tem nota de dia (com «Todos»: os desportos do «Todos»).
 * - A próxima janela do filtro: a janela (≥ Bom) que ainda não acabou; com
 *   «Todos», a que ganha pela regra abaixo entre os desportos do «Todos».
 * - Ordem de noite (regra aprovada 28/10): com janela primeiro — pelo DIA (o
 *   mais cedo: amanhã antes de sexta), depois a nota (alta → baixa), depois a
 *   hora de início (a mais cedo); quem não tem janela fica no fim. O desempate
 *   por nome / slug é de quem chama (o mesmo das listas de dia).
 * - Os ISO do forecast são hora de parede (`2026-10-29T07:00`): dia e hora
 *   lêem-se da string e comparam-se com o relógio de Lisboa de quem lê.
 */
import type { Spot } from '@/types';
import { getCompatibleSports, type GridSportFilter, type SportType } from '@/lib/sportRatings';
import type { UpcomingWindow, UpcomingWindowsBySport } from '@/lib/bestWindowToday';
import { desportosTodos } from '@/lib/desportosV6';
import { isNoite } from '@/lib/notaV6Agora';
import { notaTier, scoreToNota } from '@/lib/nota';
import type { BandaK } from '@/lib/modalidades';

type SpotNoite = Pick<Spot, 'type' | 'compatibleSports'>;

/** O que a linha precisa para o estado de noite (GridSpotData / HomepageSpotData servem). */
export interface LinhaNoite {
  spot: SpotNoite;
  allScores: Partial<Record<SportType, unknown>>;
  upcomingWindowsBySport?: UpcomingWindowsBySport;
}

/** Próxima janela de uma linha. `dia`: dias desde hoje em Lisboa (0 hoje, 1 amanhã), `null` sem relógio. */
export interface JanelaSeguinte {
  sport: SportType;
  w: UpcomingWindow;
  dia: number | null;
}

/** Desportos que o filtro lê (os do «Todos» com `all`; a Big Wave lê o surf, D8). */
export function desportosDoFiltro(spot: SpotNoite, filter: GridSportFilter | SportType): readonly SportType[] {
  if (filter === 'all') return desportosTodos(spot);
  if (filter === 'big-wave') return ['surf'];
  return [filter];
}

const scoreDe = (s: unknown): number => {
  const v = s && typeof s === 'object' ? (s as { score?: unknown }).score : 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** A linha está de noite para este filtro (lua no lugar da nota)? */
export function linhaDeNoite(row: Pick<LinhaNoite, 'spot' | 'allScores'>, filter: GridSportFilter | SportType): boolean {
  const ds = desportosDoFiltro(row.spot, filter);
  if (!ds.some((s) => isNoite(row.allScores[s]))) return false;
  return !ds.some((s) => scoreDe(row.allScores[s]) > 0);
}

/**
 * A lista inteira está de noite (faixa «Noite», título «Top 8 · próxima
 * janela»)? Pelo menos uma linha de noite e nenhuma com nota de dia — no
 * crepúsculo (continente de noite, Açores ainda de dia) a lista fica de dia e
 * só as linhas de noite levam a lua.
 */
export function listaDeNoite(rows: ReadonlyArray<Pick<LinhaNoite, 'spot' | 'allScores'>>, filter: GridSportFilter | SportType): boolean {
  let noite = false;
  for (const r of rows) {
    if (linhaDeNoite(r, filter)) noite = true;
    else if (desportosDoFiltro(r.spot, filter).some((s) => scoreDe(r.allScores[s]) > 0)) return false;
  }
  return noite;
}

const lisboaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Relógio de parede de Lisboa: `YYYY-MM-DDTHH:mm`. */
export function relogioLisboa(nowMs: number): string {
  const p = Object.fromEntries(lisboaFmt.formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

const diaMs = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));

/** Dias de calendário entre hoje (Lisboa) e o dia de `iso` (0 hoje, 1 amanhã). */
export function diasAte(iso: string, nowMs: number): number {
  return Math.round((diaMs(iso.slice(0, 10)) - diaMs(relogioLisboa(nowMs).slice(0, 10))) / 86_400_000);
}

/** Horas de parede de `nowMs` até ao início da janela (negativo = já começou). */
export function horasAte(iso: string, nowMs: number): number {
  const a = relogioLisboa(nowMs);
  const ms = (s: string) => diaMs(s) + (+s.slice(11, 13)) * 3_600_000 + (+s.slice(14, 16) || 0) * 60_000;
  return (ms(iso) - ms(a)) / 3_600_000;
}

/** A janela ainda não acabou (a última hora boa ainda não passou)? Sem relógio: conta. */
export function janelaViva(w: UpcomingWindow, nowMs: number | null): boolean {
  if (nowMs == null) return true;
  return w.endIso.slice(0, 13) >= relogioLisboa(nowMs).slice(0, 13);
}

/**
 * Regra aprovada (28/10): com janela antes de sem janela; o dia mais cedo;
 * a nota inteira mais alta; a hora de início mais cedo. 0 = empate (quem chama
 * desempata pelo nome).
 */
export function compararJanelas(a: JanelaSeguinte | null, b: JanelaSeguinte | null): number {
  if (!a !== !b) return a ? -1 : 1;
  if (!a || !b) return 0;
  const da = a.w.startIso.slice(0, 10);
  const db = b.w.startIso.slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  const nota = scoreToNota(b.w.score) - scoreToNota(a.w.score);
  if (nota !== 0) return nota;
  if (a.w.startIso !== b.w.startIso) return a.w.startIso < b.w.startIso ? -1 : 1;
  return 0;
}

/**
 * Próxima janela da linha para o filtro (só desportos compatíveis com o spot,
 * só janelas que ainda não acabaram). Com «Todos» ganha a da regra acima.
 */
export function janelaSeguinte(
  row: Pick<LinhaNoite, 'spot' | 'upcomingWindowsBySport'>,
  filter: GridSportFilter | SportType,
  nowMs: number | null,
): JanelaSeguinte | null {
  if (filter === 'big-wave' && row.spot.type !== 'big-wave') return null;
  const compat = getCompatibleSports(row.spot as Spot);
  let best: JanelaSeguinte | null = null;
  for (const sport of desportosDoFiltro(row.spot, filter)) {
    if (!compat.includes(sport)) continue;
    const w = row.upcomingWindowsBySport?.[sport];
    if (!w || !janelaViva(w, nowMs)) continue;
    const c: JanelaSeguinte = { sport, w, dia: nowMs == null ? null : diasAte(w.startIso, nowMs) };
    if (!best || compararJanelas(c, best) < 0) best = c;
  }
  return best;
}

/**
 * Comparador das listas (dia e noite): as linhas de dia ficam à frente das de
 * noite (a ordem delas é a de sempre, de quem chama: devolve `null`); duas
 * linhas de noite seguem a regra da próxima janela. 0 = empate (nome / slug).
 */
export function compararNoite(
  a: LinhaNoite,
  b: LinhaNoite,
  filter: GridSportFilter | SportType,
  nowMs: number | null,
): number | null {
  const na = linhaDeNoite(a, filter);
  const nb = linhaDeNoite(b, filter);
  if (!na && !nb) return null;
  if (na !== nb) return na ? 1 : -1;
  return compararJanelas(janelaSeguinte(a, filter, nowMs), janelaSeguinte(b, filter, nowMs));
}

/** Banda v6 de um score 0–100 (a escala da #210; sem importar as definições). */
export function bandaDeScore(score: number): Exclude<BandaK, 'noite'> {
  switch (notaTier(scoreToNota(score))) {
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

/** Janela dentro das próximas `horas` (o «Amanhã ganha» do comparador: 24 h). */
export function janelaDentroDe(j: JanelaSeguinte | null, nowMs: number, horas: number): boolean {
  return !!j && horasAte(j.w.startIso, nowMs) < horas;
}

/**
 * Veredicto do comparador de noite: a ordem pela próxima janela (dia, nota,
 * início, nome) e quem tem janela nas próximas 24 h — o primeiro destes é o
 * «Amanhã ganha …»; nenhum = «Ninguém com janela boa nas próximas 24 horas».
 * Nunca um «Vencedor» pelo «0» de noite.
 */
export function veredictoNoite<T>(
  itens: readonly T[],
  janelaDe: (t: T) => JanelaSeguinte | null,
  nome: (t: T) => string,
  nowMs: number,
  locale: string,
): { ordem: T[]; ganham24h: T[] } {
  const ordem = [...itens].sort(
    (a, b) => compararJanelas(janelaDe(a), janelaDe(b)) || nome(a).localeCompare(nome(b), locale),
  );
  return { ordem, ganham24h: ordem.filter((t) => janelaDentroDe(janelaDe(t), nowMs, 24)) };
}
