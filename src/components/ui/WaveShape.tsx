'use client';

import { useEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
 *  WaveShape — SVG wave cross-section visualization.
 *
 *  Signature visual component. Renders a stylised sine wave that
 *  communicates wave height and period at a glance. The curve amplitude
 *  maps to height (m), and the number of visible crests maps to period
 *  (s). More intuitive than reading "2.1m @ 8s" alone.
 *
 *  @example
 *  // Default size with direction label
 *  <WaveShape height={2.1} period={8} direction="NW" />
 *
 *  @example
 *  // Small size, flat conditions
 *  <WaveShape height={0.6} period={5} size="sm" />
 *
 *  @example
 *  // Large hero size, no overlay — for dense layouts
 *  <WaveShape height={3.8} period={14} size="lg" showLabel={false} />
 *
 *  @example
 *  // Minimal — no label, small
 *  <WaveShape height={1.2} period={7} size="sm" showLabel={false} />
 *
 *  ═══════════════════════════════════════════════════════════════════════ */

type SizeKey = 'sm' | 'md' | 'lg';

interface WaveShapeProps {
  /** Wave height in meters (ex: 2.1). */
  height: number;
  /** Wave period in seconds (ex: 8). */
  period: number;
  /** Swell direction abbreviation (ex: "NW"). Optional. */
  direction?: string;
  /** Canvas size. Default: 'md'. */
  size?: SizeKey;
  /** Show "{height}m @ {period}s" overlay. Default: true. */
  showLabel?: boolean;
}

/* ──────────── size configuration ──────────── */
interface SizeConfig {
  width: number;   // SVG viewBox width
  height: number;  // SVG viewBox height
  wrapper: string; // Tailwind w-*/h-*
  stroke: number;  // stroke-width
}

const SIZE_CONFIG: Record<SizeKey, SizeConfig> = {
  sm: { width: 160, height: 80,  wrapper: 'w-40 h-20',  stroke: 2 },  // 160×80
  md: { width: 240, height: 120, wrapper: 'w-60 h-[7.5rem]', stroke: 3 },  // 240×120
  lg: { width: 320, height: 160, wrapper: 'w-80 h-40',  stroke: 4 },  // 320×160
};

/* ──────────── ease-out-expo ──────────── */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/* ──────────── generate smooth wave path ────────────
 *  Builds an SVG path string with a stylised sine wave.
 *  Uses quadratic Bézier curves for smooth crests and troughs.
 *  ─────────────────────────────────────────────────── */
function buildWavePath(
  viewW: number,
  viewH: number,
  waveHeight: number,
  wavePeriod: number,
): { path: string; totalLength: number } {
  // Amplitude: map 0.5m→6m to 10%→90% of half-viewport
  const amplitudeRatio = Math.max(0.1, Math.min(0.9, (waveHeight - 0.5) / 5.5));
  const amplitude = (viewH * 0.4) * amplitudeRatio;

  // Number of visible wave cycles: short period = many crests
  const numWaves = Math.max(1.2, Math.min(4.5, 18 / wavePeriod));
  const frequency = (numWaves * 2 * Math.PI) / viewW;

  const centerY = viewH / 2;
  const steps = 100;

  // Generate points
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * viewW;
    // Invert Y so crests point UP in SVG coordinates
    const y = centerY - amplitude * Math.sin(frequency * x);
    points.push({ x, y });
  }

  // Build path with quadratic Bézier for smoothness
  // Use midpoint between consecutive points as control points
  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // Simple line-to with many points = visually smooth
    path += ` L ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }

  // Approximate path length by summing segment distances
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  return { path, totalLength };
}

/* ──────────── height → color / opacity / glow tier ──────────── */
function getHeightTier(height: number): {
  strokeColor: string;
  strokeOpacity: number;
  hasGlow: boolean;
} {
  if (height < 1) {
    return { strokeColor: 'rgb(var(--data-waves))', strokeOpacity: 0.6, hasGlow: false }; // flat
  }
  if (height <= 2.5) {
    return { strokeColor: 'rgb(var(--data-waves))', strokeOpacity: 1.0, hasGlow: false }; // rideable
  }
  return { strokeColor: 'rgb(var(--data-waves))', strokeOpacity: 1.0, hasGlow: true };     // epic
}

export default function WaveShape({
  height,
  period,
  direction,
  size = 'md',
  showLabel = true,
}: WaveShapeProps) {
  const cfg = SIZE_CONFIG[size];

  const [revealProgress, setRevealProgress] = useState(0);
  const [pathLength, setPathLength] = useState(0);
  const pathRef = useRef<SVGPathElement>(null);
  const hasAnimated = useRef(false);

  const { path, totalLength } = buildWavePath(cfg.width, cfg.height, height, period);
  const tier = getHeightTier(height);

  /* ───── measure actual path length on mount ───── */
  useEffect(() => {
    if (pathRef.current) {
      // Prefer native getTotalLength when available (more accurate)
      const nativeLength = pathRef.current.getTotalLength?.();
      setPathLength(nativeLength && nativeLength > 0 ? nativeLength : totalLength);
    } else {
      setPathLength(totalLength);
    }
  }, [totalLength]);

  /* ───── stroke reveal animation (first mount only) ───── */
  useEffect(() => {
    if (hasAnimated.current || pathLength === 0) {
      setRevealProgress(1);
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setRevealProgress(1);
      hasAnimated.current = true;
      return;
    }

    const duration = 900;
    const start = performance.now();
    hasAnimated.current = true;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setRevealProgress(easeOutExpo(progress));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [pathLength]);

  /* ───── accessibility ───── */
  const ariaLabel = direction
    ? `Wave: ${height} meters, ${period} second period, direction ${direction}`
    : `Wave: ${height} meters, ${period} second period`;

  const labelText = `${height.toFixed(1)}m @ ${period.toFixed(0)}s`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={['relative overflow-hidden rounded-card', cfg.wrapper].join(' ')}
    >
      {/* ── SVG canvas ── */}
      <svg
        viewBox={`0 0 ${cfg.width} ${cfg.height}`}
        className="w-full h-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Background gradient below horizon — depth */}
        <defs>
          <linearGradient id={`waveBg-${size}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--fg-rgb) / 0)" />
            <stop offset="100%" stopColor="rgb(var(--fg-rgb) / 0.04)" />
          </linearGradient>

          {/* Glow filter for epic waves */}
          {tier.hasGlow && (
            <filter id={`waveGlow-${size}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        {/* Background fill under the curve */}
        <path
          d={`${path} L ${cfg.width},${cfg.height} L 0,${cfg.height} Z`}
          fill={`url(#waveBg-${size})`}
          opacity={0.5}
        />

        {/* Horizon line — always visible */}
        <line
          x1="0"
          y1={cfg.height / 2}
          x2={cfg.width}
          y2={cfg.height / 2}
          stroke="rgb(var(--divider))"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Wave curve — animated reveal */}
        <path
          ref={pathRef}
          d={path}
          fill="none"
          stroke={tier.strokeColor}
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={tier.strokeOpacity}
          filter={tier.hasGlow ? `url(#waveGlow-${size})` : undefined}
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength * (1 - revealProgress)}
          style={{ transition: 'none' }}
        />
      </svg>

      {/* ── Label overlay ── */}
      {showLabel && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill
                       bg-bg-base/80 backdrop-blur-sm border border-divider"
          >
            <span className="font-mono text-num-sm text-fg tabular-nums">
              {labelText}
            </span>
            {direction && (
              <>
                <span className="text-fg-subtle">·</span>
                <span className="font-sans text-meta text-fg-muted">
                  {direction}
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TEST NOTES — verify visually
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1.  Height extremes:
 *      • height=0.3m → low amplitude, faint blue (opacity 0.6), "flat"
 *      • height=5m   → high amplitude, full blue + glow, "epic"
 *
 *  2.  Period extremes:
 *      • period=4s  → 3-4 visible crests (choppy wind swell)
 *      • period=16s → 1-2 long crests (clean ground swell)
 *
 *  3.  Color thresholds:
 *      • height=0.8m → opacity 0.6, no glow (below 1m)
 *      • height=1.0m → opacity 1.0, no glow (rideable)
 *      • height=2.5m → opacity 1.0, no glow (at threshold)
 *      • height=2.6m → opacity 1.0, glow ON (epic)
 *
 *  4.  Animation fires ONLY on first mount:
 *      • F5 → curve draws left→right (~900ms)
 *      • Navigate away/back → curve fully visible, no re-reveal
 *
 *  5.  prefers-reduced-motion:
 *      • Enable in OS → curve visible immediately, no draw animation
 *
 *  6.  Overlay legibility:
 *      • Label pill must be readable over both dark (trough) and
 *        semi-bright (crest + bg gradient) areas of the SVG.
 *      • Test with height=3m (large crests) and height=0.5m (flat).
 */
