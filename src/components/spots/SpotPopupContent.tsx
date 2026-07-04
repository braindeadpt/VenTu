'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { Waves, Wind, Droplets, Eye, ArrowUpRight } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getScoreTokens } from '@/lib/sportScore';
import { getDifficultyLabel } from '@/lib/mapDifficulty';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import type { ConfidenceDetail, ConfidenceTier } from '@/lib/forecastConfidence';
import { getSpotImageAlt } from '@/lib/spotImage';

export interface SpotPopupContentProps {
  spot: Spot;
  locale: string;
  detailHref: string;
  allScores: Record<SportType, SportScore>;
  swellHeight: string;
  swellPeriod: string;
  windKnots: string;
  windDirection: string;
  windRelation?: string;
  windRelationClass?: string;
  waterTemp: string;
  wavePowerKw: string;
  imageUrl?: string;
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
}

export function SpotPopupContent({
  spot,
  locale,
  detailHref,
  allScores,
  swellHeight,
  swellPeriod,
  windKnots,
  windDirection,
  windRelation,
  windRelationClass,
  waterTemp,
  wavePowerKw,
  imageUrl,
  confidence,
  confidenceDetail,
}: SpotPopupContentProps) {
  const isPt = locale === 'pt';
  const name = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;

  const topSport = (Object.entries(allScores) as [SportType, SportScore][])
    .filter(([, s]) => s.score > 0)
    .sort(([, a], [, b]) => b.score - a.score)[0];
  const topScore = topSport?.[1]?.score ?? 0;
  const topSportLabel = topScore > 0 && topSport
    ? SPORT_LABELS[topSport[0]]?.[isPt ? 'pt' : 'en']
    : null;
  const tokens = topScore > 0 ? getScoreTokens(topScore) : null;

  return (
    <div className="min-w-[240px] max-w-[280px]">
      {/* Image with score overlay */}
      <div className="relative">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={getSpotImageAlt(spot, isPt ? 'pt' : 'en')}
            className="w-full h-24 object-cover rounded-t-lg ring-1 ring-divider"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-16 rounded-t-lg bg-surface-1/[0.04]" />
        )}
        {tokens && topScore > 0 && (
          <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-0.5">
            <span
              className={[
                'inline-flex items-center justify-center min-w-[36px] h-[22px] rounded-pill text-xs font-mono font-semibold tabular-nums border px-2',
                tokens.bg,
                tokens.text,
                tokens.border,
              ].join(' ')}
              aria-label={topSportLabel ? `${topSportLabel}: ${topScore}` : `Score: ${topScore}`}
            >
              {topScore}
            </span>
            {topSportLabel && (
              <span className="text-[10px] text-fg-muted font-sans">{topSportLabel}</span>
            )}
          </div>
        )}
      </div>

      {/* Spot name + region */}
      <div className="px-2.5 pt-2 pb-1.5 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-fg truncate">{name}</span>
          {confidence && (
            <span className="inline-block w-2 h-2 rounded-full"
              style={{
                backgroundColor: (
                  confidence as string === 'high' ? 'rgb(var(--score-good))'
                  : confidence as string === 'medium' ? 'rgb(var(--score-fair))'
                  : 'rgb(var(--score-poor))'
                ),
              }}
              aria-label={confidence}
            />
          )}
        </div>
        <p className="text-[11px] text-fg-muted">
          {region} · {getDifficultyLabel(spot.difficulty, isPt)}
        </p>
      </div>

      {/* 3 metrics in mono */}
      <div className="px-2.5 pb-2 flex items-center gap-2 text-[11px] font-mono tabular-nums">
        <span className="inline-flex items-center gap-1 text-fg">
          <Waves className="w-3 h-3 text-data-waves" aria-hidden />
          {swellHeight}m · {swellPeriod}s
        </span>
        <span aria-hidden className="text-fg-subtle/40">|</span>
        <span className="inline-flex items-center gap-1 text-fg flex-wrap">
          <Wind className="w-3 h-3 text-data-wind shrink-0" aria-hidden />
          <span className="font-mono tabular-nums">{windKnots}kt {windDirection}</span>
          {windRelation ? (
            <span
              className={`font-sans text-[10px] font-medium px-1.5 py-0.5 rounded-pill border ${windRelationClass ?? ''}`}
            >
              {windRelation}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="text-fg-subtle/40">|</span>
        <span className="inline-flex items-center gap-1 text-fg">
          <Droplets className="w-3 h-3 text-data-water" aria-hidden />
          {waterTemp}°
        </span>
      </div>

      {/* CTA button */}
      <div className="px-2.5 pb-2.5">
        <a
          href={detailHref}
          className="ventu-popup-detail w-full text-center py-2 rounded-input text-xs font-semibold border-0 cursor-pointer inline-flex items-center justify-center gap-1.5 no-underline"
          style={{
            backgroundColor: tokens ? `rgb(var(--score-${tokens.tier}) / 0.15)` : 'rgb(var(--surface-1) / 0.08)',
            color: tokens ? `rgb(var(--score-${tokens.tier}))` : 'rgb(var(--fg))',
          }}
          data-spot-id={spot.id}
        >
          {isPt ? 'Ver spot' : 'View spot'}
          <ArrowUpRight className="w-3 h-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}

export function renderSpotPopup(options: SpotPopupContentProps): string {
  return renderToStaticMarkup(<SpotPopupContent {...options} />);
}
