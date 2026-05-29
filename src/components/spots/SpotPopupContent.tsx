'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { Clock, Droplets, Navigation, Waves, Wind, Zap } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getCompatibleSports, SPORT_LABELS } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getDifficultyLabel } from '@/lib/mapDifficulty';
import { getGoogleMapsDirectionsUrl, getSpotDetailHref } from '@/lib/mapSpotDetail';
import { getScoreRgb } from '@/lib/scoreThresholds';
import ConfidenceBadge from '@/components/ui/ConfidenceBadge';
import type { ConfidenceDetail, ConfidenceTier } from '@/lib/forecastConfidence';

export interface SpotPopupContentProps {
  spot: Spot;
  locale: string;
  allScores: Record<SportType, SportScore>;
  swellHeight: string;
  swellPeriod: string;
  windKnots: string;
  windDirection: string;
  waterTemp: string;
  wavePowerKw: string;
  imageUrl?: string;
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
}

export function SpotPopupContent({
  spot,
  locale,
  allScores,
  swellHeight,
  swellPeriod,
  windKnots,
  windDirection,
  waterTemp,
  wavePowerKw,
  imageUrl,
  confidence,
  confidenceDetail,
}: SpotPopupContentProps) {
  const isPt = locale === 'pt';
  const name = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
  const sports = [...getCompatibleSports(spot)].sort(
    (a, b) => (allScores[b]?.score ?? 0) - (allScores[a]?.score ?? 0),
  );
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);
  const detailHref = getSpotDetailHref(locale, spot.slug);

  return (
    <div className="space-y-3 min-w-[240px] max-w-[280px]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="w-full h-24 object-cover rounded-lg -mt-1"
          loading="lazy"
        />
      ) : null}

      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="font-bold text-sm text-fg">{name}</div>
          <ConfidenceBadge
            confidence={confidence}
            detail={confidenceDetail}
            locale={locale}
            size="sm"
            withTooltip={false}
          />
        </div>
        <div className="text-[11px] text-fg-muted mt-0.5">
          {region} · {getDifficultyLabel(spot.difficulty, isPt)}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {sports.map((sport) => {
          const score = allScores[sport]?.score ?? 0;
          const label = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
          return (
            <span
              key={sport}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border border-divider bg-surface-1/[0.04]"
            >
              <span className="text-fg-muted">{label}</span>
              <span className="font-mono tabular-nums" style={{ color: getScoreRgb(score) }}>
                {score}
              </span>
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="bg-surface-1/[0.08] rounded-md py-1.5 px-1.5 col-span-2">
          <Waves className="w-3 h-3 inline mr-1 text-data-waves align-text-bottom" aria-hidden />
          <span className="text-fg-subtle">{isPt ? 'Ondas' : 'Waves'} </span>
          <span className="font-semibold text-fg tabular-nums">
            {swellHeight}m · {swellPeriod}s
          </span>
        </div>
        <div className="bg-surface-1/[0.08] rounded-md py-1.5 px-1.5">
          <Wind className="w-3 h-3 inline mr-1 text-data-wind align-text-bottom" aria-hidden />
          <span className="font-semibold text-fg tabular-nums">
            {windKnots}kt {windDirection}
          </span>
        </div>
        <div className="bg-surface-1/[0.08] rounded-md py-1.5 px-1.5">
          <Droplets className="w-3 h-3 inline mr-1 text-data-water align-text-bottom" aria-hidden />
          <span className="font-semibold text-fg tabular-nums">{waterTemp}°C</span>
        </div>
        <div className="bg-surface-1/[0.08] rounded-md py-1.5 px-1.5 col-span-2">
          <Zap className="w-3 h-3 inline mr-1 text-score-fair align-text-bottom" aria-hidden />
          <span className="text-fg-subtle">{isPt ? 'Energia' : 'Power'} </span>
          <span className="font-semibold text-fg tabular-nums">{wavePowerKw} kW/m</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="ventu-popup-detail w-full text-center py-2 rounded-lg bg-data-waves text-white text-xs font-semibold border-0 cursor-pointer"
          data-spot-id={spot.id}
        >
          {isPt ? 'Ver spot' : 'View spot'}
        </button>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ventu-popup-directions flex items-center justify-center gap-1 w-full text-center py-2 rounded-lg bg-surface-2/[0.08] text-fg text-xs font-semibold no-underline border border-divider hover:bg-surface-1/[0.04]"
          onClick={(e) => e.stopPropagation()}
        >
          <Navigation className="w-3.5 h-3.5" aria-hidden />
          {isPt ? 'Como chegar' : 'Get directions'}
        </a>
      </div>
    </div>
  );
}

export function renderSpotPopup(options: SpotPopupContentProps): string {
  return renderToStaticMarkup(<SpotPopupContent {...options} />);
}
