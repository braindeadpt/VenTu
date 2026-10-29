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
import type { JanelasCandidatasBySport, UpcomingWindow, UpcomingWindowsBySport } from '@/lib/bestWindowToday';
import { desportosTodos } from '@/lib/desportosV6';
import { isNoite, isSemDados } from '@/lib/notaV6Agora';
import { notaTier, scoreToNota } from '@/lib/nota';
import type { BandaK } from '@/lib/modalidades';
import { seriesTimeMs } from '@/lib/openMeteoTime';

type SpotNoite = Pick<Spot, 'type' | 'compatibleSports'>;

/** O que a linha precisa para o estado de noite (GridSpotData / HomepageSpotData servem). */
export interface LinhaNoite {
  spot: SpotNoite;
  allScores: Partial<Record<SportType, unknown>>;
  upcomingWindowsBySport?: UpcomingWindowsBySport;
  /** Outras janelas candidatas (≥ Bom) por desporto: a próxima pode não ser a de melhor nota. */
  janelasNoiteBySport?: JanelasCandidatasBySport;
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
 * janela»)? Só quando TODAS as linhas estão de noite (as linhas sem dados não
 * contam, mas é preciso pelo menos uma de noite). Uma linha de dia com nota 0
 * (sem vento para o kite às 13h) NÃO é noite: numa lista mista — crepúsculo,
 * ou de dia no continente com os Açores ainda antes do nascer do sol — a lista
 * fica de dia, as linhas de dia mantêm a nota e a ordem por nota, e só as de
 * noite levam a lua (no fim, `compararNoite`).
 */
export function listaDeNoite(rows: ReadonlyArray<Pick<LinhaNoite, 'spot' | 'allScores'>>, filter: GridSportFilter | SportType): boolean {
  let noite = false;
  for (const r of rows) {
    if (linhaDeNoite(r, filter)) noite = true;
    else if (!linhaSemDados(r, filter)) return false;
  }
  return noite;
}

/** Todos os desportos do filtro desta linha estão «sem dados» (nem dia nem noite)? */
function linhaSemDados(row: Pick<LinhaNoite, 'spot' | 'allScores'>, filter: GridSportFilter | SportType): boolean {
  const ds = desportosDoFiltro(row.spot, filter);
  return ds.length > 0 && ds.every((s) => isSemDados(row.allScores[s]));
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
const HORA_MS = 3_600_000;

/**
 * Desvio (min) da hora de parede do SPOT numa etiqueta da série: o da própria
 * etiqueta (`…T23:00-01:00` nos Açores); sem desvio, o de Lisboa nesse
 * instante (etiquetas antigas = hora de Lisboa, `seriesTimeMs`).
 */
export function desvioSpotMin(iso: string): number {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso.trim());
  if (m) return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  if (/[zZ]$/.test(iso.trim())) return 0;
  const t = seriesTimeMs(iso);
  if (!Number.isFinite(t)) return 0;
  const wall = diaMs(iso.slice(0, 10)) + +iso.slice(11, 13) * HORA_MS + (+iso.slice(14, 16) || 0) * 60_000;
  return Math.round((wall - t) / 60_000);
}

/**
 * Dias de calendário entre hoje e o dia de `iso` (0 hoje, 1 amanhã), os dois
 * no fuso do SPOT (o da etiqueta): nos Açores às 00:30 UTC ainda é «hoje» 28.
 */
export function diasAte(iso: string, nowMs: number): number {
  const hojeSpot = new Date(nowMs + desvioSpotMin(iso) * 60_000).toISOString().slice(0, 10);
  return Math.round((diaMs(iso.slice(0, 10)) - diaMs(hojeSpot)) / 86_400_000);
}

/** Horas (instantes UTC) de `nowMs` até ao início da janela (negativo = já começou). */
export function horasAte(iso: string, nowMs: number): number {
  return (seriesTimeMs(iso) - nowMs) / HORA_MS;
}

/**
 * A janela ainda não acabou? `endIso` é o INÍCIO da última hora boa
 * (`janelaV6` em `bestWindowBuild`): viva enquanto essa hora não terminou, em
 * instantes UTC (o desvio dos Açores conta). Sem relógio: conta.
 */
export function janelaViva(w: UpcomingWindow, nowMs: number | null): boolean {
  if (nowMs == null) return true;
  const fim = seriesTimeMs(w.endIso);
  return !Number.isFinite(fim) || fim + HORA_MS > nowMs;
}

/**
 * Regra aprovada (28/10): com janela antes de sem janela; o dia mais cedo;
 * a nota inteira mais alta; a hora de início mais cedo. 0 = empate (quem chama
 * desempata pelo nome).
 */
export function compararJanelas(a: JanelaSeguinte | null, b: JanelaSeguinte | null): number {
  if (!a !== !b) return a ? -1 : 1;
  if (!a || !b) return 0;
  // o dia no fuso de cada spot (o do rótulo «amanhã»); sem relógio, a data da etiqueta
  if (a.dia != null && b.dia != null) {
    if (a.dia !== b.dia) return a.dia - b.dia;
  } else {
    const da = a.w.startIso.slice(0, 10);
    const db = b.w.startIso.slice(0, 10);
    if (da !== db) return da < db ? -1 : 1;
  }
  const nota = scoreToNota(b.w.score) - scoreToNota(a.w.score);
  if (nota !== 0) return nota;
  const ta = seriesTimeMs(a.w.startIso);
  const tb = seriesTimeMs(b.w.startIso);
  if (ta !== tb && Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  return 0;
}

/** Candidatas vivas da linha para um desporto: a melhor (`upcomingWindowsBySport`) + as outras, sem repetidas. */
function candidatas(row: Pick<LinhaNoite, 'upcomingWindowsBySport' | 'janelasNoiteBySport'>, sport: SportType, nowMs: number | null): UpcomingWindow[] {
  const out: UpcomingWindow[] = [];
  const vistas = new Set<string>();
  const best = row.upcomingWindowsBySport?.[sport];
  for (const w of [...(best ? [best] : []), ...(row.janelasNoiteBySport?.[sport] ?? [])]) {
    const k = `${w.startIso}|${w.endIso}`;
    if (vistas.has(k) || !janelaViva(w, nowMs)) continue;
    vistas.add(k);
    out.push(w);
  }
  return out;
}

/**
 * Próxima janela da linha para o filtro: entre TODAS as candidatas (≥ Bom) dos
 * desportos do filtro compatíveis com o spot, só as que ainda não acabaram,
 * ganha a da regra acima (dia → nota → início) — um 7 amanhã às 08h vem antes
 * de um 9 depois de amanhã. `dentroDeHoras`: só as que começam nas próximas
 * N horas (o «Amanhã ganha» do comparador, instantes UTC).
 */
export function janelaSeguinte(
  row: Pick<LinhaNoite, 'spot' | 'upcomingWindowsBySport' | 'janelasNoiteBySport'>,
  filter: GridSportFilter | SportType,
  nowMs: number | null,
  dentroDeHoras?: number,
): JanelaSeguinte | null {
  if (filter === 'big-wave' && row.spot.type !== 'big-wave') return null;
  const compat = getCompatibleSports(row.spot as Spot);
  let best: JanelaSeguinte | null = null;
  for (const sport of desportosDoFiltro(row.spot, filter)) {
    if (!compat.includes(sport)) continue;
    for (const w of candidatas(row, sport, nowMs)) {
      if (dentroDeHoras != null && (nowMs == null || horasAte(w.startIso, nowMs) >= dentroDeHoras)) continue;
      const c: JanelaSeguinte = { sport, w, dia: nowMs == null ? null : diasAte(w.startIso, nowMs) };
      if (!best || compararJanelas(c, best) < 0) best = c;
    }
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

/** Janela dentro das próximas `horas` (o «Amanhã ganha» do comparador: 24 h, instantes UTC). */
export function janelaDentroDe(j: JanelaSeguinte | null, nowMs: number, horas: number): boolean {
  return !!j && horasAte(j.w.startIso, nowMs) < horas;
}

/**
 * Veredicto do comparador de noite: a ordem pela próxima janela (dia, nota,
 * início, nome) e quem tem janela nas próximas 24 h — vê TODAS as candidatas
 * desse intervalo (`janela24hDe`, ex. `janelaSeguinte(..., 24)`), não só a
 * próxima; o primeiro destes (pela mesma regra) é o «Amanhã ganha …»;
 * nenhum = «Ninguém com janela boa nas próximas 24 horas». Nunca um
 * «Vencedor» pelo «0» de noite.
 */
export function veredictoNoite<T>(
  itens: readonly T[],
  janelaDe: (t: T) => JanelaSeguinte | null,
  nome: (t: T) => string,
  nowMs: number,
  locale: string,
  janela24hDe: (t: T) => JanelaSeguinte | null = (t) => {
    const j = janelaDe(t);
    return janelaDentroDe(j, nowMs, 24) ? j : null;
  },
): { ordem: T[]; ganham24h: T[] } {
  const porNome = (a: T, b: T) => nome(a).localeCompare(nome(b), locale);
  const ordem = [...itens].sort((a, b) => compararJanelas(janelaDe(a), janelaDe(b)) || porNome(a, b));
  const ganham24h = itens
    .map((t) => ({ t, j: janela24hDe(t) }))
    .filter((x) => x.j && janelaDentroDe(x.j, nowMs, 24))
    .sort((a, b) => compararJanelas(a.j, b.j) || porNome(a.t, b.t))
    .map((x) => x.t);
  return { ordem, ganham24h };
}

/**
 * Comparador com spots de noite (revisão #358, 3). `modo`:
 * - `dia`: nenhum de noite — a ordem de sempre (nota, estável) e o vencedor normal;
 * - `noite`: todos de noite — `veredictoNoite` (sem «Vencedor»);
 * - `misto`: uns de dia, outros de noite — as notas de dia à frente dos de noite
 *   (mesmo um 0 de dia; os de noite entre si pela próxima janela). Vencedor
 *   normal só um spot de DIA com nota > 0; sem nenhum, `vencedorDia` é `null` e
 *   vale o veredicto pelas janelas (`ganham24h`, «Amanhã ganha …» / ninguém).
 * Nunca um cartão de vencedor para uma entrada de noite (N/A, 0/10).
 */
export function veredictoComparador<T>(
  itens: readonly T[],
  o: {
    noite: (t: T) => boolean;
    score: (t: T) => number;
    janelaDe: (t: T) => JanelaSeguinte | null;
    janela24hDe?: (t: T) => JanelaSeguinte | null;
    nome: (t: T) => string;
    /** Relógio das janelas; `null` = ainda a calcular (sem «Amanhã ganha»). */
    nowMs: number | null;
    locale: string;
  },
): { modo: 'dia' | 'noite' | 'misto'; ordem: T[]; vencedorDia: T | null; ganham24h: T[] } {
  const nNoite = itens.filter(o.noite).length;
  const porJanelas = () =>
    o.nowMs == null
      ? { ordem: [...itens].sort((a, b) => o.nome(a).localeCompare(o.nome(b), o.locale)), ganham24h: [] as T[] }
      : veredictoNoite(itens, o.janelaDe, o.nome, o.nowMs, o.locale, o.janela24hDe);
  if (itens.length && nNoite === itens.length) {
    const v = porJanelas();
    return { modo: 'noite', ordem: v.ordem, vencedorDia: null, ganham24h: v.ganham24h };
  }
  const misto = nNoite > 0;
  const ordem = [...itens].sort((a, b) => {
    const na = o.noite(a);
    const nb = o.noite(b);
    if (na && nb) return compararJanelas(o.janelaDe(a), o.janelaDe(b)) || o.nome(a).localeCompare(o.nome(b), o.locale);
    const d = o.score(b) - o.score(a);
    if (d !== 0) return d;
    if (na !== nb) return na ? 1 : -1;
    return 0;
  });
  if (!misto) return { modo: 'dia', ordem, vencedorDia: ordem[0] ?? null, ganham24h: [] };
  const top = ordem[0];
  const vencedorDia = top && !o.noite(top) && o.score(top) > 0 ? top : null;
  return { modo: 'misto', ordem, vencedorDia, ganham24h: vencedorDia ? [] : porJanelas().ganham24h };
}
