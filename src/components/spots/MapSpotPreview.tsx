'use client';

import { Clock, Droplets, Waves, Wind, Zap } from 'lucide-react';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import { getCompatibleSports, SPORT_LABELS } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { resolveWavePowerKw } from '@/lib/waveEnergy';
import { getCardinalLabel, getWindRelationLabel, getWindRelationToCoast, getWindRelationDotClass } from '@/lib/wind';
import { getDifficultyLabel } from '@/lib/mapDifficulty';
import { getGoogleMapsDirectionsUrl, getSpotDetailHref } from '@/lib/mapSpotDetail';
import { getMapSpotNarrative } from '@/lib/mapSpotNarrative';
import { getMapTideLine } from '@/lib/spotTideRelevance';
import SpotImage from '@/components/ui/SpotImage';
import ScoreBadge from '@/components/ui/ScoreBadge';
import ConfidenceBadge from '@/components/ui/ConfidenceBadge';
import Button from '@/components/ui/Button';
import WarningPill from '@/components/ui/WarningPill';

export interface MapSpotPreviewData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
  /** Active sea-state/wind IPMA warning — chip above the metrics. */
  warning?: MapMarkerWarning | null;
}

interface MapSpotPreviewProps {
  data: MapSpotPreviewData;
  locale: string;
  /** Highlight sport from map filter (chip order). */
  highlightSport?: GridSportFilter;
  onViewSpot?: () => void;
}

export default function MapSpotPreview({
  data,
  locale,
  highlightSport = 'all',
  onViewSpot,
}: MapSpotPreviewProps) {
  const isPt = locale === 'pt';
  const { spot, conditions, allScores, warning } = data;
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = conditions.swellPeriod ?? conditions.wavePeriod;
  const powerKw = resolveWavePowerKw(conditions);
  const sports = getCompatibleSports(spot);
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);
  const detailHref = getSpotDetailHref(
    locale,
    spot.slug,
    highlightSport !== 'all' && highlightSport !== 'big-wave' ? highlightSport : undefined,
  );

  const sortedSports = [...sports].sort((a, b) => {
    const sa = allScores[a]?.score ?? 0;
    const sb = allScores[b]?.score ?? 0;
    return sb - sa;
  });

  const narrative = getMapSpotNarrative(spot, conditions, allScores, highlightSport, isPt);
  const tideLine = getMapTideLine(spot, conditions, isPt);
  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
      : undefined;
  const windRelationMeta =
    windRelation != null
      ? getWindRelationLabel(windRelation, isPt ? 'pt' : 'en')
      : undefined;

  return (
    <div className="space-y-4">
      <SpotImage spot={spot} aspect="video" locale={isPt ? 'pt' : 'en'} className="rounded-xl w-full" />

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-h3 text-fg font-semibold">
            {isPt ? spot.name : spot.nameEn}
          </h2>
          <ConfidenceBadge
            confidence={conditions.confidence}
            detail={conditions.confidenceDetail}
            locale={locale}
            size="sm"
          />
        </div>
        <p className="text-meta text-fg-muted">
          {isPt ? spot.region : spot.regionEn}
          <span aria-hidden> · </span>
          <span className="capitalize">{getDifficultyLabel(spot.difficulty, isPt)}</span>
        </p>
        <p className="text-body-sm text-fg leading-snug pt-1">{narrative}</p>
        {tideLine ? (
          <p className="text-meta-sm text-fg-muted flex items-center gap-1.5 pt-0.5">
            <Clock className="w-3.5 h-3.5 shrink-0 text-data-water" aria-hidden />
            {tideLine}
          </p>
        ) : null}
      </div>

      {warning && <WarningPill warning={warning} locale={locale} variant="default" />}

      <div className="flex flex-wrap gap-1.5" role="list" aria-label={isPt ? 'Scores por desporto' : 'Scores by sport'}>
        {sortedSports.map((sport) => {
          const score = allScores[sport]?.score ?? 0;
          const label = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
          const active = highlightSport === sport || (highlightSport === 'big-wave' && sport === 'surf');
          return (
            <span
              key={sport}
              role="listitem"
              className={`inline-flex items-center gap-1.5 pill pill-ghost px-2 py-1 min-h-0 text-meta-sm ${
                active ? 'ring-1 ring-data-waves/40' : ''
              }`}
              data-sport={sport}
            >
              <span className="sport-accent" data-sport={sport}>
                {label}
              </span>
              <ScoreBadge score={score} locale={isPt ? 'pt' : 'en'} size="sm" />
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 text-meta-sm">
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
            <span>{isPt ? 'Ondas' : 'Waves'}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold">
            {swellH.toFixed(1)}m · {Math.round(swellT)}s
          </p>
        </div>
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Wind className="w-3.5 h-3.5 text-data-wind" aria-hidden />
            <span>{isPt ? 'Vento' : 'Wind'}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold flex flex-wrap items-center gap-1.5">
            <span>{windKt}kt {getCardinalLabel(conditions.windDirection)}</span>
            {windRelationMeta && windRelation ? (
              <>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${getWindRelationDotClass(windRelation)}`}
                  aria-hidden
                />
                <span
                  className={`text-[10px] font-sans font-medium px-1.5 py-0.5 rounded-pill border ${windRelationMeta.className}`}
                >
                  {windRelationMeta.label}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Droplets className="w-3.5 h-3.5 text-data-water" aria-hidden />
            <span>{isPt ? 'Água' : 'Water'}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold">
            {conditions.waterTemp.toFixed(1)}°C
          </p>
        </div>
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Zap className="w-3.5 h-3.5 text-score-fair" aria-hidden />
            <span>{isPt ? 'Energia' : 'Power'}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold">{powerKw.toFixed(1)} kW/m</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          href={detailHref}
          size="lg"
          className="flex-1"
          locale={isPt ? 'pt' : 'en'}
          onClick={onViewSpot}
        >
          {isPt ? 'Ver spot' : 'View spot'}
        </Button>
        <Button
          href={directionsUrl}
          size="lg"
          className="flex-1"
          locale={isPt ? 'pt' : 'en'}
          target="_blank"
          rel="noopener noreferrer"
        >
          {isPt ? 'Como chegar' : 'Get directions'}
        </Button>
      </div>
    </div>
  );
}
