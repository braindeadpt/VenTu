/**
 * Nascer/pôr do sol — algoritmo NOAA (equação solar clássica, altitude do
 * limbo −0.833°, ~0.908° de zenith a partir do centro). Sem dependências.
 *
 * `dateISO` é a data civil local do spot ('YYYY-MM-DD') — a mesma data que as
 * horas Open-Meteo trazem (wall time). `timeZone` só documenta a que civil
 * date se refere; o resultado é o instante real (Date UTC), que formatado em
 * `timeZone` dá a hora local — a mudança de hora sai certa porque a conversão
 * final é feita por Intl, não por um offset fixo.
 *
 * Devolve null quando o Sol não nasce/não se põe nesse dia (noite polar /
 * sol de meia-noite) — o chamador trata como «sem sombra de noite».
 */
export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

const RAD = Math.PI / 180;
const ZENITH_DEG = 90.833;

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const norm24 = (h: number) => ((h % 24) + 24) % 24;

function dayOfYear(y: number, m: number, d: number): number {
  const isLeap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cum[m - 1] + d + (isLeap && m > 2 ? 1 : 0);
}

/** Hora UTC (0–24) do evento solar; null se não acontece nesse dia. */
function sunEventUtcHours(
  y: number,
  m: number,
  d: number,
  lat: number,
  lon: number,
  rising: boolean,
): number | null {
  const n = dayOfYear(y, m, d);
  const lngHour = lon / 15;
  const t = n + ((rising ? 6 : 18) - lngHour) / 24;

  const M = 0.9856 * t - 3.289; // anomalia média do Sol
  const L = norm360(
    M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634,
  ); // longitude verdadeira

  let ra = norm360(Math.atan(0.91764 * Math.tan(L * RAD)) / RAD);
  ra += Math.floor(L / 90) * 90 - Math.floor(ra / 90) * 90; // mesmo quadrante de L
  ra /= 15;

  const sinDec = 0.39782 * Math.sin(L * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(ZENITH_DEG * RAD) - sinDec * Math.sin(lat * RAD)) /
    (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;

  const h =
    (rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  const T = h + ra - 0.06571 * t - 6.622;
  return norm24(T - lngHour);
}

export function sunTimes(
  dateISO: string,
  lat: number,
  lon: number,
  _timeZone: string,
): SunTimes | null {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return null;

  const riseUtc = sunEventUtcHours(y, m, d, lat, lon, true);
  const setUtc = sunEventUtcHours(y, m, d, lat, lon, false);
  if (riseUtc === null || setUtc === null) return null;

  const dayUtcMs = Date.UTC(y, m - 1, d);
  return {
    sunrise: new Date(dayUtcMs + riseUtc * 3_600_000),
    sunset: new Date(dayUtcMs + setUtc * 3_600_000),
  };
}
