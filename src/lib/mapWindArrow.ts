/**
 * VenTu spot marker — compound score pin + Windy-style wind wedge.
 *
 * Athlete UX: scan the coast and read direction + intensity in one glance.
 * Wind wedge = filled bar (like Windy “reported wind”), not a thin chevron.
 */

import { getCardinalLabel } from '@/lib/wind';

export const MARKER_VIEWBOX_W = 128;
export const MARKER_VIEWBOX_H = 136;
export const MARKER_MIN_PX = 88;
export const MARKER_MAX_PX = 124;
const MARKER_BASE_ZOOM = 7;
const PIN_R = 20;
const PIN_CX = MARKER_VIEWBOX_W / 2;
const PIN_CY = 56;
const TAIL_H = 10;
const HALO = 'rgba(255,255,255,0.95)';
const OUTLINE = 'rgba(8,15,30,0.92)';

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Saturated ramp — readable on dark map + satellite (Windy-style steps). */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [14, 165, 233];
  if (speedKt < 14) return [34, 197, 94];
  if (speedKt < 22) return [6, 182, 212];
  if (speedKt < 30) return [245, 158, 11];
  return [239, 68, 68];
}

/** Wedge length beyond score circle (viewBox px) — always visible. */
export function windRayLength(speedKt: number): number {
  if (speedKt < 5) return 32;
  if (speedKt < 12) return 40;
  if (speedKt < 20) return 48;
  if (speedKt < 30) return 56;
  return 64;
}

export function windWedgeHalfWidth(speedKt: number): number {
  return 7 + Math.min(Math.max(speedKt, 4), 36) * 0.22;
}

export function markerPxForZoom(zoom: number): number {
  if (zoom <= MARKER_BASE_ZOOM) return MARKER_MIN_PX;
  const t = Math.min(1, (zoom - MARKER_BASE_ZOOM) / 6);
  return Math.round(MARKER_MIN_PX + t * (MARKER_MAX_PX - MARKER_MIN_PX));
}

export const windArrowPxForZoom = markerPxForZoom;
export const windArrowShaftLength = windRayLength;

export function markerWindArrowLayout(showWind: boolean, markerPx = MARKER_MAX_PX): {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
} {
  if (!showWind) {
    return {
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -46],
    };
  }

  const scale = markerPx / MARKER_VIEWBOX_W;
  const w = Math.round(MARKER_VIEWBOX_W * scale);
  const h = Math.round(MARKER_VIEWBOX_H * scale);

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
    ? `${kt} kt de ${card} · asa = para onde sopra · cor = intensidade`
    : `${kt} kt from ${card} · wedge = flow · color = strength`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function blowUnitVector(blowDeg: number): { ux: number; uy: number } {
  const rad = (blowDeg * Math.PI) / 180;
  return { ux: Math.sin(rad), uy: -Math.cos(rad) };
}

/** Filled wind wedge polygon (Windy reported-wind style). */
export function windWedgePolygon(
  blowDeg: number,
  speedKt: number,
  cx = PIN_CX,
  cy = PIN_CY,
  r = PIN_R,
): string {
  const { ux, uy } = blowUnitVector(blowDeg);
  const len = windRayLength(speedKt);
  const half = windWedgeHalfWidth(speedKt);
  const px = -uy;
  const py = ux;

  const bx = cx + ux * r;
  const by = cy + uy * r;
  const tipX = cx + ux * (r + len);
  const tipY = cy + uy * (r + len);

  const p1x = bx - px * half;
  const p1y = by - py * half;
  const p2x = bx + px * half;
  const p2y = by + py * half;

  return `M${p1x.toFixed(1)} ${p1y.toFixed(1)} L${p2x.toFixed(1)} ${p2y.toFixed(1)} L${tipX.toFixed(1)} ${tipY.toFixed(1)} Z`;
}

function buildWindWedgeSvg(blowDeg: number, speedKt: number): string {
  const [r, g, b] = windArrowColorRgb(speedKt);
  const fill = `rgb(${r},${g},${b})`;
  const d = windWedgePolygon(blowDeg, speedKt);

  return `
    <g class="ventu-wind-wedge" data-speed-kt="${Math.round(speedKt)}">
      <path d="${d}" fill="${OUTLINE}" stroke="none" transform="translate(0.8,0.8)"/>
      <path d="${d}" fill="${fill}" stroke="${HALO}" stroke-width="2" stroke-linejoin="round"/>
    </g>
  `.trim();
}

function buildPinSvg(score: number, scoreRgb: string): string {
  const tailTop = PIN_CY + PIN_R;
  const tailTip = tailTop + TAIL_H;
  const scoreLabel = Math.round(score);

  return `
    <g class="ventu-marker-pin">
      <path d="M${PIN_CX - 7} ${tailTop} L${PIN_CX} ${tailTip} L${PIN_CX + 7} ${tailTop} Z" fill="${scoreRgb}" stroke="${OUTLINE}" stroke-width="1"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R + 3}" fill="${OUTLINE}"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R}" fill="${scoreRgb}" stroke="${HALO}" stroke-width="2.5"/>
      <text x="${PIN_CX}" y="${PIN_CY + 5}" text-anchor="middle"
        font-family="var(--font-geist-mono, 'Geist Mono', ui-monospace, monospace)"
        font-size="14" font-weight="700" fill="#fff"
        font-variant-numeric="tabular-nums">${scoreLabel}</text>
    </g>
  `.trim();
}

export function buildCompoundSpotMarkerSvg(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
): string {
  const blow = windBlowsToDegrees(fromDeg);
  const windLayer = showWind ? buildWindWedgeSvg(blow, speedKt) : '';
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
  const w = markerPx;
  const h = Math.round(markerPx * (MARKER_VIEWBOX_H / MARKER_VIEWBOX_W));

  return `
    <div class="ventu-spot-marker-wrap ventu-marker-enter ventu-compound-marker-wrap"
      style="width:${w}px;height:${h}px;cursor:pointer"${title ? ` title="${title}"` : ''}>
      ${svg}
    </div>
  `.trim();
}

export const buildSpotWindArrowSvg = buildCompoundSpotMarkerSvg;
export const buildMapWindArrowHtml = buildCompoundSpotMarkerHtml;

/** @deprecated use windWedgePolygon */
export function windRayGeometry(blowDeg: number, rayLen: number, cx?: number, cy?: number, r?: number) {
  const d = windWedgePolygon(blowDeg, 12, cx, cy, r);
  return { x1: 0, y1: 0, x2: 0, y2: rayLen, chevron: d };
}
