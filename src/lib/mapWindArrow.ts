/**
 * Compound spot marker — score pin + wind ray (Option A).
 *
 * Single SVG: wind vector emerges from the score circle rim (not a floating arrow).
 * VenTu “wind ray”: slim stem + open chevron tip, colour/length ∝ speed.
 */

import { getCardinalLabel } from '@/lib/wind';

export const MARKER_VIEWBOX_W = 88;
export const MARKER_VIEWBOX_H = 94;
export const MARKER_MIN_PX = 56;
export const MARKER_MAX_PX = 76;
const MARKER_BASE_ZOOM = 8;
const PIN_R = 17;
const PIN_CX = MARKER_VIEWBOX_W / 2;
const PIN_CY = 38;
const TAIL_H = 8;
const HALO = 'rgba(255,255,255,0.92)';
const OUTLINE = 'rgba(15,23,42,0.88)';

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Windy-inspired speed ramp — legible on dark + satellite tiles. */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [56, 189, 248];
  if (speedKt < 14) return [52, 211, 153];
  if (speedKt < 22) return [34, 211, 238];
  if (speedKt < 30) return [251, 191, 36];
  return [248, 113, 113];
}

/** Ray length beyond the score circle (viewBox px). */
export function windRayLength(speedKt: number): number {
  if (speedKt < 5) return 14;
  if (speedKt < 12) return 20;
  if (speedKt < 20) return 26;
  if (speedKt < 30) return 32;
  return 38;
}

export function markerPxForZoom(zoom: number): number {
  if (zoom <= MARKER_BASE_ZOOM) return MARKER_MIN_PX;
  const t = Math.min(1, (zoom - MARKER_BASE_ZOOM) / 5);
  return Math.round(MARKER_MIN_PX + t * (MARKER_MAX_PX - MARKER_MIN_PX));
}

/** @deprecated alias */
export const windArrowPxForZoom = markerPxForZoom;
export const windArrowShaftLength = windRayLength;

export function markerWindArrowLayout(showWind: boolean, markerPx = MARKER_MAX_PX): {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
} {
  const scale = markerPx / MARKER_VIEWBOX_W;
  const w = Math.round(MARKER_VIEWBOX_W * scale);
  const h = Math.round(MARKER_VIEWBOX_H * scale);

  if (!showWind) {
    return {
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -46],
    };
  }

  return {
    iconSize: [w, h],
    iconAnchor: [Math.round(w / 2), h],
    popupAnchor: [0, -h],
  };
}

export function buildMapWindArrowTitle(fromDeg: number, speedKt: number, locale: string): string {
  const card = getCardinalLabel(fromDeg);
  const kt = Math.round(speedKt);
  return locale === 'pt'
    ? `${kt} kt de ${card} · raio = para onde sopra · cor = intensidade`
    : `${kt} kt from ${card} · ray = flow · color = strength`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Unit vector (SVG coords): meteo blow direction → screen. */
export function blowUnitVector(blowDeg: number): { ux: number; uy: number } {
  const rad = (blowDeg * Math.PI) / 180;
  return { ux: Math.sin(rad), uy: -Math.cos(rad) };
}

export interface WindRayGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  chevron: string;
}

/** Ray from circle rim along blow direction + open chevron tip. */
export function windRayGeometry(
  blowDeg: number,
  rayLen: number,
  cx = PIN_CX,
  cy = PIN_CY,
  r = PIN_R,
): WindRayGeometry {
  const { ux, uy } = blowUnitVector(blowDeg);
  const x1 = cx + ux * r;
  const y1 = cy + uy * r;
  const x2 = cx + ux * (r + rayLen);
  const y2 = cy + uy * (r + rayLen);
  const head = 7;
  const half = 4.2;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy;
  const py = ux;
  const chevron = [
    `M${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L${(bx + px * half).toFixed(2)} ${(by + py * half).toFixed(2)}`,
    `M${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L${(bx - px * half).toFixed(2)} ${(by - py * half).toFixed(2)}`,
  ].join(' ');

  return { x1, y1, x2, y2, chevron };
}

function buildWindRaySvg(blowDeg: number, speedKt: number): string {
  const rayLen = windRayLength(speedKt);
  const [r, g, b] = windArrowColorRgb(speedKt);
  const stroke = `rgb(${r},${g},${b})`;
  const { x1, y1, x2, y2, chevron } = windRayGeometry(blowDeg, rayLen);

  return `
    <g class="ventu-wind-ray" data-speed-kt="${Math.round(speedKt)}">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${OUTLINE}" stroke-width="5" stroke-linecap="round"/>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${HALO}" stroke-width="3.2" stroke-linecap="round"/>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="${chevron}" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="${chevron}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
  `.trim();
}

function buildPinSvg(score: number, scoreRgb: string): string {
  const tailTop = PIN_CY + PIN_R;
  const tailTip = tailTop + TAIL_H;
  const scoreLabel = Math.round(score);

  return `
    <g class="ventu-marker-pin">
      <path d="M${PIN_CX - 6} ${tailTop} L${PIN_CX} ${tailTip} L${PIN_CX + 6} ${tailTop} Z" fill="${scoreRgb}"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R + 2.5}" fill="${OUTLINE}"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R}" fill="${scoreRgb}" stroke="${HALO}" stroke-width="2"/>
      <text x="${PIN_CX}" y="${PIN_CY + 4.5}" text-anchor="middle"
        font-family="var(--font-geist-mono, 'Geist Mono', ui-monospace, monospace)"
        font-size="13" font-weight="700" fill="#fff"
        font-variant-numeric="tabular-nums">${scoreLabel}</text>
    </g>
  `.trim();
}

/** Compound marker: wind ray under score pin (single glyph). */
export function buildCompoundSpotMarkerSvg(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
): string {
  const blow = windBlowsToDegrees(fromDeg);
  const windLayer = showWind ? buildWindRaySvg(blow, speedKt) : '';
  const pinLayer = buildPinSvg(score, scoreRgb);

  return `
    <svg class="ventu-compound-marker" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${MARKER_VIEWBOX_W} ${MARKER_VIEWBOX_H}" aria-hidden="true">
      ${windLayer}
      ${pinLayer}
    </svg>
  `.trim();
}

export function buildCompoundSpotMarkerHtml(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
  locale: string,
  markerPx = MARKER_MIN_PX,
): string {
  const title = showWind
    ? escapeHtmlAttr(buildMapWindArrowTitle(fromDeg, speedKt, locale))
    : '';
  const svg = buildCompoundSpotMarkerSvg(score, scoreRgb, fromDeg, speedKt, showWind);
  const w = Math.round((markerPx / MARKER_VIEWBOX_W) * MARKER_VIEWBOX_W);
  const h = Math.round((markerPx / MARKER_VIEWBOX_W) * MARKER_VIEWBOX_H);

  return `
    <div class="ventu-spot-marker-wrap ventu-marker-enter ventu-compound-marker-wrap"
      style="width:${w}px;height:${h}px;cursor:pointer"${title ? ` title="${title}"` : ''}>
      ${svg}
    </div>
  `.trim();
}

/** @deprecated */
export const buildSpotWindArrowSvg = buildCompoundSpotMarkerSvg;
export const buildMapWindArrowHtml = buildCompoundSpotMarkerHtml;
