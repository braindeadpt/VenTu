/**
 * VenTu spot marker — score pin + integrated wind ring.
 *
 * Wind ring: thin arc on the pin rim (no external arrows) coloured by
 * offshore / onshore / cross relative to coastOrientation.
 */

import {
  getCardinalLabel,
  getWindRelationLabel,
  getWindRelationToCoast,
  type WindRelation,
} from '@/lib/wind';

export const MARKER_VIEWBOX_W = 56;
export const MARKER_VIEWBOX_H = 60;
export const PIN_R = 17;
export const PIN_CX = MARKER_VIEWBOX_W / 2;
export const PIN_CY = 22;
export const PIN_TAIL_H = 8;
/** Y coordinate of the pin tail tip in the marker viewBox (Leaflet anchor). */
export const MARKER_TAIL_TIP_Y = PIN_CY + PIN_R + PIN_TAIL_H;
const TAIL_H = PIN_TAIL_H;
const HALO = 'rgba(255,255,255,0.95)';
const OUTLINE = 'rgba(8,15,30,0.92)';
/** Arc centreline ~5px outside the white score rim. */
export const WIND_RING_R = PIN_R + 2.5 + 5;
export const WIND_RING_STROKE = 3.75;

export function windBlowsToDegrees(fromDeg: number): number {
  return ((fromDeg + 180) % 360 + 360) % 360;
}

/** Arc span encodes wind strength — never use opacity for force. */
export function windRingArcSpanDegrees(speedKt: number): number {
  if (speedKt < 8) return 40;
  if (speedKt <= 18) return 70;
  return 100;
}

export function windRingRelation(
  windFromDeg: number,
  coastOrientation?: number,
): WindRelation | null {
  if (coastOrientation === undefined) return null;
  return getWindRelationToCoast(windFromDeg, coastOrientation);
}

export function windRingRelationClass(relation: WindRelation | null): string {
  if (relation === 'offshore') return 'ventu-wind-ring--offshore';
  if (relation === 'onshore') return 'ventu-wind-ring--onshore';
  return 'ventu-wind-ring--cross';
}

/** @deprecated WindFlowGlyph speed ramp — not used on map ring. */
export function windArrowColorRgb(speedKt: number): [number, number, number] {
  if (speedKt < 8) return [14, 165, 233];
  if (speedKt < 14) return [34, 197, 94];
  if (speedKt < 22) return [6, 182, 212];
  if (speedKt < 30) return [245, 158, 11];
  return [239, 68, 68];
}

/** @deprecated WindFlowGlyph shaft length. */
export function windArrowShaftLength(speedKt: number): number {
  if (speedKt < 5) return 32;
  if (speedKt < 12) return 40;
  if (speedKt < 20) return 48;
  if (speedKt < 30) return 56;
  return 64;
}

export function polarOnCircle(
  cx: number,
  cy: number,
  r: number,
  azimuthDeg: number,
): { x: number; y: number } {
  const rad = (azimuthDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

/**
 * SVG arc path (meteorological azimuth: 0° = north, clockwise).
 */
export function describeWindRingArc(
  blowAzimuthDeg: number,
  spanDeg: number,
  cx = PIN_CX,
  cy = PIN_CY,
  r = WIND_RING_R,
): string {
  const start = blowAzimuthDeg - spanDeg / 2;
  const end = blowAzimuthDeg + spanDeg / 2;
  const p0 = polarOnCircle(cx, cy, r, start);
  const p1 = polarOnCircle(cx, cy, r, end);
  const large = spanDeg > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Small outward-pointing tip at arc midpoint. */
export function windRingTipPolygon(
  blowAzimuthDeg: number,
  cx = PIN_CX,
  cy = PIN_CY,
  r = WIND_RING_R,
): string {
  const tipLen = 5;
  const halfW = 3.2;
  const tip = polarOnCircle(cx, cy, r + tipLen, blowAzimuthDeg);
  const { ux, uy } = blowUnitVector(blowAzimuthDeg);
  const px = -uy;
  const py = ux;
  const base = polarOnCircle(cx, cy, r - 0.5, blowAzimuthDeg);
  const b1x = base.x - px * halfW;
  const b1y = base.y - py * halfW;
  const b2x = base.x + px * halfW;
  const b2y = base.y + py * halfW;
  return `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${b1x.toFixed(2)} ${b1y.toFixed(2)} L ${b2x.toFixed(2)} ${b2y.toFixed(2)} Z`;
}

export function blowUnitVector(blowDeg: number): { ux: number; uy: number } {
  const rad = (blowDeg * Math.PI) / 180;
  return { ux: Math.sin(rad), uy: -Math.cos(rad) };
}

export function buildMapWindRingTitle(
  fromDeg: number,
  speedKt: number,
  coastOrientation: number | undefined,
  locale: string,
): string {
  const card = getCardinalLabel(fromDeg);
  const kt = Math.round(speedKt);
  const relation = windRingRelation(fromDeg, coastOrientation);
  const relLabel =
    relation != null
      ? getWindRelationLabel(relation, locale === 'pt' ? 'pt' : 'en').label
      : null;
  if (locale === 'pt') {
    return relLabel
      ? `${kt} kt de ${card} · ${relLabel} · arco = para onde sopra`
      : `${kt} kt de ${card} · arco = para onde sopra`;
  }
  return relLabel
    ? `${kt} kt from ${card} · ${relLabel} · arc = flow direction`
    : `${kt} kt from ${card} · arc = flow direction`;
}

export function buildWindRingSvg(
  fromDeg: number,
  speedKt: number,
  coastOrientation?: number,
): string {
  const blow = windBlowsToDegrees(fromDeg);
  const span = windRingArcSpanDegrees(speedKt);
  const arcD = describeWindRingArc(blow, span);
  const tipD = windRingTipPolygon(blow);
  const relation = windRingRelation(fromDeg, coastOrientation);
  const relClass = windRingRelationClass(relation);

  return `
    <g class="ventu-wind-ring ${relClass}" data-speed-kt="${Math.round(speedKt)}" data-span-deg="${span}">
      <path class="ventu-wind-ring-halo" d="${arcD}" fill="none" stroke-width="${WIND_RING_STROKE + 2}" stroke-linecap="round"/>
      <path class="ventu-wind-ring-arc" d="${arcD}" fill="none" stroke-width="${WIND_RING_STROKE}" stroke-linecap="round"/>
      <path class="ventu-wind-ring-tip" d="${tipD}"/>
    </g>
  `.trim();
}

function buildPinSvg(score: number, scoreRgb: string): string {
  const tailTop = PIN_CY + PIN_R;
  const tailTip = tailTop + TAIL_H;
  const scoreLabel = Math.round(score);

  return `
    <g class="ventu-marker-pin">
      <path d="M${PIN_CX - 6} ${tailTop} L${PIN_CX} ${tailTip} L${PIN_CX + 6} ${tailTop} Z" fill="${scoreRgb}" stroke="${OUTLINE}" stroke-width="1"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R + 2.5}" fill="${OUTLINE}"/>
      <circle cx="${PIN_CX}" cy="${PIN_CY}" r="${PIN_R}" fill="${scoreRgb}" stroke="${HALO}" stroke-width="2.5"/>
      <text x="${PIN_CX}" y="${PIN_CY + 5}" text-anchor="middle"
        font-family="var(--font-geist-mono, 'Geist Mono', ui-monospace, monospace)"
        font-size="13" font-weight="700" fill="#fff"
        font-variant-numeric="tabular-nums">${scoreLabel}</text>
    </g>
  `.trim();
}

/** Demo marker for WindRingLegend — offshore, medium strength. */
export const WIND_RING_LEGEND_SAMPLE = {
  score: 78,
  fromDeg: 90,
  speedKt: 14,
  coastOrientation: 270,
} as const;

export function buildWindRingMarkerSvg(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
  coastOrientation?: number,
): string {
  const windLayer = showWind ? buildWindRingSvg(fromDeg, speedKt, coastOrientation) : '';
  const pinLayer = buildPinSvg(score, scoreRgb);

  return `
    <svg class="ventu-wind-ring-marker" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${MARKER_VIEWBOX_W} ${MARKER_VIEWBOX_H}" aria-hidden="true">
      ${windLayer}
      ${pinLayer}
    </svg>
  `.trim();
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function buildWindRingMarkerHtml(
  score: number,
  scoreRgb: string,
  fromDeg: number,
  speedKt: number,
  showWind: boolean,
  locale: string,
  coastOrientation?: number,
): string {
  const title = showWind
    ? escapeHtmlAttr(buildMapWindRingTitle(fromDeg, speedKt, coastOrientation, locale))
    : '';
  const svg = buildWindRingMarkerSvg(score, scoreRgb, fromDeg, speedKt, showWind, coastOrientation);

  return `
    <div class="ventu-spot-marker-wrap ventu-marker-enter ventu-wind-ring-marker-wrap"
      style="width:${MARKER_VIEWBOX_W}px;height:${MARKER_TAIL_TIP_Y}px;cursor:pointer"${title ? ` title="${title}"` : ''}>
      ${svg}
    </div>
  `.trim();
}

export function markerIconLayout(showWind: boolean): {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
} {
  const w = MARKER_VIEWBOX_W;
  const anchorY = MARKER_TAIL_TIP_Y;
  if (!showWind) {
    return {
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -46],
    };
  }
  return {
    iconSize: [w, anchorY],
    iconAnchor: [Math.round(w / 2), anchorY],
    popupAnchor: [0, -(anchorY + 2)],
  };
}

/** @deprecated use markerIconLayout */
export const markerWindArrowLayout = markerIconLayout;

/** @deprecated use buildWindRingMarkerHtml */
export const buildCompoundSpotMarkerHtml = buildWindRingMarkerHtml;

/** @deprecated use buildWindRingMarkerSvg */
export const buildCompoundSpotMarkerSvg = buildWindRingMarkerSvg;

/** @deprecated */
export const buildMapWindArrowHtml = buildWindRingMarkerHtml;

/** @deprecated */
export const MARKER_MIN_PX = MARKER_VIEWBOX_W;
export const MARKER_MAX_PX = MARKER_VIEWBOX_W;

/** @deprecated */
export function markerPxForZoom(_zoom: number): number {
  return MARKER_VIEWBOX_W;
}
