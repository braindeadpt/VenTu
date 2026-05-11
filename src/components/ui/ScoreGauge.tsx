'use client';

import { useEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
 *  ScoreGauge — SVG circular gauge with animated count-up.
 *
 *  Visual identity element. 270° arc gauge with score-colored arc,
 *  glow shadow, and tabular-nums count-up animation on first mount.
 *
 *  @example
 *  // Default size (md), with sport label
 *  <ScoreGauge score={87} label="Surf" />
 *
 *  @example
 *  // Small size, no label — fits dense table cells
 *  <ScoreGauge score={42} size="sm" />
 *
 *  @example
 *  // Large hero gauge with label + sublabel
 *  <ScoreGauge score={91} label="Kite" sublabel="/100" size="lg" />
 *
 *  ═══════════════════════════════════════════════════════════════════════ */

type ScoreVariant = 'epic' | 'good' | 'fair' | 'poor' | 'closed';

type SizeKey = 'sm' | 'md' | 'lg';

interface ScoreGaugeProps {
  /** Score 0–100. Values outside this range are clamped. */
  score: number;
  /** Label shown below the number (e.g. sport name). */
  label?: string;
  /** Gauge size. Default: 'md'. */
  size?: SizeKey;
  /** Sublabel shown next to label, smaller (e.g. "/100"). */
  sublabel?: string;
}

/* ──────────── score → variant mapping ──────────── */
function getScoreVariant(score: number): ScoreVariant {
  if (score >= 80) return 'epic';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  if (score >= 20) return 'poor';
  return 'closed';
}

/* ──────────── size configuration ──────────── */
interface SizeConfig {
  wrapper: string;   // Tailwind w-*/h-*
  radius: number;    // SVG circle radius (viewBox units)
  stroke: number;    // stroke-width
  number: string;    // Tailwind text-* class
}

const SIZE_CONFIG: Record<SizeKey, SizeConfig> = {
  sm: { wrapper: 'w-16 h-16',  radius: 32, stroke: 6,  number: 'text-num-lg' },     // 64×64
  md: { wrapper: 'w-24 h-24',  radius: 38, stroke: 8,  number: 'text-num-xl' },    // 96×96
  lg: { wrapper: 'w-36 h-36',  radius: 42, stroke: 10, number: 'text-display-lg' }, // 144×144
};

/* ──────────── Tailwind glow classes (literal for purge safety) ──────────── */
const GLOW_CLASS: Record<ScoreVariant, string> = {
  epic:   'shadow-glow-epic',
  good:   'shadow-glow-good',
  fair:   'shadow-glow-fair',
  poor:   'shadow-glow-poor',
  closed: 'shadow-glow-closed',
};

/* ──────────── ease-out-expo: 1 - 2^(-10x) ──────────── */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export default function ScoreGauge({
  score,
  label,
  size = 'md',
  sublabel,
}: ScoreGaugeProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const variant = getScoreVariant(clamped);
  const cfg = SIZE_CONFIG[size];

  const [animatedScore, setAnimatedScore] = useState(0);
  const hasAnimated = useRef(false);

  /* ───── animation on first mount only ───── */
  useEffect(() => {
    // After first animation, sync directly on score changes (no re-animation)
    if (hasAnimated.current) {
      setAnimatedScore(clamped);
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setAnimatedScore(clamped);
      hasAnimated.current = true;
      return;
    }

    const duration = 700;
    const start = performance.now();
    hasAnimated.current = true;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimatedScore(clamped * easeOutExpo(progress));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [clamped]);

  /* ───── SVG geometry ───── */
  const circumference = 2 * Math.PI * cfg.radius;
  const arcLength = (270 / 360) * circumference;
  const strokeDashoffset = circumference - arcLength * (animatedScore / 100);

  /* ───── color via CSS custom property ───── */
  const scoreColor = `rgb(var(--score-${variant}) / 1)`;

  /* ───── accessibility label ───── */
  const ariaLabel = label
    ? `${label} score: ${clamped} out of 100`
    : `Score: ${clamped} out of 100`;

  return (
    <div
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className="inline-flex flex-col items-center"
    >
      {/* ── gauge wrapper ── */}
      <div
        className={[
          'relative rounded-full p-1',
          cfg.wrapper,
          GLOW_CLASS[variant],
        ].join(' ')}
      >
        <svg
          viewBox="0 0 100 85"
          className="w-full h-full"
          aria-hidden="true"
        >
          {/* Track — full 270° arc, low opacity */}
          <circle
            cx="50"
            cy="40"
            r={cfg.radius}
            fill="none"
            stroke="rgb(255 255 255 / 0.08)"
            strokeWidth={cfg.stroke}
            strokeLinecap="round"
            transform="rotate(225 50 40)"
            strokeDasharray={`${arcLength} ${circumference}`}
          />

          {/* Progress — fills proportional to animated score */}
          <circle
            cx="50"
            cy="40"
            r={cfg.radius}
            fill="none"
            stroke={scoreColor}
            strokeWidth={cfg.stroke}
            strokeLinecap="round"
            transform="rotate(225 50 40)"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>

        {/* Centered number (HTML overlay for easy Tailwind styling) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={[
              'font-mono font-semibold tabular-nums',
              cfg.number,
            ].join(' ')}
            style={{ color: scoreColor }}
            aria-hidden="true"
          >
            {Math.round(animatedScore)}
          </span>
        </div>
      </div>

      {/* ── label row ── */}
      {label && (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-meta text-fg-muted font-sans">
            {label}
          </span>
          {sublabel && (
            <span className="text-meta-sm text-fg-subtle font-sans">
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TEST NOTES — verify visually
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1.  Breakpoint colours (exact edges):
 *      • score=79 → good (sky-400).  score=80 → epic (emerald-400).
 *      • score=59 → fair (amber-400). score=60 → good (sky-400).
 *      • score=39 → poor (orange-500). score=40 → fair (amber-400).
 *      • score=19 → closed (rose-500). score=20 → poor (orange-500).
 *
 *  2.  Animation fires ONLY on first mount:
 *      • Mount → arc draws + number counts up (~700 ms).
 *      • Change parent state to new score → number snaps directly,
 *        no second animation.
 *
 *  3.  prefers-reduced-motion:
 *      • Enable in OS → gauge shows final score immediately,
 *        zero animation.
 *
 *  4.  Accessibility:
 *      • Screen reader announces "Surf score: 87 out of 100".
 *      • Visible number has aria-hidden (no double read).
 *      • role="meter" exposes value to AT.
 *
 *  5.  Glow:
 *      • Wrapper casts coloured shadow matching score tier.
 *      • Shadow visible on dark bg-bg-base (no clipping).
 */
