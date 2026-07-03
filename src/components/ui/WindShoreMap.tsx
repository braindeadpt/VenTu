'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  getCardinalLabel,
  getWindRelationLabel,
  getWindRelationToCoast,
  type WindRelation,
} from '@/lib/wind';

/* ═══════════════════════════════════════════════════════════════════════
 *  WindShoreMap — Top-down land/sea schematic with wind vs coast.
 *
 *  Rotates the beach so the sea is always toward the top of the card;
 *  wind arrow shows where the wind COMES FROM (meteorological convention).
 *  Relation badge uses offshore / onshore / cross-shore tokens.
 *  ═══════════════════════════════════════════════════════════════════════ */

interface WindShoreMapProps {
  windDirection: number;
  /** Wind speed in m/s */
  windSpeed: number;
  /** Coast normal pointing toward the sea (degrees). */
  coastOrientation: number;
  locale: 'pt' | 'en';
  title: string;
  seaLabel: string;
  landLabel: string;
  windFromLabel: string;
  coastFacingLabel: string;
  relationHint: string;
  className?: string;
}

const VB_W = 240;
const VB_H = 176;
const CX = 120;
const CY = 88;

function polarFromCenter(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function relationStroke(relation: WindRelation): string {
  if (relation === 'offshore') return 'rgb(var(--windDir-offshore))';
  if (relation === 'onshore') return 'rgb(var(--windDir-onshore))';
  return 'rgb(var(--windDir-cross))';
}

function windStrokeWidth(speedKt: number): number {
  if (speedKt < 8) return 2.25;
  if (speedKt < 18) return 3;
  if (speedKt < 28) return 3.75;
  return 4.5;
}

export default function WindShoreMap({
  windDirection,
  windSpeed,
  coastOrientation,
  locale,
  title,
  seaLabel,
  landLabel,
  windFromLabel,
  coastFacingLabel,
  relationHint,
  className,
}: WindShoreMapProps) {
  const isPt = locale === 'pt';
  const windKt = Math.round(windSpeed * 1.94384);
  const windCardinal = getCardinalLabel(windDirection);
  const coastCardinal = getCardinalLabel(coastOrientation);
  const relation = getWindRelationToCoast(windDirection, coastOrientation);
  const relationMeta = getWindRelationLabel(relation, locale);

  const [fadeIn, setFadeIn] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setFadeIn(1);
      return;
    }
    const duration = 450;
    const start = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setFadeIn(progress);
      if (progress < 1) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [windDirection, coastOrientation]);

  const windFrom = polarFromCenter(CX, CY, 78, windDirection);
  const windTo = polarFromCenter(CX, CY, 28, windDirection);
  const strokeW = windStrokeWidth(windKt);
  const windColor = relationStroke(relation);

  const ariaLabel = [
    isPt ? 'Vento na costa' : 'Wind at the coast',
    `${windFromLabel} ${windCardinal}`,
    `${windKt} kt`,
    relationMeta.label,
    `${coastFacingLabel} ${coastCardinal}`,
  ].join(', ');

  return (
    <article
      className={cn(
        'rounded-card border border-divider bg-surface-1/[0.03] overflow-hidden',
        className,
      )}
      aria-label={ariaLabel}
    >
      <header className="px-3 pt-3 pb-2 border-b border-divider">
        <h4 className="text-h3 text-fg">{title}</h4>
        <p className="text-meta-sm text-fg-muted mt-0.5 font-mono tabular-nums">
          {windKt} kt · {windFromLabel} {windCardinal} ({Math.round(windDirection)}°)
        </p>
        <p className="text-meta-sm text-fg-subtle mt-0.5">
          {coastFacingLabel} {coastCardinal}
        </p>
      </header>

      <div className="relative px-2 pt-2 pb-1">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full h-auto max-h-[min(52vw,13rem)] md:max-h-56"
          role="img"
          aria-hidden="true"
        >
          {/* Fixed geographic north — does not rotate with the beach */}
          <g className="text-fg-subtle">
            <circle
              cx={VB_W - 22}
              cy={22}
              r={14}
              fill="rgb(var(--bg-elevated))"
              stroke="rgb(var(--divider))"
              strokeWidth={1}
            />
            <text
              x={VB_W - 22}
              y={22}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-current text-[10px] font-semibold"
            >
              N
            </text>
            <line
              x1={VB_W - 22}
              y1={30}
              x2={VB_W - 22}
              y2={36}
              stroke="rgb(var(--fg-subtle))"
              strokeWidth={1.25}
              strokeLinecap="round"
            />
          </g>

          {/* Beach scene — rotated so this spot&apos;s sea faces upward */}
          <g transform={`rotate(${coastOrientation} ${CX} ${CY})`} opacity={0.35 + fadeIn * 0.65}>
            {/* Sea */}
            <rect
              x={0}
              y={0}
              width={VB_W}
              height={CY - 14}
              fill="rgb(var(--data-waves) / 0.09)"
            />
            {[28, 52, 76].map((y) => (
              <path
                key={y}
                d={`M 8 ${y} Q 60 ${y - 3} 120 ${y} T 232 ${y}`}
                fill="none"
                stroke="rgb(var(--data-waves) / 0.18)"
                strokeWidth={1}
              />
            ))}

            {/* Land */}
            <rect
              x={0}
              y={CY + 14}
              width={VB_W}
              height={VB_H - CY - 14}
              fill="rgb(var(--surface-2) / 0.14)"
            />

            {/* Beach strip */}
            <rect
              x={0}
              y={CY - 10}
              width={VB_W}
              height={20}
              fill="rgb(var(--surface-1) / 0.35)"
            />

            {/* Coastline */}
            <path
              d={`M 12 ${CY} Q 68 ${CY - 5} ${CX} ${CY} T 228 ${CY + 2}`}
              fill="none"
              stroke="rgb(var(--divider-strong))"
              strokeWidth={2}
              strokeLinecap="round"
            />

            {/* Spot on the beach */}
            <circle
              cx={CX}
              cy={CY + 2}
              r={5}
              fill="rgb(var(--bg-elevated))"
              stroke="rgb(var(--divider-strong))"
              strokeWidth={1.5}
            />
            <circle cx={CX} cy={CY + 2} r={2} fill="rgb(var(--fg-muted))" />

            {/* Labels */}
            <text
              x={CX}
              y={34}
              textAnchor="middle"
              fill="rgb(var(--data-waves))"
              fontSize={11}
              fontWeight={600}
              letterSpacing="0.06em"
            >
              {seaLabel}
            </text>
            <text
              x={CX}
              y={VB_H - 18}
              textAnchor="middle"
              fill="rgb(var(--fg-muted))"
              fontSize={11}
              fontWeight={600}
              letterSpacing="0.06em"
            >
              {landLabel}
            </text>

            {/* Wind arrow — from edge toward beach (meteo: FROM direction) */}
            <line
              x1={windFrom.x}
              y1={windFrom.y}
              x2={windTo.x}
              y2={windTo.y}
              stroke={windColor}
              strokeWidth={strokeW}
              strokeLinecap="round"
              opacity={0.92}
            />
            <polygon
              points={arrowHeadPoints(windTo.x, windTo.y, windDirection, 11)}
              fill={windColor}
            />
          </g>
        </svg>
      </div>

      <footer className="px-3 pb-3 pt-1 space-y-1.5">
        <span
          className={cn(
            'inline-flex items-center rounded-pill border px-2.5 py-1 text-meta-sm font-semibold',
            relationMeta.className,
          )}
        >
          {relationMeta.label}
        </span>
        <p className="text-meta-sm text-fg-muted leading-snug">{relationHint}</p>
      </footer>
    </article>
  );
}

function arrowHeadPoints(
  x: number,
  y: number,
  fromDeg: number,
  size: number,
): string {
  const tip = polarFromCenter(x, y, size, fromDeg + 180);
  const baseAngle = ((fromDeg + 180 - 90) * Math.PI) / 180;
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
