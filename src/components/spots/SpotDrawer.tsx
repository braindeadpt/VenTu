'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getRelevantSports } from '@/lib/sportScore';
import SportTab from '@/components/spots/SportTab';
import Drawer from '@/components/ui/Drawer';
import SpotDrawerHeader from './SpotDrawerHeader';
import MetricBar from '@/components/ui/MetricBar';
import FavoriteButton from '@/components/FavoriteButton';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { resolveWavePowerKw } from '@/lib/waveEnergy';
import { formatKnots } from '@/lib/wind';
import { spotDetailHref } from '@/lib/gridSpotScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';

interface SpotData {
  spot: Spot;
  conditions: MarineConditionsFields;
  allScores: Record<SportType, SportScore>;
}

interface SpotDrawerProps {
  spotData: SpotData | null;
  onClose: () => void;
  locale: string;
  gridSport?: GridSportFilter;
}

const kts = formatKnots;

function resolveDrawerSport(
  gridSport: GridSportFilter,
  spotData: SpotData,
  compatible: SportType[],
): SportType {
  if (gridSport !== 'all' && gridSport !== 'big-wave' && compatible.includes(gridSport)) {
    return gridSport;
  }
  let best: SportType = compatible[0] ?? 'surf';
  let bestScore = spotData.allScores[best]?.score ?? 0;
  for (const s of compatible) {
    const sc = spotData.allScores[s]?.score ?? 0;
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}

export default function SpotDrawer({
  spotData,
  onClose,
  locale,
  gridSport = 'all',
}: SpotDrawerProps) {
  const isPt = locale === 'pt';
  const [selectedSport, setSelectedSport] = useState<SportType>('surf');

  const spot = spotData?.spot;
  const conditions = spotData?.conditions;

  const compatibleSports = useMemo(() => {
    if (!spotData) return [];
    return getRelevantSports(spotData.spot, spotData.allScores);
  }, [spotData]);

  useEffect(() => {
    if (!spotData || compatibleSports.length === 0) return;
    setSelectedSport(resolveDrawerSport(gridSport, spotData, compatibleSports));
  }, [spotData, gridSport, compatibleSports]);

  const currentScore = spotData?.allScores[selectedSport]?.score ?? 0;
  const wavePowerKw = conditions ? resolveWavePowerKw(conditions) : 0;
  const detailHref = spot
    ? spotDetailHref(locale, spot.slug, gridSport !== 'all' ? gridSport : selectedSport)
    : '#';

  return (
    <Drawer
      isOpen={!!spotData}
      onClose={onClose}
      side="left"
      title={spot?.name ?? ''}
      locale={locale}
    >
      {spotData && spot && conditions && (
        <div className="space-y-4">
          <SpotDrawerHeader
            name={isPt ? spot.name : spot.nameEn}
            region={isPt ? spot.region : spot.regionEn}
            score={currentScore}
            waveHeight={conditions.waveHeight.toFixed(1)}
            windKnots={kts(conditions.windSpeed)}
            wavePowerKw={wavePowerKw.toFixed(1)}
            waterTemp={Math.round(conditions.waterTemp)}
            locale={locale}
          />

          <DataSourceBadge
            source={conditions.source}
            updatedAt={conditions.updatedAt}
            locale={locale}
          />

          {compatibleSports.length > 1 && (
            <div
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1 edge-fade-x"
              role="tablist"
              aria-label={isPt ? 'Modalidade' : 'Sport'}
            >
              {compatibleSports.map((sport) => (
                <SportTab
                  key={sport}
                  sport={sport}
                  score={spotData.allScores[sport]?.score ?? 0}
                  active={selectedSport === sport}
                  onClick={() => setSelectedSport(sport)}
                  locale={locale}
                />
              ))}
            </div>
          )}

          <div className="space-y-1" role="tabpanel">
            <MetricBar
              label={isPt ? 'Altura onda' : 'Wave height'}
              value={conditions.waveHeight.toFixed(1)}
              unit="m"
              fillPercent={Math.min(100, conditions.waveHeight * 40)}
            />
            <MetricBar
              label={isPt ? 'Período' : 'Period'}
              value={conditions.wavePeriod.toFixed(0)}
              unit="s"
              fillPercent={Math.min(100, (conditions.wavePeriod - 3) * 12)}
              colorVar="--data-period"
            />
            <MetricBar
              label={isPt ? 'Energia' : 'Energy'}
              value={wavePowerKw.toFixed(1)}
              unit="kW/m"
              fillPercent={Math.min(100, wavePowerKw * 2)}
              colorVar="--data-period"
            />
            <MetricBar
              label={isPt ? 'Vento' : 'Wind'}
              value={kts(conditions.windSpeed)}
              unit="kt"
              fillPercent={Math.min(100, parseFloat(kts(conditions.windSpeed)) * 4)}
              colorVar="--data-wind"
            />
            <MetricBar
              label={isPt ? 'Rajada' : 'Gust'}
              value={kts(conditions.windGust)}
              unit="kt"
              fillPercent={Math.min(100, parseFloat(kts(conditions.windGust)) * 4)}
              colorVar="--data-wind"
            />
            <MetricBar
              label={isPt ? 'Temp. água' : 'Water temp'}
              value={Math.round(conditions.waterTemp).toString()}
              unit="°C"
              fillPercent={Math.min(100, conditions.waterTemp * 5)}
              colorVar="--data-water"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-divider sticky bottom-0 bg-bg-base">
            <Button
              href={detailHref}
              size="md"
              className="flex-1"
              locale={isPt ? 'pt' : 'en'}
              rightIcon={<ArrowRight className="w-4 h-4" aria-hidden />}
            >
              {isPt ? 'Ver página completa' : 'View full page'}
            </Button>
            <FavoriteButton
              spotId={spot.id}
              spotName={isPt ? spot.name : spot.nameEn}
              size="md"
              locale={locale}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
