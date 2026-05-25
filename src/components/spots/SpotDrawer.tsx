'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getRelevantSports } from '@/lib/sportScore';
import { SPORT_LABELS } from '@/lib/sportRatings';
import Drawer from '@/components/ui/Drawer';
import SpotDrawerHeader from './SpotDrawerHeader';
import SpotDrawerTabs from './SpotDrawerTabs';
import MetricBar from '@/components/ui/MetricBar';
import FavoriteButton from '@/components/FavoriteButton';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import { ArrowRight } from 'lucide-react';

interface SpotData {
  spot: Spot;
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
    updatedAt?: string;
    source?: 'real' | 'mock';
  };
  allScores: Record<SportType, SportScore>;
}

interface SpotDrawerProps {
  spotData: SpotData | null;
  onClose: () => void;
  locale: string;
}

/* ─── helpers ─── */
function scoreColor(score: number): string {
  if (score >= 80) return '--score-epic';
  if (score >= 60) return '--score-good';
  if (score >= 40) return '--score-fair';
  if (score >= 20) return '--score-poor';
  return '--score-closed';
}

function kts(v: number): string { return (v * 1.94384).toFixed(0); }

export default function SpotDrawer({ spotData, onClose, locale }: SpotDrawerProps) {
  const isPt = locale === 'pt';
  const [activeTab, setActiveTab] = useState('now');
  const [selectedSport, setSelectedSport] = useState<SportType>('surf');

  const spot = spotData?.spot;
  const conditions = spotData?.conditions;

  // Get the score for the selected sport
  const currentScore = useMemo(() => {
    if (!spotData) return 0;
    return spotData.allScores[selectedSport]?.score || 0;
  }, [spotData, selectedSport]);

  const compatibleSports = useMemo(() => {
    if (!spotData) return [];
    return getRelevantSports(spotData.spot, spotData.allScores);
  }, [spotData]);

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
          {/* ── Header with score ── */}
          <SpotDrawerHeader
            name={isPt ? spot.name : spot.nameEn}
            region={isPt ? spot.region : spot.regionEn}
            score={currentScore}
            waveHeight={conditions.waveHeight.toFixed(1)}
            windKnots={kts(conditions.windSpeed)}
            waterTemp={Math.round(conditions.waterTemp)}
            locale={locale}
          />

          <div className="flex justify-start">
            <DataSourceBadge
              source={conditions.source}
              updatedAt={conditions.updatedAt}
              locale={locale}
            />
          </div>

          {/* ── Sport pills ── */}
          {compatibleSports.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="radiogroup" aria-label={isPt ? 'Selecionar desporto' : 'Select sport'}>
              {compatibleSports.map((sport) => {
                const active = selectedSport === sport;
                return (
                  <button
                    key={sport}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedSport(sport)}
                    className={[
                      'px-3 py-2 min-h-[44px] rounded-full text-xs font-medium transition-all whitespace-nowrap',
                      active
                        ? 'bg-surface-2 border border-divider-strong text-fg'
                        : 'bg-surface-1 border border-divider text-fg-muted hover:bg-surface-2 hover:text-fg',
                    ].join(' ')}
                  >
                    {isPt ? SPORT_LABELS[sport]?.pt : SPORT_LABELS[sport]?.en}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Tabs ── */}
          <SpotDrawerTabs activeTab={activeTab} onTabChange={setActiveTab} locale={locale}>
            {activeTab === 'now' && (
              <div className="space-y-1">
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
            )}

            {activeTab === '7d' && (
              <div className="py-6 text-center text-sm text-fg-muted">
                {isPt ? 'Previsão de 7 dias disponível na página do spot.' : '7-day forecast available on the spot page.'}
              </div>
            )}

            {activeTab === 'windows' && (
              <div className="py-6 text-center text-sm text-fg-muted">
                {isPt ? 'Janelas mágicas disponíveis na página do spot.' : 'Magic windows available on the spot page.'}
              </div>
            )}

            {activeTab === 'seasonality' && (
              <div className="py-6 text-center text-sm text-fg-muted">
                {isPt ? 'Dados de sazonalidade disponíveis na página do spot.' : 'Seasonality data available on the spot page.'}
              </div>
            )}
          </SpotDrawerTabs>

          {/* ── Footer actions ── */}
          <div className="flex items-center gap-3 pt-3 border-t border-divider sticky bottom-0 bg-bg-base">
            <Link
              href={`/${locale}/spots/${spot.slug}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-data-waves hover:bg-data-waves/80 text-bg-base text-sm font-medium transition-all"
            >
              {isPt ? 'Ver página completa' : 'View full page'}
              <ArrowRight className="w-4 h-4" />
            </Link>
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
