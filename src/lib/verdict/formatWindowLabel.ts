import { formatWeekday } from '@/lib/verdict/formatHourLabel';

/**
 * Etiqueta «melhor: …» da régua de 48 h (spec v3 §3). Os índices da janela
 * (spotWindows) são do eixo completo — aqui ficam RECORTADOS à janela
 * visível, e o fim é exclusivo (escreve «00h» do dia seguinte, nunca «24h»).
 *
 *   mesmo dia        → «ter 06–14h · pico 10h (78)»
 *   muda de dia      → «ter 22h – qua 14h · pico qua 06h (82)»
 *   começou antes    → «agora–14h · pico ter 15h» / «agora – ter 14h»
 *   cobre >70 %      → «bom quase todo o período · pico qui 16h (85)»
 *
 * O pico procura-se SÓ dentro da janela visível — um máximo fora do ecrã
 * não pode ser anunciado («pico sáb 12h» quando sábado nem se vê era o bug
 * da auditoria S4). O weekday do pico cai quando a janela é de um só dia
 * que já o mostra no início («ter 06–14h · pico 10h»).
 */

const ISO_HOUR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** Limiar de cobertura: a janela ocupa >70 % do eixo visível. */
export const WIDE_WINDOW_COVERAGE = 0.7;

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

const GOOD_ALL_PERIOD: Record<string, string> = {
  pt: 'bom quase todo o período',
  en: 'good almost the whole period',
  es: 'bueno casi todo el período',
  de: 'fast durchgehend gut',
  fr: 'bon presque toute la période',
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

/** Índice do máximo de `scores` dentro de [from, to] — primeiro em empate. */
export function peakIndexInRange(
  scores: readonly number[],
  from: number,
  to: number,
): number {
  let peak = from;
  let best = -Infinity;
  for (let i = from; i <= to; i++) {
    const s = scores[i];
    if (typeof s === 'number' && s > best) {
      best = s;
      peak = i;
    }
  }
  return peak;
}

/**
 * `window` ({startIdx,endIdx} inclusivos no eixo completo) é recortada a
 * [windowStart, windowEnd) — fim exclusivo. `scores` são os scores
 * MOSTRADOS por hora no eixo completo (a régua já injecta o «agora»
 * corrigido — o pico anunciado bate com a barra que se vê). Devolve null se
 * a janela não intersecta a parte visível.
 */
export function formatWindowLabel(
  hours: readonly string[],
  scores: readonly number[],
  window: { startIdx: number; endIdx: number },
  windowStart: number,
  windowEnd: number,
  locale: string,
): string | null {
  const s = Math.max(window.startIdx, windowStart);
  const e = Math.min(window.endIdx, windowEnd - 1);
  if (s > e || !hours[s] || !hours[e]) return null;

  const visibleN = Math.max(1, windowEnd - windowStart);
  const coverage = (e - s + 1) / visibleN;

  // Pico dentro da parte visível (regra v3 — nunca fora do ecrã).
  const peakIdx = peakIndexInRange(scores, s, e);
  const peakScore = scores[peakIdx];
  const peakIso = hours[peakIdx];
  const peak = PEAK_WORD[locale] ?? PEAK_WORD.en;
  const peakPart =
    peakIso && typeof peakScore === 'number'
      ? ` · ${peak} ${formatWeekday(peakIso, locale)} ${hh(peakIso)}h (${peakScore})`
      : '';

  // Janela quase total: a faixa não precisa de horas — diz-se o que é.
  if (coverage > WIDE_WINDOW_COVERAGE) {
    const all = GOOD_ALL_PERIOD[locale] ?? GOOD_ALL_PERIOD.en;
    return `${all}${peakPart}`;
  }

  const startedBefore = window.startIdx < windowStart;
  const now = NOW_WORD[locale] ?? NOW_WORD.en;

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

  // O weekday do pico só é preciso quando o range não ancora o dia —
  // janela de um dia com início visível já o mostra («ter 06–14h · pico 10h»).
  const showPeakDay = !sameDay || startedBefore;
  const peakInline =
    peakIso && typeof peakScore === 'number'
      ? ` · ${peak} ${
          showPeakDay ? `${formatWeekday(peakIso, locale)} ` : ''
        }${hh(peakIso)}h (${peakScore})`
      : '';

  return `${range}${peakInline}`;
}
