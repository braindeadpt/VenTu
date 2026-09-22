import { formatWeekday } from '@/lib/verdict/formatHourLabel';

/**
 * Etiqueta «melhor: …» da régua de 48 h. Os índices da janela (spotWindows)
 * são do eixo completo — aqui ficam RECORTADOS à janela visível, e o fim é
 * exclusivo (escreve «00h» do dia seguinte, nunca «24h»).
 *
 *   mesmo dia        → «ter 06–14h»
 *   muda de dia      → «seg 22h – ter 14h»
 *   começou antes    → «agora–14h» / «agora – ter 14h»
 *   pico             → «· pico ter 12h (78)»
 */

const ISO_HOUR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** «agora» minúsculo por locale — o marcador vive dentro da frase da régua. */
const NOW_WORD: Record<string, string> = {
  pt: 'agora',
  en: 'now',
  es: 'ahora',
  de: 'jetzt',
  fr: 'maintenant',
};

const PEAK_WORD: Record<string, string> = {
  pt: 'pico',
  en: 'peak',
  es: 'pico',
  de: 'Peak',
  fr: 'pic',
};

const hh = (iso: string) => iso.slice(11, 13);
const day = (iso: string) => iso.slice(0, 10);

/** ISO wall-time +1 h — aritmética UTC sobre os componentes (sem fuso da máquina). */
function addHourIso(iso: string): string {
  const m = ISO_HOUR.exec(iso);
  if (!m) return iso;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4])) + 3_600_000;
  const d = new Date(t);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00`;
}

/**
 * `startIdx`/`endIdx` são inclusivos no eixo completo; `windowStart`/
 * `windowEnd` delimitam a janela visível (end exclusivo). Devolve null se a
 * janela não intersecta a parte visível.
 */
export function formatWindowLabel(
  hours: readonly string[],
  startIdx: number,
  endIdx: number,
  peakIdx: number,
  peakScore: number,
  windowStart: number,
  windowEnd: number,
  locale: string,
): string | null {
  const s = Math.max(startIdx, windowStart);
  const e = Math.min(endIdx, windowEnd - 1);
  if (s > e || !hours[s] || !hours[e]) return null;

  const startedBefore = startIdx < windowStart;
  const now = NOW_WORD[locale] ?? NOW_WORD.en;
  const peak = PEAK_WORD[locale] ?? PEAK_WORD.en;

  // Fim exclusivo: a hora a seguir à última — a do eixo se existir, senão +1 h.
  const endIso = hours[e + 1] ?? addHourIso(hours[e]);
  const sameDay = day(hours[s]) === day(endIso);

  let range: string;
  if (sameDay) {
    const start = startedBefore ? now : `${formatWeekday(hours[s], locale)} ${hh(hours[s])}`;
    range = `${start}–${hh(endIso)}h`;
  } else {
    const start = startedBefore
      ? now
      : `${formatWeekday(hours[s], locale)} ${hh(hours[s])}h`;
    range = `${start} – ${formatWeekday(endIso, locale)} ${hh(endIso)}h`;
  }

  const peakIso = hours[peakIdx];
  if (peakIso) {
    range += ` · ${peak} ${formatWeekday(peakIso, locale)} ${hh(peakIso)}h (${peakScore})`;
  }
  return range;
}
