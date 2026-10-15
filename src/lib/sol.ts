/**
 * Posição do sol em cliente (#184, partilhado com a #183): algoritmo da NOAA
 * (Solar Calculator, equações de Meeus simplificadas; erro < 0,1° entre ±72°
 * de latitude, chega para «noite / sol baixo» e para a luz da cena 3D).
 *
 * Os forecasts do pipeline não trazem `sunEl`/`sunAz`; calculam-se aqui a
 * partir da hora e das coordenadas do spot. As horas do pipeline são
 * wall-time de Lisboa (`timezone=Europe/Lisbon` em todos os pedidos), por isso
 * `instanteLisboa()` converte a hora de parede no instante UTC.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Desvio de Lisboa face a UTC (minutos) no instante `ms`. */
export function desvioLisboaMin(ms: number): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((wall - Math.floor(ms / 60000) * 60000) / 60000);
}

/** `YYYY-MM-DDTHH:mm` (hora de parede em Lisboa) → instante (ms UTC). */
export function instanteLisboa(t: string): number {
  const y = +t.slice(0, 4);
  const mo = +t.slice(5, 7);
  const d = +t.slice(8, 10);
  const h = +t.slice(11, 13) || 0;
  const mi = +t.slice(14, 16) || 0;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // duas passagens chegam para as mudanças de hora
  let off = desvioLisboaMin(wall);
  off = desvioLisboaMin(wall - off * 60000);
  return wall - off * 60000;
}

/** Instante (ms) → `YYYY-MM-DDTHH:mm` em Lisboa. */
export function paredeLisboa(ms: number): string {
  const off = desvioLisboaMin(ms);
  return new Date(ms + off * 60000).toISOString().slice(0, 16);
}

function sec(jc: number) {
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C =
    Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD));
  return { decl, eqTime };
}

/** Elevação (com refracção) e azimute do sol, em graus, no instante `ms`. */
export function posicaoSol(ms: number, lat: number, lon: number): { el: number; az: number } {
  const jd = ms / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const { decl, eqTime } = sec(jc);
  const utcMin = ((ms / 60000) % 1440 + 1440) % 1440;
  let tst = (utcMin + eqTime + 4 * lon) % 1440;
  if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;
  const cosZ =
    Math.sin(lat * RAD) * Math.sin(decl * RAD) +
    Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZ))) * DEG;
  const elev = 90 - zen;
  // refracção atmosférica (NOAA)
  let refr = 0;
  if (elev <= 85) {
    const te = Math.tan(elev * RAD);
    if (elev > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elev > -0.575)
      refr = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
    else refr = -20.774 / te;
    refr /= 3600;
  }
  let az: number;
  const azDen = Math.cos(lat * RAD) * Math.sin(zen * RAD);
  if (Math.abs(azDen) > 0.001) {
    let azRad = (Math.sin(lat * RAD) * Math.cos(zen * RAD) - Math.sin(decl * RAD)) / azDen;
    azRad = Math.max(-1, Math.min(1, azRad));
    az = 180 - Math.acos(azRad) * DEG;
    if (ha > 0) az = -az;
  } else {
    az = lat > 0 ? 180 : 0;
  }
  az = ((az % 360) + 360) % 360;
  return { el: Math.round((elev + refr) * 10) / 10, az: Math.round(az) };
}

/** Nascer e pôr do sol (hora de parede em Lisboa, `HH:mm`) de um dia `YYYY-MM-DD`. */
export function nascerPor(dia: string, lat: number, lon: number): { nascer: string; por: string } | null {
  // procura por minuto à volta da elevação −0,833° (bordo superior + refracção)
  const meiaNoite = instanteLisboa(`${dia}T00:00`);
  const alvo = -0.833;
  const el = (ms: number) => {
    const jd = ms / 86400000 + 2440587.5;
    const jc = (jd - 2451545) / 36525;
    const { decl, eqTime } = sec(jc);
    const utcMin = ((ms / 60000) % 1440 + 1440) % 1440;
    let tst = (utcMin + eqTime + 4 * lon) % 1440;
    if (tst < 0) tst += 1440;
    const ha = tst / 4 - 180;
    const cosZ =
      Math.sin(lat * RAD) * Math.sin(decl * RAD) +
      Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD);
    return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) * DEG;
  };
  let nascer: number | null = null;
  let por: number | null = null;
  let prev = el(meiaNoite);
  for (let m = 1; m <= 1440; m++) {
    const ms = meiaNoite + m * 60000;
    const cur = el(ms);
    if (prev < alvo && cur >= alvo && nascer == null) nascer = ms;
    if (prev >= alvo && cur < alvo && nascer != null) por = ms;
    prev = cur;
  }
  if (nascer == null || por == null) return null;
  return { nascer: paredeLisboa(nascer).slice(11, 16), por: paredeLisboa(por).slice(11, 16) };
}
