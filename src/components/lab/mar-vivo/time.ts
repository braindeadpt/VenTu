/**
 * Tempo e sol para o lab «Mar vivo».
 *
 * `map-hours.json` guarda horas locais de Lisboa sem fuso (`2026-10-07T18:00`).
 * Para o sombreamento dia/noite precisamos do instante UTC real.
 */

const LISBON_TZ = 'Europe/Lisbon';

let offsetFmt: Intl.DateTimeFormat | null = null;

/** Minutos que Lisboa está à frente de UTC no instante `utcMs`. */
function lisbonOffsetMinutes(utcMs: number): number {
  offsetFmt ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of offsetFmt.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
  return Math.round((asUtc - utcMs) / 60000);
}

function parseLocal(iso: string): [number, number, number, number] {
  const [date, time = '00'] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = Number(time.slice(0, 2));
  return [y, m, d, h];
}

/** Hora local de Lisboa (`YYYY-MM-DDTHH[:mm]`) → epoch ms UTC. */
export function lisbonLocalToUtcMs(iso: string): number {
  const [y, m, d, h] = parseLocal(iso);
  const guess = Date.UTC(y, m - 1, d, h);
  let utc = guess - lisbonOffsetMinutes(guess) * 60000;
  // Segunda passagem acerta as horas que caem na mudança de hora.
  utc = guess - lisbonOffsetMinutes(utc) * 60000;
  return utc;
}

/** Etiqueta curta «qui 08 · 15h» a partir de uma hora local de Lisboa. */
export function formatLisbonLabel(iso: string, weekdays: readonly string[]): {
  day: string;
  hour: string;
} {
  const [y, m, d, h] = parseLocal(iso);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    day: `${weekdays[wd]} ${String(d).padStart(2, '0')}`,
    hour: `${String(h).padStart(2, '0')}h`,
  };
}

const RAD = Math.PI / 180;

/**
 * Altitude do sol (graus) — aproximação NOAA/Almanac, erro < 1°, chega para
 * decidir o sombreamento noite/crepúsculo.
 */
export function sunAltitudeDeg(utcMs: number, lat: number, lon: number): number {
  const d = utcMs / 86400000 - 10957.5; // dias desde J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  return (
    Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)) / RAD
  );
}

/** Opacidade do véu nocturno: 0 de dia, sobe no crepúsculo civil/náutico. */
export function nightVeilOpacity(sunAltDeg: number, max = 0.42): number {
  const t = Math.min(1, Math.max(0, (4 - sunAltDeg) / 16)); // +4° → −12°
  return max * t * t * (3 - 2 * t);
}
