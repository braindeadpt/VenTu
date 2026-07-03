/**
 * Smart update schedule in Europe/Lisbon (handles DST via Intl).
 *
 * Full (Open-Meteo + IH + obs + index): even hours 06–20, plus 00 and 04.
 * Observations-only (IH + IPMA + Ecowitt merge): odd hours 07–19.
 */

const LISBON_TZ = 'Europe/Lisbon';

const DAY_START = 6;
const DAY_END = 20;
const DAY_INTERVAL_H = 2;
const NIGHT_INTERVAL_H = 4;

/** @typedef {'full' | 'observations' | 'skip'} UpdateMode */

/**
 * @param {Date} [now]
 * @returns {{ hour: number; minute: number }}
 */
function getLisbonParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

/**
 * @param {Date} [now]
 * @returns {UpdateMode}
 */
function getUpdateMode(now = new Date()) {
  const { hour } = getLisbonParts(now);

  // Dia: 06, 08, 10, 12, 14, 16, 18, 20
  if (hour >= DAY_START && hour <= DAY_END && (hour - DAY_START) % DAY_INTERVAL_H === 0) {
    return 'full';
  }

  // Noite: 00, 04 (20h já coberto pelo bloco diurno)
  if (hour < DAY_START && hour % NIGHT_INTERVAL_H === 0) {
    return 'full';
  }

  // Entre corridas Open-Meteo de dia: refrescar observações
  if (hour >= DAY_START + 1 && hour <= DAY_END - 1 && hour % DAY_INTERVAL_H === 1) {
    return 'observations';
  }

  return 'skip';
}

function describeSchedule(locale = 'pt') {
  const isPt = locale === 'pt';
  if (isPt) {
    return 'Previsões Open-Meteo: de 2h em 2h (06h–20h Lisboa) e de 4h em 4h de noite (00h, 04h). Observações IH/IPMA: horas ímpares entre atualizações de dia.';
  }
  return 'Open-Meteo forecasts: every 2h (06:00–20:00 Lisbon) and every 4h at night (00:00, 04:00). IH/IPMA observations: odd hours between daytime model runs.';
}

function nextFullRunHint(now = new Date()) {
  for (let i = 0; i < 48; i++) {
    const d = new Date(now.getTime() + i * 60 * 60 * 1000);
    const { hour, minute } = getLisbonParts(d);
    if (minute !== 0) continue;
    if (getUpdateMode(d) === 'full') {
      return { hour, date: d };
    }
  }
  return null;
}

module.exports = {
  LISBON_TZ,
  DAY_START,
  DAY_END,
  DAY_INTERVAL_H,
  NIGHT_INTERVAL_H,
  getLisbonParts,
  getUpdateMode,
  describeSchedule,
  nextFullRunHint,
};
