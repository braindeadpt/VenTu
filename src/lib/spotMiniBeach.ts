/**
 * Geometria pura da mini-praia (#184): a linha de costa estilizada orientada
 * por `coastOrientation`, o leque onshore/cross, as setas de vento e de
 * ondulação, a posição do sol e a faixa nocturna.
 *
 * Tudo o que entra num atributo SVG sai daqui como número finito — se um
 * input faltar, o valor é substituído pelo defeito (nunca NaN, nunca
 * «attribute … Expected length» na consola).
 */

export const BEACH_W = 320;
export const BEACH_H = 200;
export const BEACH_VIEWBOX = `0 0 ${BEACH_W} ${BEACH_H}`;

const CX = BEACH_W / 2;
const CY = BEACH_H / 2;
const RAD = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Graus de bússola → vector unitário em coordenadas SVG (0° = Norte = cima). */
export function compassVec(deg: number): { x: number; y: number } {
  const a = (norm360(deg) - 90) * RAD;
  return { x: Math.cos(a), y: Math.sin(a) };
}

const finite = (v: number, fallback = 0) =>
  Number.isFinite(v) ? v : fallback;

const fmt = (v: number) => Math.round(finite(v) * 10) / 10;

const pt = (x: number, y: number) => `${fmt(x)} ${fmt(y)}`;

/** Costa canónica: serpenteia no eixo perpendicular ao «facing». */
function coastOffset(t: number): number {
  return 22 * Math.sin(t * 2.6 + 0.4) + 9 * Math.sin(t * 6.3 + 1.1);
}

export interface BeachGeometry {
  /** Polígono da terra (lado oposto ao mar). */
  landPoints: string;
  /** Polígono da água (lado do «facing»). */
  seaPoints: string;
  /** Caminho da linha de costa (faixa de areia desenhada por stroke). */
  coastPath: string;
  /** Ponto âncora no meio da praia (centro do leque e das setas). */
  anchor: { x: number; y: number };
  /** Ângulos do leque (semicírculo do lado do mar) em graus SVG. */
  fan: { onshore: string; crossNear: string; crossFar: string };
}

/**
 * Costa estilizada para um `coastOrientation` qualquer. A amostragem é no
 * eixo ao longo da costa (perpendicular ao facing) — com terra no lado
 * oposto e mar no lado do facing.
 */
export function beachGeometry(coastOrientation: number): BeachGeometry {
  const face = finite(coastOrientation, 270);
  const f = compassVec(face);
  const a = { x: -f.y, y: f.x }; // ao longo da costa

  const N = 24;
  const pts: Array<{ x: number; y: number }> = [];
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * 2 - 1;
    const along = t * 260;
    const off = coastOffset(t);
    pts.push({
      x: CX + a.x * along + f.x * off,
      y: CY + a.y * along + f.y * off,
    });
  }

  const EXT = 200;
  const landTail = [
    { x: pts[N].x - f.x * EXT, y: pts[N].y - f.y * EXT },
    { x: pts[0].x - f.x * EXT, y: pts[0].y - f.y * EXT },
  ];
  const seaTail = [
    { x: pts[N].x + f.x * EXT, y: pts[N].y + f.y * EXT },
    { x: pts[0].x + f.x * EXT, y: pts[0].y + f.y * EXT },
  ];

  const mid = pts[Math.floor(N / 2)];
  const anchor = {
    x: mid.x + f.x * 26,
    y: mid.y + f.y * 26,
  };

  return {
    landPoints: [...pts, ...landTail].map((p) => pt(p.x, p.y)).join(' '),
    seaPoints: [...pts, ...seaTail].map((p) => pt(p.x, p.y)).join(' '),
    coastPath: `M ${pts.map((p) => pt(p.x, p.y)).join(' L ')}`,
    anchor,
    fan: fanFor(a, f, anchor),
  };
}

interface FanParts {
  onshore: string;
  crossNear: string;
  crossFar: string;
}

/**
 * Leque = semicírculo de raio FAN_R centrado no anchor, do lado do mar,
 * dividido em 3 arcos: flanco -90°→-40°, zona central ±40° (onshore),
 * flanco +40°→+90°. Cada arco devolve um «d» de sector preenchível.
 */
const FAN_R = 58;

function fanFor(
  a: { x: number; y: number },
  f: { x: number; y: number },
  anchor: { x: number; y: number },
): FanParts {
  // Ângulos relativos à normal da costa (facing): o eixo «ao longo da costa»
  // corresponde a ±90°. Varremos de -90 (um flanco) a +90 (outro flanco).
  const sector = (r0: number, r1: number): string => {
    // r0→r1: ângulos relativos ao facing (negativo = um flanco, positivo = outro).
    // Ponto no círculo: anchor + rotated(f, rel) * R.
    const p0 = polar(anchor, f, a, r0, FAN_R);
    const p1 = polar(anchor, f, a, r1, FAN_R);
    const large = r1 - r0 > 180 ? 1 : 0;
    return `M ${pt(anchor.x, anchor.y)} L ${pt(p0.x, p0.y)} A ${FAN_R} ${FAN_R} 0 ${large} 1 ${pt(p1.x, p1.y)} Z`;
  };
  // Flancos: -90→-40 (perto) e +40→+90 (longe); centro -40→+40 (onshore).
  return {
    crossNear: sector(-90, -40),
    onshore: sector(-40, 40),
    crossFar: sector(40, 90),
  };
}

/** Ponto no leque: anchor + (f·cos(rel) + a·sin(rel)) · r — rel em graus. */
function polar(
  anchor: { x: number; y: number },
  f: { x: number; y: number },
  a: { x: number; y: number },
  relDeg: number,
  r: number,
): { x: number; y: number } {
  const rad = relDeg * RAD;
  return {
    x: anchor.x + (f.x * Math.cos(rad) + a.x * Math.sin(rad)) * r,
    y: anchor.y + (f.y * Math.cos(rad) + a.y * Math.sin(rad)) * r,
  };
}

/** Vector SVG → ângulo de rotação em graus (0 = +x). */
const svgAngle = (v: { x: number; y: number }) =>
  (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** Centro + rotação de uma seta — arrow aponta «para onde sopra». */
export function arrowTransform(
  anchor: { x: number; y: number },
  toDeg: number,
): string {
  const ang = svgAngle(compassVec(toDeg));
  return `translate(${fmt(anchor.x)} ${fmt(anchor.y)}) rotate(${fmt(ang)})`;
}

/**
 * Posição do sol/lua no arco superior: fração do dia [0,1] entre nascer e
 * pôr. Retorna null fora desse intervalo (noite → usar moonPos).
 */
export function sunPos(
  frac: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(frac) || frac < 0 || frac > 1) return null;
  const t = Math.PI * clamp(frac, 0, 1);
  return {
    x: CX - Math.cos(t) * 130,
    y: 165 - Math.sin(t) * 130,
  };
}

/** Mesma órbita para a lua durante a noite (fracção da noite). */
export function moonPos(frac: number): { x: number; y: number } {
  const t = Math.PI * clamp(finite(frac, 0.5), 0, 1);
  return {
    x: CX - Math.cos(t) * 110,
    y: 160 - Math.sin(t) * 115,
  };
}

export interface DayNightInput {
  /** ISO local da hora escolhida. */
  hourIso?: string;
  sunriseMin?: number | null;
  sunsetMin?: number | null;
}

/**
 * Minutos locais da hora escolhida vs nascer/pôr — diz se a hora é noite e
 * a fração do dia (posição do sol) ou da noite (posição da lua).
 */
export function dayNight({ hourIso, sunriseMin, sunsetMin }: DayNightInput): {
  isNight: boolean;
  dayFrac: number | null;
  nightFrac: number;
} {
  const mins = hourIso
    ? Number(hourIso.slice(11, 13)) * 60 + Number(hourIso.slice(14, 16))
    : NaN;
  if (
    !Number.isFinite(mins) ||
    sunriseMin == null ||
    sunsetMin == null ||
    !Number.isFinite(sunriseMin) ||
    !Number.isFinite(sunsetMin) ||
    sunsetMin <= sunriseMin
  ) {
    return { isNight: false, dayFrac: 0.5, nightFrac: 0 };
  }
  const isNight = mins < sunriseMin || mins >= sunsetMin;
  if (isNight) {
    const nightLen = 1440 - sunsetMin + sunriseMin;
    const sinceSet = mins >= sunsetMin ? mins - sunsetMin : mins + 1440 - sunsetMin;
    return {
      isNight: true,
      dayFrac: null,
      nightFrac: nightLen > 0 ? clamp(sinceSet / nightLen, 0, 1) : 0.5,
    };
  }
  return {
    isNight: false,
    dayFrac: clamp((mins - sunriseMin) / (sunsetMin - sunriseMin), 0, 1),
    nightFrac: 0,
  };
}
