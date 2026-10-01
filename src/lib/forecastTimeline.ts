import { formatDayShort } from '@/lib/verdict/formatHourLabel';

/**
 * Mapeamento índice da timeline partilhada ↔ coluna visível da
 * ForecastTable (S3 — docs/design/SPOT-PAGE.md §5) e agrupamento por dia
 * para a lista «Hora a hora» (SP-B — SPOT-UX-V3.md §5).
 *
 * A tabela pode estar colapsada (menos horas que a timeline) ou fatiada
 * (`startIndex`/`startTime` desloca a janela) — por isso o mapeamento
 * recebe o início e o número de colunas visíveis e devolve `null` quando a
 * hora escolhida não está renderizada (sem destaque, sem scroll).
 */

/** Índice global da timeline → posição da coluna visível; `null` fora da janela. */
export function timelineIndexToColumn(
  index: number,
  visibleStart: number,
  visibleCount: number,
): number | null {
  const col = index - visibleStart;
  return col >= 0 && col < visibleCount ? col : null;
}

/** Posição da coluna visível → índice global da timeline. */
export function columnToTimelineIndex(column: number, visibleStart: number): number {
  return visibleStart + column;
}

/* ──────────── agrupamento por dia (lista mobile + separadores/chips) ────────────
 * As horas são wall-time Open-Meteo (Europe/Lisbon, naive) — o dia civil e o
 * weekday extraem-se da própria string, sem `new Date(iso)` (o parse local
 * muda com o fuso do browser e quebra a hidratação). O weekday calcula-se do
 * dia civil em UTC — determinístico em qualquer máquina.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Nomes de weekday completos por locale (forma curta editorial: «Quarta»). */
const WEEKDAY_LONG: Record<string, readonly string[]> = {
  pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
};

/** Dia civil (UTC) → weekday 0–6; '' para strings fora do formato ISO. */
function weekdayOf(isoLocal: string): number {
  const m = ISO_DAY.exec(isoLocal);
  if (!m) return -1;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12),
  ).getUTCDay();
}

/** 'Quarta, 23' — cabeçalho de dia da lista mobile (forma longa + nº do dia). */
export function formatDayLong(isoLocal: string, locale: string): string {
  const m = ISO_DAY.exec(isoLocal);
  const dow = weekdayOf(isoLocal);
  if (!m || dow < 0) return '';
  const names = WEEKDAY_LONG[locale] ?? WEEKDAY_LONG.pt;
  return `${names[dow]}, ${Number(m[3])}`;
}

export interface ForecastDayGroup {
  /** Chave do dia civil 'YYYY-MM-DD' (primeiras 10 chars do ISO local). */
  day: string;
  /** Rótulo curto «qua 23» — separadores da tabela e chips de dia. */
  shortLabel: string;
  /** Rótulo longo «Quarta, 23» — cabeçalho fixo da lista mobile. */
  longLabel: string;
  /** Posição da primeira hora do grupo DENTRO do array passado. */
  startIndex: number;
  /** N.º de horas do grupo. */
  count: number;
}

/**
 * Agrupa horas consecutivas por dia civil (preserva a ordem do array).
 * `startIndex`/`count` são posições dentro de `hours` — quem fatiou antes
 * (visibleStart) soma esse deslocamento para obter o índice global.
 */
export function groupForecastDays(
  hours: readonly { time: string }[],
  locale: string,
): ForecastDayGroup[] {
  const groups: ForecastDayGroup[] = [];
  hours.forEach((h, i) => {
    const day = h.time.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.count += 1;
    } else {
      groups.push({
        day,
        shortLabel: formatDayShort(h.time, locale),
        longLabel: formatDayLong(h.time, locale),
        startIndex: i,
        count: 1,
      });
    }
  });
  return groups;
}
