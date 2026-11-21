/**
 * Conversão Europe/Lisbon ⇄ instante UTC — fonte única.
 *
 * Os dados do pipeline (previsões Open-Meteo, marés, frames de radar, datas
 * do Dawn Patrol e arquivos costeiros) são wall-time de Lisboa, quase sempre
 * sem offset e às vezes com um 'Z' falso. `new Date(str)` parseia no fuso do
 * browser: certo para um viewer em Lisboa, errado por horas para os outros,
 * e ambíguo nas mudanças de hora. Estas utils interpretam a string sempre
 * como Lisboa, DST-aware via Intl, e devolvem o instante real.
 */

import { VENTU_TIMEZONE } from '@/lib/timeOfDay';

/** A string traz desvio real (`Z`, `+01:00`, `-0100`)? Nesse caso já é um instante. */
const HAS_OFFSET_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const WALL_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2})(?::(\d{2}))?(?::(\d{2})(\.\d{1,9})?)?)?$/;

/** Offset (ms) de Europe/Lisbon para um instante UTC — verão +1h, inverno 0. */
export function lisbonUtcOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VENTU_TIMEZONE,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  // 'Z' torna o parse independente do fuso da máquina (CI corre em UTC).
  const wall = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  return new Date(wall + 'Z').getTime() - utcMs;
}

/**
 * Interpreta uma string wall-clock de Lisboa como instante UTC (ms).
 * Aceita "YYYY-MM-DD", "YYYY-MM-DDTHH[:MM[:SS[.fff]]]". Se a string traz um
 * desvio explícito (`Z`, `±hh:mm`) já é um instante e é parseada tal como
 * está (o fake-Z do radar IPMA — Lisboa com 'Z' — é tratado por
 * `lisbonFakeZToMs` em stormState, que o corta antes de chamar).
 * NaN se a string não casar ou for uma data inválida.
 */
export function lisbonWallToMs(wallClockStr: string): number {
  const s = wallClockStr.trim();
  if (HAS_OFFSET_RE.test(s)) return Date.parse(s);
  const m = WALL_RE.exec(s);
  if (!m) return NaN;
  const normalized = `${m[1]}T${m[2] ?? '00'}:${m[3] ?? '00'}:${m[4] ?? '00'}${m[5] ?? ''}`;
  const wallMs = new Date(normalized + 'Z').getTime();
  if (!Number.isFinite(wallMs)) return NaN;
  // Itera o offset: uma passagem resolve quase tudo, a segunda apanha o
  // limiar da mudança de hora (a hora de Lisboa muda dentro da iteração).
  let guess = wallMs;
  for (let i = 0; i < 4; i += 1) {
    const next = wallMs - lisbonUtcOffsetMs(guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** Mesmo que `lisbonWallToMs` mas devolve `Date`; NaN → Date inválido. */
export function lisbonWallToDate(wallClockStr: string): Date {
  return new Date(lisbonWallToMs(wallClockStr));
}

/** Calendar YYYY-MM-DD em Europe/Lisbon (nunca UTC via toISOString). */
export function lisbonDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VENTU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Label de um dia do pipeline ("YYYY-MM-DD", data de Lisboa) no locale do
 * viewer — sempre o dia de Lisboa, independente do fuso do browser.
 * `localeTag` é um BCP-47 tag ('pt-PT', 'en-GB', …).
 */
export function formatLisbonDay(
  dateStr: string,
  localeTag: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const ms = lisbonWallToMs(`${dateStr}T12:00:00`);
  if (!Number.isFinite(ms)) return dateStr;
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: VENTU_TIMEZONE,
    ...options,
  }).format(new Date(ms));
}
