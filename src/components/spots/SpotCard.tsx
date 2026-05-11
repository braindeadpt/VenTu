'use client';

import Link from 'next/link';
import { Waves, Wind, Thermometer, Clock } from 'lucide-react';

import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getCardinalLabel } from '@/lib/wind';

import ScoreGauge from '@/components/ui/ScoreGauge';
import WaveShape from '@/components/ui/WaveShape';
import FavoriteButton from '@/components/FavoriteButton';

/* ═══════════════════════════════════════════════════════════════════════
 *  SpotCard — Grid card with signature components (ScoreGauge + WaveShape).
 *
 *  Shows wave conditions, wind, water temp, and sport score at a glance.
 *  Used in SpotGrid and homepage spot lists.
 *
 *  @example
 *  // With full conditions and sport score
 *  <SpotCard
 *    spot={spot}
 *    locale="pt"
 *    conditions={conditions[spot.id]}
 *    sportScore={sportScores[spot.id]?.surf}
 *    selectedSport="surf"
 *  />
 *
 *  @example
 *  // Minimal — no conditions yet loaded
 *  <SpotCard spot={spot} locale="en" />
 *  ═══════════════════════════════════════════════════════════════════════ */

interface ConditionsData {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
}

interface SportScoreData {
  score: number;
  rating: string;
  ratingEn: string;
  factors: string[];
  primaryFactor: string;
}

interface SpotCardProps {
  spot: Spot;
  locale: string;
  conditions?: ConditionsData;
  sportScore?: SportScoreData;
  selectedSport?: SportType | null;
}

/* ──────────── stat helpers ──────────── */
function formatValue(value: number | undefined, unit: string, fallback = '—'): string {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return `${value.toFixed(value < 10 ? 1 : 0)}${unit}`;
}

function formatInt(value: number | undefined, unit: string, fallback = '—'): string {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return `${Math.round(value)}${unit}`;
}

export default function SpotCard({
  spot,
  locale,
  conditions,
  sportScore,
  selectedSport,
}: SpotCardProps) {
  const isPt = locale === 'pt';

  /* ── sport label for gauge ── */
  const sportLabel = selectedSport
    ? SPORT_LABELS[selectedSport][isPt ? 'pt' : 'en']
    : undefined;

  /* ── score (0–100, or undefined) ── */
  const score = sportScore?.score;

  /* ── link href ── */
  const href = selectedSport
    ? `/${locale}/spots/${spot.slug}/?sport=${selectedSport}`
    : `/${locale}/spots/${spot.slug}/`;

  /* ── stat labels ── */
  const waveLabel = isPt ? 'ondas' : 'waves';
  const periodLabel = isPt ? 'período' : 'period';
  const windLabel = isPt ? 'vento' : 'wind';
  const waterLabel = isPt ? 'água' : 'water';

  /* ── has any conditions ── */
  const hasConditions = conditions !== undefined;

  return (
    <Link href={href} className="block group">
      <article
        className="
          card-1 rounded-card-lg overflow-hidden
          transition-all duration-base ease-out-expo
          hover:card-2 hover:shadow-card-hover hover:-translate-y-0.5
          focus-visible:outline-2 focus-visible:outline-offset-2
          flex flex-col
        "
        tabIndex={-1} /* Link wrapper handles focus; inner interactive elements keep their own */
      >
        {/* ═══════ HEADER ═══════ */}
        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-h3 text-fg truncate">
              {spot.name}
            </h3>
            <p className="text-meta text-fg-muted mt-0.5">
              {spot.region}
            </p>
          </div>
          <FavoriteButton spotId={spot.id} spotName={spot.name} />
        </div>

        {/* ═══════ MAIN ROW ═══════ */}
        <div className="grid grid-cols-[auto_1fr] gap-4 items-center px-5 py-4">
          {/* ScoreGauge */}
          <div className="flex flex-col items-center gap-1">
            {score !== undefined ? (
              <ScoreGauge
                score={score}
                label={sportLabel}
                size="md"
              />
            ) : (
              <ScoreGauge score={0} label={sportLabel ?? (isPt ? 'Spot' : 'Spot')} size="md" />
            )}
          </div>

          {/* WaveShape */}
          <div className="min-w-0">
            {hasConditions ? (
              <WaveShape
                height={conditions.waveHeight}
                period={conditions.wavePeriod}
                size="md"
                showLabel={false}
              />
            ) : (
              <div className="w-full h-24 bg-surface-1 rounded-card flex items-center justify-center">
                <span className="text-meta text-fg-subtle">
                  {isPt ? 'Sem dados' : 'No data'}
                </span>
              </div>
            )}
            {/* Wave direction note — visible when no direction data */}
            <p className="text-meta-sm text-fg-subtle mt-1.5 text-center">
              {isPt ? 'Altura ' : 'Height '}
              {hasConditions ? formatValue(conditions.waveHeight, 'm') : '—'}
              {hasConditions ? ` · ${formatInt(conditions.wavePeriod, 's')}` : ''}
            </p>
          </div>
        </div>

        {/* ═══════ STATS ROW ═══════ */}
        <div className="grid grid-cols-4 gap-3 border-t border-divider px-5 pt-4 pb-5">
          {/* Wave height */}
          <div className="flex flex-col gap-0.5 items-center">
            <Waves className="w-3.5 h-3.5 text-data-waves mb-0.5" aria-hidden="true" />
            <span className="text-num font-mono text-fg tabular-nums">
              {hasConditions ? formatValue(conditions.waveHeight, '') : '—'}
            </span>
            <span className="text-meta-sm text-fg-subtle">{waveLabel}</span>
          </div>

          {/* Wave period */}
          <div className="flex flex-col gap-0.5 items-center">
            <Clock className="w-3.5 h-3.5 text-data-period mb-0.5" aria-hidden="true" />
            <span className="text-num font-mono text-fg tabular-nums">
              {hasConditions ? formatInt(conditions.wavePeriod, '') : '—'}
            </span>
            <span className="text-meta-sm text-fg-subtle">{periodLabel}</span>
          </div>

          {/* Wind speed + direction */}
          <div className="flex flex-col gap-0.5 items-center">
            <Wind className="w-3.5 h-3.5 text-data-wind mb-0.5" aria-hidden="true" />
            <span className="text-num font-mono text-fg tabular-nums">
              {hasConditions
                ? `${Math.round(conditions.windSpeed * 1.94384)}kt`
                : '—'}
            </span>
            <span className="text-meta-sm text-fg-subtle">
              {hasConditions
                ? `${getCardinalLabel(conditions.windDirection)}`
                : windLabel}
            </span>
          </div>

          {/* Water temp */}
          <div className="flex flex-col gap-0.5 items-center">
            <Thermometer className="w-3.5 h-3.5 text-data-water mb-0.5" aria-hidden="true" />
            <span className="text-num font-mono text-fg tabular-nums">
              {hasConditions ? formatInt(conditions.waterTemp, '') : '—'}
            </span>
            <span className="text-meta-sm text-fg-subtle">{waterLabel}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TEST NOTES
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1.  Visual rhythm in grid:
 *      • 81 cards in 3-col grid should feel uniform (consistent min-height).
 *      • card-1 + rounded-card-lg gives coherent card surfaces.
 *
 *  2.  Hover:
 *      • card-2 bg lift, shadow-card-hover, -translate-y-0.5.
 *      • transition duration-base ease-out-expo.
 *      • Reduced motion: translate disabled globally via globals.css.
 *
 *  3.  Incomplete data:
 *      • Spot without conditions → "—" in all stats, "Sem dados" in wave area.
 *      • ScoreGauge score=0 shown as closed tier (rose).
 *
 *  4.  Score zero:
 *      • sportScore.score === 0 → ScoreGauge renders 0, closed color.
 *
 *  5.  Mobile (320px):
 *      • Grid collapses to 1 col via parent (SpotGrid), card adapts.
 *      • Stats row: 4 cols stay readable (text-num-sm scales).
 *
 *  6.  Tab order:
 *      • Link wrapper focus-visible ring (sky-blue from globals.css).
 *      • FavoriteButton inside is interactive; tabIndex=-1 on article
 *        prevents double-focus but keeps button accessible.
 *
 *  7.  i18n:
 *      • Uses SPORT_LABELS from sportRatings.ts (already has pt/en).
 *      • Stat labels switch between pt/en.
 *
 *  8.  Features omitted (data not available):
 *      • driveTime — Spot type has no distance/travel field.
 *      • bestWindow — no function exists to calculate optimal window.
 *      • swellDirection — Conditions type lacks wave_direction field.
 *      • WindCompass in stats — too large for 4-col grid; cardinal label used instead.
 */
