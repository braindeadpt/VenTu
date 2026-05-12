'use client';

import { useEffect, useRef, useState } from 'react';
import { getWindRelationToCoast, getCardinalLabel } from '@/lib/wind';

/* ═══════════════════════════════════════════════════════════════════════
 *  SwellRadar — Wave incidence & wind relation diagram.
 *
 *  The product's most distinctive visual. Shows in one circular diagram:
 *    • Swell direction   (where waves come from)
 *    • Wind direction    (where wind comes from)
 *    • Coast plane       (which side is land, which is sea)
 *
 *  Allows instant reading of:
 *    • "Is swell hitting the coast head-on?"
 *    • "Is wind offshore, onshore, or cross?"
 *    • "Is wind aligned with swell or opposing it?"
 *
 *  @example
 *  // Epic scenario: swell W head-on, wind E offshore
 *  <SwellRadar
 *    swellDirection={270} swellHeight={2.1} swellPeriod={10}
 *    windDirection={90} windSpeed={18}
 *    coastOrientation={270}
 *  />
 *
 *  @example
 *  // Marginal: swell NW lateral, wind W onshore
 *  <SwellRadar
 *    swellDirection={315} swellHeight={1.8}
 *    windDirection={270} windSpeed={22}
 *    coastOrientation={270}
 *  />
 *
 *  @example
 *  // Minimal mode — no coast, no wind, just swell
 *  <SwellRadar swellDirection={180} swellHeight={0.6} size="sm" showLegend={false} />
 *
 *  @example
 *  // Legacy numeric size (snaps to preset)
 *  <SwellRadar swellDirection={45} swellHeight={1.2} size={100} />
 *
 *  ═══════════════════════════════════════════════════════════════════════ */

type SizeKey = 'sm' | 'md' | 'lg';
type WindRelation = 'offshore' | 'onshore' | 'cross';

interface SwellRadarProps {
  /** Swell direction in degrees (0–360), where it COMES FROM. */
  swellDirection: number;
  /** Swell height in meters (controls arrow thickness). */
  swellHeight?: number;
  /** Swell period in seconds (shown in legend). */
  swellPeriod?: number;
  /** Wind direction in degrees (0–360), where it COMES FROM. Optional. */
  windDirection?: number;
  /** Wind speed (controls arrow opacity). Optional. */
  windSpeed?: number;
  /** Coast normal pointing to sea (degrees). Optional — enables coast plane. */
  coastOrientation?: number;
  /**
   * Radar size. Accepts preset strings or a legacy number:
   *   ≤100 → sm (96px), ≤160 → md (144px), >160 → lg (192px)
   */
  size?: SizeKey | number;
  /** Show legend overlay below radar. Default: true. */
  showLegend?: boolean;
}

/* ──────────── size presets ──────────── */
const SIZE_PRESETS: Record<SizeKey, number> = {
  sm: 96,
  md: 144,
  lg: 192,
};

interface SizeConfig {
  preset: SizeKey;
  px: number;
  viewBox: number;
  trackRadius: number;
  strokeTrack: number;
  strokeTick: number;
  fontCardinal: string;
  fontIncidence: string;
}

function resolveSize(input?: SizeKey | number): SizeConfig {
  let preset: SizeKey;
  if (typeof input === 'number') {
    if (input <= 100) preset = 'sm';
    else if (input <= 160) preset = 'md';
    else preset = 'lg';
  } else {
    preset = input ?? 'md';
  }
  const px = SIZE_PRESETS[preset];
  return {
    preset,
    px,
    viewBox: px,
    trackRadius: px * 0.44,
    strokeTrack: preset === 'sm' ? 1.5 : 2,
    strokeTick: preset === 'sm' ? 1 : 1.5,
    fontCardinal: preset === 'sm' ? 'text-meta-sm' : 'text-meta',
    fontIncidence: 'text-num-xs',
  };
}

/* ──────────── swell arrow thickness by height ──────────── */
function getSwellStroke(height?: number): number {
  if (height === undefined) return 4;
  if (height < 1) return 3;
  if (height < 2.5) return 5;
  if (height < 4) return 7;
  return 9;
}

/* ──────────── wind arrow opacity by speed ──────────── */
function getWindOpacity(speed?: number): number {
  if (speed === undefined) return 0.7;
  if (speed < 5) return 0.4;
  if (speed < 15) return 0.7;
  return 0.95;
}

/* ──────────── incidence angle (0–90, 0 = perpendicular ideal) ──────────── */
function getIncidenceAngle(swellDir: number, coastDir: number): number {
  const diff = ((swellDir - coastDir + 540) % 360) - 180;
  return Math.abs(diff);
}

/* ──────────── ease-out-expo ──────────── */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/* ──────────── SVG arc helpers ──────────── */
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArcFlag = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  COMPONENT
 *  ═══════════════════════════════════════════════════════════════════════ */

export default function SwellRadar({
  swellDirection,
  swellHeight,
  swellPeriod,
  windDirection,
  windSpeed,
  coastOrientation,
  size,
  showLegend = true,
}: SwellRadarProps) {
  const cfg = resolveSize(size);
  const c = cfg.viewBox / 2;
  const R = cfg.trackRadius;

  /* ── coast plane math ── */
  const hasCoast = coastOrientation !== undefined;
  const coastAngle = coastOrientation ?? 0;
  // Perpendicular to coast orientation (coast line itself)
  const coastPerp = (coastAngle + 90) % 360;

  /* ── wind relation ── */
  const windRelation: WindRelation | null =
    hasCoast && windDirection !== undefined
      ? getWindRelationToCoast(windDirection, coastAngle)
      : null;

  /* ── incidence angle ── */
  const incidenceDeg = hasCoast ? getIncidenceAngle(swellDirection, coastAngle) : null;

  /* ── animated rotation values ── */
  const swellTarget = (swellDirection + 180) % 360;
  const windTarget = windDirection !== undefined ? (windDirection + 180) % 360 : null;

  const [swellRot, setSwellRot] = useState(0);
  const [windRot, setWindRot] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const prevSwell = useRef(0);
  const prevWind = useRef(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setSwellRot(swellTarget);
      if (windTarget !== null) setWindRot(windTarget);
      setFadeIn(1);
      hasAnimated.current = true;
      return;
    }

    const duration = 600;
    const start = performance.now();

    let deltaSwell = swellTarget - prevSwell.current;
    while (deltaSwell > 180) deltaSwell -= 360;
    while (deltaSwell < -180) deltaSwell += 360;

    let deltaWind = windTarget !== null ? windTarget - prevWind.current : 0;
    while (deltaWind > 180) deltaWind -= 360;
    while (deltaWind < -180) deltaWind += 360;

    hasAnimated.current = true;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);

      setSwellRot(prevSwell.current + deltaSwell * eased);
      if (windTarget !== null) {
        // 200ms delay for wind arrow
        const windProgress = Math.max(0, Math.min((elapsed - 200) / (duration - 200), 1));
        setWindRot(prevWind.current + deltaWind * easeOutExpo(windProgress));
      }
      setFadeIn(Math.min(progress * 1.5, 1)); // fade-in faster

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        prevSwell.current = swellTarget;
        if (windTarget !== null) prevWind.current = windTarget;
      }
    };

    requestAnimationFrame(tick);
  }, [swellTarget, windTarget]);

  /* ── arrow geometry ── */
  // Swell arrow: from edge towards center, length ~55% of R
  const swellLen = R * 0.55;
  const swellStart = polarToCartesian(c, c, R + 2, swellDirection); // slight outside
  const swellEnd = polarToCartesian(c, c, R - swellLen, swellDirection);

  // Wind arrow: from edge towards center, length ~40% of R, ends further from center
  const windLen = R * 0.40;
  const windStart = windDirection !== undefined
    ? polarToCartesian(c, c, R + 2, windDirection)
    : null;
  const windEnd = windDirection !== undefined
    ? polarToCartesian(c, c, R - windLen, windDirection)
    : null;

  // Spot marker position
  const markerPos = hasCoast
    ? polarToCartesian(c, c, R * 0.15, coastAngle)
    : { x: c, y: c };
  const markerR = R * 0.04;

  /* ── wind color ── */
  let windColor: string;
  if (windRelation === 'offshore') windColor = 'rgb(var(--windDir-offshore))';
  else if (windRelation === 'onshore') windColor = 'rgb(var(--windDir-onshore))';
  else if (windRelation === 'cross') windColor = 'rgb(var(--windDir-cross))';
  else windColor = 'rgb(var(--data-wind))';

  /* ── swell color ── */
  const swellColor = 'rgb(var(--data-waves))';

  /* ── incidence color ── */
  const incidenceColor =
    incidenceDeg !== null
      ? incidenceDeg < 30
        ? 'rgb(var(--data-waves))'
        : incidenceDeg <= 60
          ? 'rgb(var(--fg-muted))'
          : 'rgb(var(--fg-subtle))'
      : null;

  /* ── a11y ── */
  const ariaParts: string[] = [`Swell from ${getCardinalLabel(swellDirection)}`];
  if (swellHeight !== undefined) ariaParts.push(`${swellHeight} meters`);
  if (swellPeriod !== undefined) ariaParts.push(`${swellPeriod} seconds`);
  if (windDirection !== undefined && windSpeed !== undefined) {
    ariaParts.push(`Wind from ${getCardinalLabel(windDirection)} at ${windSpeed}`);
    if (windRelation) ariaParts.push(windRelation);
  }
  if (hasCoast) ariaParts.push(`Coast facing ${getCardinalLabel(coastAngle)}`);
  if (incidenceDeg !== null) ariaParts.push(`Incidence angle: ${incidenceDeg.toFixed(0)} degrees`);
  const ariaLabel = ariaParts.join('. ');

  return (
    <div role="img" aria-label={ariaLabel} className="inline-flex flex-col items-center gap-3">
      {/* ── SVG canvas ── */}
      <div className="relative" style={{ width: cfg.px, height: cfg.px }}>
        <svg viewBox={`0 0 ${cfg.viewBox} ${cfg.viewBox}`} className="w-full h-full" aria-hidden="true">
          <defs>
            {/* Clip paths for coast semicircles */}
            {hasCoast && (
              <>
                <clipPath id={`seaClip-${cfg.preset}`}>
                  <path d={describeSemicircle(c, c, R, coastAngle, true)} />
                </clipPath>
                <clipPath id={`landClip-${cfg.preset}`}>
                  <path d={describeSemicircle(c, c, R, coastAngle, false)} />
                </clipPath>
              </>
            )}
          </defs>

          {/* Coast plane semicircles */}
          {hasCoast && (
            <g opacity={fadeIn}>
              {/* Sea side */}
              <circle cx={c} cy={c} r={R} fill="rgb(var(--data-waves) / 0.08)" clipPath={`url(#seaClip-${cfg.preset})`} />
              {/* Land side */}
              <circle cx={c} cy={c} r={R} fill="rgb(var(--surface-1-rgb) / 0.75)" clipPath={`url(#landClip-${cfg.preset})`} />
              {/* Coast line */}
              <line
                x1={c - R * Math.cos(((coastAngle - 90) * Math.PI) / 180)}
                y1={c - R * Math.sin(((coastAngle - 90) * Math.PI) / 180)}
                x2={c + R * Math.cos(((coastAngle - 90) * Math.PI) / 180)}
                y2={c + R * Math.sin(((coastAngle - 90) * Math.PI) / 180)}
                stroke="rgb(var(--divider-strong))"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            </g>
          )}

          {/* Track circle */}
          <circle cx={c} cy={c} r={R} fill="none" stroke="rgb(var(--divider))" strokeWidth={cfg.strokeTrack} />

          {/* Cardinal labels */}
          <text x={c} y={c - R + 8} textAnchor="middle" className={`fill-current ${cfg.fontCardinal} text-fg-subtle font-semibold`} aria-hidden="true">N</text>
          <text x={c} y={c + R - 4} textAnchor="middle" className={`fill-current ${cfg.fontCardinal} text-fg-subtle`} aria-hidden="true">S</text>
          <text x={c + R - 6} y={c + 3} textAnchor="middle" className={`fill-current ${cfg.fontCardinal} text-fg-subtle`} aria-hidden="true">E</text>
          <text x={c - R + 6} y={c + 3} textAnchor="middle" className={`fill-current ${cfg.fontCardinal} text-fg-subtle`} aria-hidden="true">W</text>

          {/* Intermediate ticks (lg only) */}
          {cfg.preset === 'lg' && [45, 135, 225, 315].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const inner = R * 0.90;
            const outer = R * 0.98;
            return (
              <line key={angle}
                x1={c + inner * Math.cos(rad)} y1={c + inner * Math.sin(rad)}
                x2={c + outer * Math.cos(rad)} y2={c + outer * Math.sin(rad)}
                stroke="rgb(var(--divider-rgb) / 0.5)" strokeWidth={cfg.strokeTick}
              />
            );
          })}

          {/* Swell arrow (chevron style) */}
          <g transform={`rotate(${swellRot} ${c} ${c})`}>
            {/* Body line */}
            <line x1={swellStart.x} y1={swellStart.y} x2={swellEnd.x} y2={swellEnd.y}
              stroke={swellColor} strokeWidth={getSwellStroke(swellHeight)} strokeLinecap="round" />
            {/* Chevron head */}
            <polyline
              points={chevronPoints(swellEnd.x, swellEnd.y, swellDirection, R * 0.12)}
              fill="none" stroke={swellColor} strokeWidth={getSwellStroke(swellHeight) * 1.5} strokeLinecap="round" strokeLinejoin="round"
            />
          </g>

          {/* Wind arrow (small filled triangle) */}
          {windStart && windEnd && (
            <g transform={`rotate(${windRot} ${c} ${c})`} opacity={getWindOpacity(windSpeed)}>
              {/* Body */}
              <line x1={windStart.x} y1={windStart.y} x2={windEnd.x} y2={windEnd.y}
                stroke={windColor} strokeWidth={2.5} strokeLinecap="round" />
              {/* Triangle head */}
              <polygon
                points={trianglePoints(windEnd.x, windEnd.y, windDirection ?? 0, R * 0.08)}
                fill={windColor}
              />
            </g>
          )}

          {/* Spot marker */}
          <circle cx={markerPos.x} cy={markerPos.y} r={markerR}
            fill="rgb(var(--fg))" stroke="rgb(var(--bg-base))" strokeWidth={1} />

          {/* Incidence angle indicator */}
          {incidenceDeg !== null && incidenceColor !== null && (
            <text x={c + R * 0.35} y={c - R * 0.25} textAnchor="middle"
              className={`fill-current ${cfg.fontIncidence} font-mono tabular-nums`}
              style={{ color: incidenceColor }} aria-hidden="true">
              {incidenceDeg.toFixed(0)}°
            </text>
          )}
        </svg>
      </div>

      {/* ── Legend overlay ── */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-muted">
          <span>
            <span className="text-fg-subtle">Swell:</span>{' '}
            <span className="text-fg font-mono tabular-nums">
              {swellHeight !== undefined ? `${swellHeight.toFixed(1)}m ` : ''}
              {swellPeriod !== undefined ? `${swellPeriod.toFixed(0)}s ` : ''}
              {getCardinalLabel(swellDirection)}
            </span>
          </span>
          {windDirection !== undefined && windSpeed !== undefined && (
            <span>
              <span className="text-fg-subtle">Wind:</span>{' '}
              <span className="text-fg font-mono tabular-nums">
                {windSpeed.toFixed(0)}kt {getCardinalLabel(windDirection)}
              </span>
              {windRelation && (
                <span className={`ml-1 ${
                  windRelation === 'offshore' ? 'text-windDir-offshore' :
                  windRelation === 'onshore' ? 'text-windDir-onshore' :
                  'text-windDir-cross'
                }`}>
                  {windRelation}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────── chevron head points ──────────── */
function chevronPoints(x: number, y: number, direction: number, size: number): string {
  // Chevron opens opposite to direction (pointing towards center)
  const angle = ((direction + 180 - 90) * Math.PI) / 180;
  const tip = polarToCartesian(x, y, size, direction + 180);
  const left = {
    x: x + size * 0.6 * Math.cos(angle),
    y: y + size * 0.6 * Math.sin(angle),
  };
  const right = {
    x: x + size * 0.6 * Math.cos(angle + Math.PI),
    y: y + size * 0.6 * Math.sin(angle + Math.PI),
  };
  return `${left.x},${left.y} ${tip.x},${tip.y} ${right.x},${right.y}`;
}

/* ──────────── triangle head points ──────────── */
function trianglePoints(x: number, y: number, direction: number, size: number): string {
  const tip = polarToCartesian(x, y, size, direction + 180);
  const baseAngle = ((direction + 180 - 90) * Math.PI) / 180;
  const left = {
    x: x + size * 0.5 * Math.cos(baseAngle),
    y: y + size * 0.5 * Math.sin(baseAngle),
  };
  const right = {
    x: x + size * 0.5 * Math.cos(baseAngle + Math.PI),
    y: y + size * 0.5 * Math.sin(baseAngle + Math.PI),
  };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

/* ──────────── semicircle clip path ──────────── */
function describeSemicircle(cx: number, cy: number, r: number, coastAngle: number, isSeaSide: boolean): string {
  const perp = (coastAngle + 90) % 360;
  // Sea side is the direction coastAngle points to
  const seaStart = coastAngle - 90;
  const seaEnd = coastAngle + 90;
  
  if (isSeaSide) {
    return describeArc(cx, cy, r, seaStart, seaEnd) + ` L ${cx} ${cy} Z`;
  } else {
    return describeArc(cx, cy, r, seaEnd, seaStart + 360) + ` L ${cx} ${cy} Z`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TEST NOTES — verify visually
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1.  4 Scenarios:
 *      • Epic:   swellDirection=270, coastOrientation=270, windDirection=90
 *                → swell de frente (incidence ~0°), wind offshore (green)
 *      • Good:   swellDirection=300, coastOrientation=270, windDirection=45
 *                → swell ligeiramente lateral, wind cross
 *      • Poor:   swellDirection=315, coastOrientation=270, windDirection=270
 *                → swell lateral, wind onshore (red)
 *      • Minimal: swellDirection=180, no coast, no wind
 *                → só swell arrow, sem terra/mar, marker no centro
 *
 *  2.  Arrow directions:
 *      • Swell arrow originates at edge, points TOWARDS center (spot).
 *      • Wind arrow same pattern, smaller and fainter.
 *      • Both follow meteorological convention: direction + 180 visually.
 *
 *  3.  Labels N/S/E/W stay static regardless of directions.
 *
 *  4.  Coast plane:
 *      • Only visible when coastOrientation prop provided.
 *      • Sea side: subtle blue tint. Land side: subtle grey tint.
 *      • Coast line: dashed, perpendicular to coastOrientation.
 *      • Spot marker sits on coast line (or center if no coast).
 *
 *  5.  Wind colors with coast:
 *      • offshore → green needle, onshore → red, cross → grey.
 *      • Without coast → amber (data-wind) regardless.
 *
 *  6.  Incidence angle:
 *      • <30° → blue text (good), 30-60° → white/muted, >60° → subtle.
 *      • Only visible when both swellDirection and coastOrientation present.
 *
 *  7.  Animation:
 *      • First mount: coast fades in, swell arrow draws, wind arrow delayed.
 *      • Direction change: smooth rotation 400ms ease-out-expo.
 *      • prefers-reduced-motion: instant, no animation.
 *
 *  8.  Sizes:
 *      • sm=96px, md=144px, lg=192px. Numeric values snap correctly.
 *
 *  9.  Legend:
 *      • Compact, below radar. Omits missing props gracefully.
 *      • Offshore/onshore tag colored accordingly.
 */
