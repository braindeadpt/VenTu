/**
 * Rótulos da hora escolhida no eixo de tempo partilhado. As horas do eixo são
 * wall-time Open-Meteo (Europe/Lisbon, sem offset) — a formatação extrai os
 * componentes da própria string, por isso é estável em qualquer fuso da
 * máquina e reproduz o bake (React #418).
 *
 * Weekday/mês saem de tabelas fixas de 3 letras — o Intl 'short' varia entre
 * versões de ICU («qui.» vs «quinta») e a régua precisa de largura estável.
 */

const ISO_HOUR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function parseHourParts(hour: string) {
  const m = ISO_HOUR.exec(hour);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), hh: m[4], mm: m[5] };
}

/** '14:00' — hora local curta (24 h, igual em pt e en-GB). */
export function formatHourLabel(hour: string, _locale: string): string {
  const p = parseHourParts(hour);
  return p ? `${p.hh}:${p.mm}` : '--:--';
}

/** 'qui 17' — marcador de dia na régua de 48 h. */
export function formatDayShort(hour: string, locale: string): string {
  const p = parseHourParts(hour);
  if (!p) return '';
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).getUTCDay();
  const wd = (locale === 'pt' ? WEEKDAYS_PT : WEEKDAYS_EN)[dow];
  return `${wd} ${p.d}`;
}

/** 'qui 17 set, 12:00' — rótulo longo para aria-valuetext e cabeçalhos. */
export function formatHourLong(hour: string, locale: string): string {
  const p = parseHourParts(hour);
  if (!p) return '--:--';
  // A data é wall-time local do spot; o weekday vem do dia civil em UTC —
  // determinístico em qualquer máquina.
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).getUTCDay();
  const isPt = locale === 'pt';
  const wd = (isPt ? WEEKDAYS_PT : WEEKDAYS_EN)[dow];
  const mo = (isPt ? MONTHS_PT : MONTHS_EN)[p.mo - 1];
  return `${wd} ${p.d} ${mo}, ${p.hh}:${p.mm}`;
}
