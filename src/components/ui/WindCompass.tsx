'use client';

import { useEffect, useRef, useState } from 'react';
import { getCardinalLabel, getWindRelationToCoast } from '@/lib/wind';

/* ═══════════════════════════════════════════════════════════════════════
 *  WindCompass — Meteorological wind direction compass with animated needle.
 *
 *  Signature visual component. Shows wind direction (where it COMES FROM),
 *  speed, gust spread, and offshore/onshore tint when coast orientation
 *  is known. The needle points WHERE the wind GOES (meteorological convention).
 *
 *  @example
 *  // Default — shows direction, speed, and cardinal labels
 *  <WindCompass direction={45} speed={18} unit="kt" />
 *
 *  @example
 *  // With coast orientation — needle tint shows offshore (green) vs onshore (red)
 *  <WindCompass direction={270} speed={25} gust={35} unit="kt" coastOrientation={270} />
 *
 *  @example
 *  // Large, no speed display — for hero sections
 *  <WindCompass direction={90} size="lg" showSpeed={false} />
 *
 *  @example
 *  // Legacy numeric size (snaps to nearest preset)
 *  <WindCompass direction={0} speed={12} size={48} />
 *
 *  @example
 *  // No wind — shows em-dash
 *  <WindCompass direction={0} speed={0} />
 *
 *  ═══════════════════════════════════════════════════════════════════════ */

type SizeKey = 'sm' | 'md' | 'lg';

type WindUnit = 'kt' | 'kmh' | 'ms';

type WindRelation = 'offshore' | 'onshore' | 'cross' | 'unknown';

interface WindCompassProps {
  /** Wind direction in degrees (0–360). 0 = from North. */
  direction: number;
  /** Wind speed. `undefined` hides speed; `0` shows "—". */
  speed?: number;
  /** Gust speed (same unit as speed). Shows arc spread when provided. */
  gust?: number;
  /** Unit label. Default: 'kt'. */
  unit?: WindUnit;
  /** Coast normal pointing to sea (degrees). Enables offshore/onshore tint. */
  coastOrientation?: number;
  /**
   * Compass size. Accepts preset strings ('sm' | 'md' | 'lg') or a
   * legacy number which snaps to the nearest preset:
   *   ≤80 → sm (64px), ≤120 → md (96px), >120 → lg (144px)
   *
   * @deprecated Prefer string presets ('sm' | 'md' | 'lg') for stable design.
   */
  size?: SizeKey | number;
  /** Show speed number in centre. Default: true. */
  showSpeed?: boolean;
}

/* ──────────── size presets ──────────── */
const SIZE_PRESETS: Record<SizeKey, number> = {
  sm: 64,
  md: 96,
  lg: 144,
};

interface SizeConfig {
  preset: SizeKey;
  px: number;        // resolved pixel size
  viewBox: number;   // SVG viewBox = 0 0 viewBox viewBox
  trackRadius: number;
  strokeTrack: number;
  strokeTick: number;
  fontCardinal: string; // Tailwind class
  fontSpeed: string;
  fontUnit: string;
  fontGust: string;
}

function resolveSize(input?: SizeKey | number): SizeConfig {
  let preset: SizeKey;
  if (typeof input === 'number') {
    if (input <= 80) preset = 'sm';
    else if (input <= 120) preset = 'md';
    else preset = 'lg';
  } else {
    preset = input ?? 'md';
  }

  const px = SIZE_PRESETS[preset];

  return {
    preset,
    px,
    viewBox: px,
    trackRadius: px * 0.42,
    strokeTrack: preset === 'sm' ? 1.5 : preset === 'md' ? 2 : 2.5,
    strokeTick: preset === 'sm' ? 1 : 1.5,
    fontCardinal: preset === 'sm' ? 'text-meta-sm' : 'text-meta',
    fontSpeed: preset === 'sm' ? 'text-num-sm' : preset === 'md' ? 'text-num' : 'text-num-lg',
    fontUnit: preset === 'sm' ? 'text-meta-sm' : 'text-meta',
    fontGust: 'text-num-xs',
  };
}

/* ──────────── wind direction → cardinal label ──────────── */
/* ──────────── wind strength color (Tailwind class, literal) ────────────
 *  Returns a literal Tailwind text-* class.  Keep literal — no purge risk.
 *  ─────────────────────────────────────────────────────────────────── */
function getWindStrengthColor(speed: number, relation: WindRelation): string {
  // No speed = neutral
  if (speed <= 0) return 'text-fg-subtle';

  // With coast orientation: use windDir tokens
  if (relation !== 'unknown') {
    if (speed > 30) return 'text-windDir-onshore';   // strong = danger red
    if (speed >= 20) {
      return relation === 'offshore' ? 'text-windDir-offshore' : 'text-data-wind';
    }
    if (speed >= 10) return 'text-data-wind';
    return 'text-fg-muted';
  }

  // Without coast orientation: intensity only
  if (speed > 30) return 'text-windDir-onshore';
  if (speed >= 20) return 'text-data-wind';
  if (speed >= 10) return 'text-data-wind';
  return 'text-fg-muted';
}

/* ──────────── ease-out-expo ──────────── */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/* ═══════════════════════════════════════════════════════════════════════
 *  COMPONENT
 *  ═══════════════════════════════════════════════════════════════════════ */

export default function WindCompass({
  direction,
  speed,
  gust,
  unit = 'kt',
  coastOrientation,
  size,
  showSpeed = true,
}: WindCompassProps) {
  const cfg = resolveSize(size);
  const center = cfg.viewBox / 2;
  const R = cfg.trackRadius;

  /* ── wind relation (if coast known) ── */
  const relation: WindRelation =
    coastOrientation !== undefined
      ? getWindRelationToCoast(direction, coastOrientation)
      : 'unknown';

  /* ── needle color ── */
  const needleColorClass = getWindStrengthColor(speed ?? 0, relation);

  /* ── animated rotation ── */
  const targetRotation = ((direction + 180) % 360); // needle points WHERE wind goes
  const [displayRotation, setDisplayRotation] = useState(0);
  const prevRotation = useRef(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplayRotation(targetRotation);
      prevRotation.current = targetRotation;
      hasAnimated.current = true;
      return;
    }

    const duration = 400;
    const start = performance.now();
    const startAngle = prevRotation.current;

    // Shortest-path interpolation
    let delta = targetRotation - startAngle;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;

    hasAnimated.current = true;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current = startAngle + delta * easeOutExpo(progress);
      setDisplayRotation(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        prevRotation.current = targetRotation;
      }
    };

    requestAnimationFrame(tick);
  }, [targetRotation]);

  /* ── needle SVG geometry (barometer pin) ── */
  // All proportions relative to track radius R
  const anchorR = R * 0.06;
  const bodyW = R * 0.14;
  const bodyH = R * 0.68;
  const tipBase = R * 0.28;
  const tipH = R * 0.24;
  const gap = R * 0.08;

  // Needle points UP by default, rotated via transform
  const needlePath = `
    M ${center - bodyW / 2},${center + bodyH / 2 - gap}
    L ${center - bodyW / 2},${center - bodyH / 2 + tipH - gap}
    L ${center - tipBase / 2},${center - bodyH / 2 + tipH - gap}
    L ${center},${center - bodyH / 2 - gap}
    L ${center + tipBase / 2},${center - bodyH / 2 + tipH - gap}
    L ${center + bodyW / 2},${center - bodyH / 2 + tipH - gap}
    L ${center + bodyW / 2},${center + bodyH / 2 - gap}
    Z
  `;

  // Anchor circle at pivot
  const anchorPath = `
    M ${center + anchorR},${center}
    A ${anchorR},${anchorR} 0 1,1 ${center - anchorR},${center}
    A ${anchorR},${anchorR} 0 1,1 ${center + anchorR},${center}
  `;

  /* ── gust arc (outer ring segment) ── */
  const hasGustArc = gust !== undefined && speed !== undefined && gust > speed;
  const gustSpread = hasGustArc ? (gust - speed) * 3 : 0;
  const gustStart = direction;
  const gustEnd = direction + gustSpread;

  /* ── accessibility ── */
  const cardinal = getCardinalLabel(direction);
  const ariaParts = [`Wind from ${cardinal}`];
  if (speed !== undefined) {
    if (speed === 0) {
      ariaParts.push('no wind');
    } else {
      ariaParts.push(`${speed} ${unit}`);
      if (gust !== undefined && gust > speed) ariaParts.push(`gusting ${gust}`);
    }
  } else {
    ariaParts.push('direction unknown');
  }
  if (relation !== 'unknown') ariaParts.push(relation);
  const ariaLabel = ariaParts.join(', ');

  /* ── centre content ── */
  const showCentre = showSpeed && speed !== undefined;
  const centreText = speed === 0 ? '—' : speed?.toFixed(0) ?? '';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="inline-flex flex-col items-center"
    >
      {/* ── SVG canvas ── */}
      <div
        className="relative"
        style={{ width: cfg.px, height: cfg.px }}
      >
        <svg
          viewBox={`0 0 ${cfg.viewBox} ${cfg.viewBox}`}
          className="w-full h-full"
          aria-hidden="true"
        >
          {/* Track circle */}
          <circle
            cx={center}
            cy={center}
            r={R}
            fill="none"
            stroke="rgb(255 255 255 / 0.08)"
            strokeWidth={cfg.strokeTrack}
          />

          {/* Cardinal labels — STATIC, never rotate */}
          <text
            x={center} y={center - R + cfg.strokeTrack * 3}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`fill-current ${cfg.fontCardinal} text-fg-subtle font-semibold`}
            aria-hidden="true"
          >
            N
          </text>
          <text
            x={center} y={center + R - cfg.strokeTrack * 3}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`fill-current ${cfg.fontCardinal} text-fg-subtle`}
            aria-hidden="true"
          >
            S
          </text>
          <text
            x={center + R - cfg.strokeTick * 3} y={center + cfg.strokeTick}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`fill-current ${cfg.fontCardinal} text-fg-subtle`}
            aria-hidden="true"
          >
            E
          </text>
          <text
            x={center - R + cfg.strokeTick * 3} y={center + cfg.strokeTick}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`fill-current ${cfg.fontCardinal} text-fg-subtle`}
            aria-hidden="true"
          >
            W
          </text>

          {/* Intermediate ticks (lg only) */}
          {cfg.preset === 'lg' &&
            [45, 135, 225, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const inner = R * 0.88;
              const outer = R * 0.98;
              return (
                <line
                  key={angle}
                  x1={center + inner * Math.cos(rad)}
                  y1={center + inner * Math.sin(rad)}
                  x2={center + outer * Math.cos(rad)}
                  y2={center + outer * Math.sin(rad)}
                  stroke="rgb(255 255 255 / 0.06)"
                  strokeWidth={cfg.strokeTick}
                />
              );
            })}

          {/* Gust arc (outer ring) */}
          {hasGustArc && (
            <path
              d={describeArc(center, center, R + 4, gustStart, gustEnd)}
              fill="none"
              stroke="rgb(251 191 36 / 0.4)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}

          {/* Needle group — rotates, everything inside stays upright relative to needle */}
          {speed !== 0 && (
            <g
              transform={`rotate(${displayRotation} ${center} ${center})`}
              style={{ transition: 'none' }}
            >
              {/* Needle body */}
              <path
                d={needlePath}
                className={`fill-current ${needleColorClass}`}
                opacity={speed === undefined ? 0.5 : 1}
              />
              {/* Anchor circle */}
              <path
                d={anchorPath}
                className="fill-current text-fg"
              />
            </g>
          )}
        </svg>

        {/* ── Centre speed overlay (HTML for easy Tailwind styling) ── */}
        {showCentre && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="flex items-baseline gap-0.5">
              <span
                className={`font-mono tabular-nums font-semibold ${cfg.fontSpeed} text-fg`}
              >
                {centreText}
              </span>
              {speed !== 0 && gust !== undefined && gust > (speed ?? 0) * 1.3 && (
                <span
                  className={`font-mono tabular-nums ${cfg.fontGust} text-data-wind`}
                >
                  ↑{gust.toFixed(0)}
                </span>
              )}
            </div>
            {speed !== 0 && (
              <span className={`font-sans ${cfg.fontUnit} text-fg-subtle`}>
                {unit}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────── SVG arc helper ──────────── */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TEST NOTES — verify visually
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1.  Labels N/S/E/W stay STATIC:
 *      • Change direction prop → needle rotates, labels never move.
 *      • Bug fixed: previously the entire SVG rotated.
 *
 *  2.  Needle points correct direction:
 *      • direction=0 (wind from North) → needle points DOWN (towards South).
 *      • direction=90 (wind from East) → needle points LEFT (towards West).
 *      • direction=180 (wind from South) → needle points UP (towards North).
 *
 *  3.  Speed thresholds:
 *      • speed=5  → text-fg-muted (weak)
 *      • speed=15 → text-data-wind (useful)
 *      • speed=25 → text-data-wind or text-windDir-offshore (if coastOrientation)
 *      • speed=35 → text-windDir-onshore (strong / dangerous)
 *
 *  4.  coastOrientation tint:
 *      • coastOrientation=270, direction=270 → offshore (green needle)
 *      • coastOrientation=270, direction=90  → onshore (red needle)
 *      • coastOrientation=270, direction=0   → cross (data-wind amber)
 *
 *  5.  Gust arc:
 *      • gust=35, speed=25 → 30° arc outside track, amber/40% opacity.
 *      • gust=30, speed=25 → 15° arc.
 *      • No gust prop → no arc.
 *
 *  6.  Speed=0 vs undefined:
 *      • speed=0 → centre shows "—", no needle.
 *      • speed undefined → no centre number, needle in text-fg-subtle.
 *
 *  7.  Animation:
 *      • F5 / first mount → needle spins from 0° to target (~400ms).
 *      • Change direction prop → smooth rotate (shortest path, 400ms ease-out-expo).
 *      • prefers-reduced-motion → instant snap.
 *
 *  8.  Size snapping:
 *      • size={48}  → sm (64px), typography adjusts.
 *      • size={100} → md (96px).
 *      • size={150} → lg (144px).
 *      • size="lg"  → lg directly.
 *
 *  9.  A11y:
 *      • Screen reader: "Wind from N, 18 kt, gusting 25, offshore" etc.
 *      • role="img" on wrapper.
 *      • Cardinal labels have aria-hidden (already in aria-label).
 */
