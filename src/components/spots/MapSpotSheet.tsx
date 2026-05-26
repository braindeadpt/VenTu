'use client';

import { Waves, Wind, X } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { getScoreTokens } from '@/lib/sportScore';
import { getCardinalLabel } from '@/lib/wind';
import { getTranslation } from '@/lib/i18n';
import Button from '@/components/ui/Button';
import ScoreBadge from '@/components/ui/ScoreBadge';

export interface MapSpotSheetData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

interface MapSpotSheetProps {
  data: MapSpotSheetData | null;
  selectedSport: GridSportFilter;
  locale: string;
  onClose: () => void;
  onViewSpot?: (spotId: string) => void;
}

function getBestScore(
  data: MapSpotSheetData,
  sport: GridSportFilter,
): number {
  if (sport === 'all') {
    return Math.max(...Object.values(data.allScores).map((s) => s?.score || 0));
  }
  if (sport === 'big-wave') {
    return data.allScores.surf?.score || 0;
  }
  return data.allScores[sport]?.score || 0;
}

export default function MapSpotSheet({
  data,
  selectedSport,
  locale,
  onClose,
  onViewSpot,
}: MapSpotSheetProps) {
  if (!data) return null;

  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const { spot, conditions } = data;
  const score = getBestScore(data, selectedSport);
  const tokens = getScoreTokens(score);
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const spotHref =
    selectedSport !== 'all' && selectedSport !== 'big-wave'
      ? `/${locale}/spots/${spot.slug}/?sport=${selectedSport}`
      : `/${locale}/spots/${spot.slug}/`;

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-[1040] bg-black/30 motion-reduce:transition-none transition-opacity duration-200"
        aria-label={isPt ? 'Fechar' : 'Close'}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-spot-sheet-title"
        className="absolute inset-x-0 bottom-0 z-[1050] rounded-t-2xl border-t border-divider bg-bg-elevated shadow-modal pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:transition-none transition-transform duration-200 ease-out"
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden>
          <div className="w-8 h-1 rounded-full bg-fg-subtle/30" />
        </div>

        <div className="px-4 pt-2 pb-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="map-spot-sheet-title" className="text-body font-semibold text-fg truncate">
                {isPt ? spot.name : spot.nameEn}
              </h2>
              <p className="text-meta-sm text-fg-muted mt-0.5">
                {isPt ? spot.region : spot.regionEn}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ScoreBadge score={score} locale={isPt ? 'pt' : 'en'} size="sm" />
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-input hover:bg-surface-1 text-fg-muted hover:text-fg transition-colors duration-150 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={isPt ? 'Fechar' : 'Close'}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-meta-sm text-fg-subtle">
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
              {conditions.waveHeight.toFixed(1)}m · {Math.round(conditions.wavePeriod)}s
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Wind className="w-3.5 h-3.5 text-data-wind" aria-hidden />
              {windKt}kt {getCardinalLabel(conditions.windDirection)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              href={spotHref}
              size="lg"
              className="w-full"
              locale={isPt ? 'pt' : 'en'}
              onClick={() => onViewSpot?.(spot.id)}
            >
              {t.map.viewSpot}
            </Button>
            {onViewSpot && (
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                locale={isPt ? 'pt' : 'en'}
                onClick={() => {
                  onViewSpot(spot.id);
                  onClose();
                }}
              >
                {t.map.quickPanel}
              </Button>
            )}
          </div>

          <p className={`text-meta-sm text-center ${tokens.text}`}>
            {isPt ? 'Score para filtros actuais' : 'Score for current filters'}
          </p>
        </div>
      </div>
    </>
  );
}
