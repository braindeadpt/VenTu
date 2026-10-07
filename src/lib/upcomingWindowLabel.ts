/**
 * Rótulo das «Próximas janelas» da home.
 *
 * Os ISO do forecast são hora local do spot (`2026-10-07T22:00`) — a hora e o
 * dia lêem-se directamente da string, como no resto da secção. Uma janela que
 * atravessa a meia-noite era escrita «Hoje 22–10h» (fim < início, parece um
 * intervalo ao contrário); agora diz explicitamente o dia do fim:
 * «Hoje 22h – amanhã 10h».
 */

export interface UpcomingWindowLabelParts {
  /** Dia do início («Hoje», «Amanhã», «Sex»). */
  day: string;
  /** Horas: «07–12h» no mesmo dia, «22h – amanhã 10h» quando atravessa a noite. */
  hours: string;
  /** true quando o fim cai noutro dia de calendário. */
  crossesMidnight: boolean;
}

const LOWERCASE_WEEKDAY_LOCALES = new Set(['pt', 'es', 'fr']);

function hh(iso: string): string {
  return iso.slice(11, 13);
}

function lowerFirst(text: string, locale: string): string {
  return text.charAt(0).toLocaleLowerCase(locale) + text.slice(1);
}

export function formatUpcomingWindowLabel(
  startIso: string,
  endIso: string,
  dayLabel: (iso: string) => string,
  locale: string,
  tomorrowLabel: string,
): UpcomingWindowLabelParts {
  const day = dayLabel(startIso);
  const crossesMidnight = endIso.slice(0, 10) !== startIso.slice(0, 10);
  if (!crossesMidnight) {
    return { day, hours: `${hh(startIso)}–${hh(endIso)}h`, crossesMidnight };
  }
  const endDayRaw = dayLabel(endIso);
  // A meio da frase «amanhã»/«tomorrow»/«morgen» vai em minúscula. Dias da
  // semana só em PT/ES/FR (em EN/DE «Fri»/«Fr» mantêm a maiúscula).
  const endDay =
    endDayRaw === tomorrowLabel || LOWERCASE_WEEKDAY_LOCALES.has(locale)
      ? lowerFirst(endDayRaw, locale)
      : endDayRaw;
  return {
    day,
    hours: `${hh(startIso)}h – ${endDay} ${hh(endIso)}h`,
    crossesMidnight,
  };
}
