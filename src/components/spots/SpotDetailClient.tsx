'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
// useSearchParams removed — using window.location.search for static export safety
import {
  ArrowLeft,
} from 'lucide-react';

import type { Spot } from '@/types';
import { fetchMarineData, getCurrentConditions, getForecastData, getTideInfo } from '@/lib/openmeteo';
import {
  getAllSportScores,
  getRelevantSports,
  getHourlyScores,
} from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';

import SeoHead from '@/components/SeoHead';
import ForecastTable from '@/components/weather/ForecastTable';
import type { ForecastHour } from '@/components/weather/ForecastTable';

import SpotMap from '@/components/spots/SpotMap';
import MagicWindows from '@/components/MagicWindows';
import SpotWebcamSection from '@/components/weather/SpotWebcamSection';
import SpotRelatedNews from '@/components/spots/SpotRelatedNews';
import SpotDetailHero from '@/components/spots/SpotDetailHero';
import SportTab from '@/components/spots/SportTab';
import { getLocalTips } from '@/lib/spotTips';
import { loadCommunityTips, mergeLocalTips } from '@/lib/communityTips';
import { rememberDataUpdate } from '@/lib/dataCache';
import { LocalTipsSection } from '@/components/spots/LocalTipsSection';
import AlertSubscribeForm from '@/components/alerts/AlertSubscribeForm';
import FeedbackForm from '@/components/FeedbackForm';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';

/* ═══════════════════════════════════════════════════════════════════════
 *  SpotDetailClient — structured spot page (conditions → forecast → info).
 *  Data loading unchanged; layout deduplicated and sectioned.
 *  ═══════════════════════════════════════════════════════════════════════ */

/* ─── Types ─── */

interface Conditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  swellHeight?: number;
  swellPeriod?: number;
  wavePowerKw?: number;
  tideHeight?: number;
  tideStatus?: 'high' | 'low' | 'rising' | 'falling';
  tideLabel?: string;
  source?: 'real' | 'mock';
  updatedAt?: string;
}

interface SpotData {
  spot: Spot;
  conditions: Conditions;
  allScores: Record<
    SportType,
    ReturnType<typeof getAllSportScores> extends Record<SportType, infer V> ? V : never
  >;
  forecast: Array<{
    time: string;
    waveHeight: number;
    wavePeriod: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
    tideHeight?: number;
  }>;
  tideObserved?: {
    height: number;
    at: string;
    station: string;
  };
}

/* ─── Main Component ─── */

export default function SpotDetailClient({
  spot,
  locale,
}: {
  spot: Spot;
  locale: string;
}) {
  // Read sport from URL safely (no useSearchParams to avoid static-export crash)
  const [sportFromUrl, setSportFromUrl] = useState<SportType | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const sport = params.get('sport') as SportType | null;
        setSportFromUrl(sport);
      } catch { /* ignore */ }
    }
  }, []);

  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const td = t.spotDetail;

  const [spotData, setSpotData] = useState<SpotData | null>(null);
  const [selectedSport, setSelectedSport] = useState<SportType>(
    sportFromUrl || (spot.compatibleSports?.[0] as SportType) || 'surf',
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [communityOverlay, setCommunityOverlay] = useState<Record<string, import('@/lib/communityTips').CommunityTipEntry>>({});

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    loadCommunityTips().then(setCommunityOverlay);
  }, []);

  /* ── Data loading ── */
  useEffect(() => {
    async function loadData() {
      try {
        setLoadError(false);
        // Try loading precomputed data first (avoids live API calls)
        let conditions: Conditions;
        let forecast: Array<{
          time: string;
          waveHeight: number;
          wavePeriod: number;
          windSpeed: number;
          windDirection: number;
          windGust: number;
          waterTemp: number;
          tideHeight?: number;
        }> = [];
        let tideObserved = undefined;

        const [conditionsResp, forecastsResp] = await Promise.all([
          fetch(getAssetPath('/data/conditions.json')),
          fetch(getAssetPath('/data/forecasts.json')),
        ]);

        if (conditionsResp.ok && forecastsResp.ok) {
          const condJson = await conditionsResp.json();
          const spotCond = condJson[spot.id];
          const fcJson = await forecastsResp.json();
          const spotFc = fcJson[spot.id];

          if (spotCond && spotFc) {
            conditions = {
              waveHeight: spotCond.waveHeight || 0,
              wavePeriod: spotCond.wavePeriod || 0,
              waveDirection: spotCond.waveDirection || 0,
              windSpeed: spotCond.windSpeed || 0,
              windDirection: spotCond.windDirection || 0,
              windGust: spotCond.windGust || 0,
              waterTemp: spotCond.waterTemp || 0,
              swellHeight: spotCond.swellHeight,
              swellPeriod: spotCond.swellPeriod,
              wavePowerKw: spotCond.wavePowerKw,
              tideHeight: spotCond.tideHeight,
              tideStatus: spotCond.tideStatus,
              tideLabel: spotCond.tideLabel,
              source: 'real',
              updatedAt: spotCond.updatedAt,
            };

            forecast = spotFc;

            if (spotCond.tideObservedHeight && spotCond.tideStation) {
              tideObserved = {
                height: spotCond.tideObservedHeight,
                at: spotCond.tideObservedAt,
                station: spotCond.tideStation,
              };
            }

            const allScores = getAllSportScores(spot, conditions);
            setSpotData({ spot, conditions, allScores, forecast, tideObserved });
            rememberDataUpdate(spotCond.updatedAt);

            if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
              setSelectedSport(sportFromUrl);
            } else {
              const bestSport = (
                Object.entries(allScores) as [SportType, any][]
              ).sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
              if (bestSport) setSelectedSport(bestSport);
            }
            setLoading(false);
            return;
          }
        }

        // Fallback: live API call
        const marineResult = await fetchMarineData(spot.lat, spot.lon);
        conditions = getCurrentConditions(marineResult);
        const allScores = getAllSportScores(spot, conditions);
        forecast = getForecastData(marineResult).slice(0, 120);

        // Try tide observed data even in fallback
        if (conditionsResp.ok) {
          const condJson = await conditionsResp.json();
          const spotCond = condJson[spot.id];
          if (spotCond?.tideObservedHeight && spotCond?.tideStation) {
            tideObserved = {
              height: spotCond.tideObservedHeight,
              at: spotCond.tideObservedAt,
              station: spotCond.tideStation,
            };
          }
        }

        setSpotData({ spot, conditions, allScores, forecast, tideObserved });

        if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
          setSelectedSport(sportFromUrl);
        } else {
          const bestSport = (
            Object.entries(allScores) as [SportType, any][]
          ).sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
          if (bestSport) setSelectedSport(bestSport);
        }
      } catch (e) {
        console.error(e);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [spot, sportFromUrl, retryCount]);

  /* ── Per-hour scores for ForecastTable ── */
  const hourlyScores = useMemo(() => {
    if (!spotData || !spotData.forecast.length) return [];
    return getHourlyScores(spot, selectedSport, spotData.forecast, spotData.conditions);
  }, [spot, selectedSport, spotData]);

  /* ── ForecastTable data transformation ── */
  const forecastTableData: ForecastHour[] = useMemo(() => {
    if (!spotData) return [];
    return spotData.forecast.map((h, i) => ({
      time: h.time,
      waveHeight: h.waveHeight,
      wavePeriod: h.wavePeriod,
      windSpeed: h.windSpeed,
      windDirection: h.windDirection,
      windGust: h.windGust,
      waterTemp: h.waterTemp,
      tideHeight: h.tideHeight,
      score: hourlyScores[i],
    }));
  }, [spotData, hourlyScores]);

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base p-4 space-y-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
        <div className="max-w-5xl mx-auto">
          <Skeleton className="h-64 rounded-card" />
        </div>
        <div className="max-w-5xl mx-auto">
          <Skeleton className="h-56 rounded-card" />
        </div>
      </div>
    );
  }

  if (loadError || !spotData) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {isPt ? t.spots.backToSpots : t.spots.backToSpots}
          </Link>
          <ErrorState
            message={td.loadError}
            locale={locale}
            onRetry={() => {
              setLoading(true);
              setRetryCount(c => c + 1);
            }}
          />
        </div>
      </div>
    );
  }

  const { conditions, allScores, forecast } = spotData;
  const score = allScores[selectedSport];
  const relevantSports = getRelevantSports(spot, allScores);
  const mergedLocalTipsRaw = mergeLocalTips(spot, getLocalTips(spot.slug), communityOverlay[spot.slug]);
  const mergedLocalTips = mergedLocalTipsRaw
    ? {
        spotSlug: spot.slug,
        bestTide: mergedLocalTipsRaw.bestTide || '',
        bestTideEn: mergedLocalTipsRaw.bestTideEn || mergedLocalTipsRaw.bestTide || '',
        parking: mergedLocalTipsRaw.parking || '',
        parkingEn: mergedLocalTipsRaw.parkingEn || mergedLocalTipsRaw.parking || '',
        food: mergedLocalTipsRaw.food || '',
        foodEn: mergedLocalTipsRaw.foodEn || mergedLocalTipsRaw.food || '',
        localRule: mergedLocalTipsRaw.localRule,
        localRuleEn: mergedLocalTipsRaw.localRuleEn,
      }
    : null;

  return (
    <>
      {/* SEO: JSON-LD for structured data */}
      <SeoHead
        title={`${isPt ? spot.name : spot.nameEn} - ${spot.region}${isPt ? ', ' : ', '}${spot.regionEn}`}
        description={isPt ? spot.description : spot.descriptionEn}
        image="/og-image.svg"
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Beach',
          name: isPt ? spot.name : spot.nameEn,
          description: isPt ? spot.description : spot.descriptionEn,
          address: {
            '@type': 'PostalAddress',
            addressRegion: spot.region,
            addressCountry: 'PT',
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: spot.lat,
            longitude: spot.lon,
          },
          url: `https://ventu.surf/${locale}/spots/${spot.slug}/`,
          sportActivityLocation: {
            '@type': 'SportsActivityLocation',
            name: (spot.compatibleSports?.[0] && SPORT_LABELS[spot.compatibleSports[0] as keyof typeof SPORT_LABELS])
              ? SPORT_LABELS[spot.compatibleSports[0] as keyof typeof SPORT_LABELS][isPt ? 'pt' : 'en']
              : spot.type,
          },
        }}
      />

      <div className="min-h-screen bg-bg-base pb-12">
        <SpotDetailHero
          spot={spot}
          spotSlug={spot.slug}
          locale={locale}
          backLabel={t.spots.backToSpots}
          sport={selectedSport}
          score={score.score}
          rating={score.rating}
          ratingEn={score.ratingEn}
          coastOrientation={spot.coastOrientation}
          tideObserved={spotData.tideObserved}
          conditions={conditions}
        />

        {/* Sport selector — sticky; horizontal scroll + edge-fade on mobile */}
        <section className="md:sticky md:top-16 z-30 bg-bg-base/95 md:backdrop-blur-sm border-b border-divider">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <p className="text-meta-sm text-fg-muted mb-2 md:hidden">{td.sportTabsHint}</p>
            <div
              className="flex items-center gap-2 -mx-4 px-4 overflow-x-auto overscroll-x-contain touch-pan-x no-scrollbar pb-1 edge-fade-x"
              role="tablist"
              aria-label={isPt ? 'Modalidade' : 'Sport'}
            >
              {(['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'wakeboard'] as SportType[])
                .filter((s) => relevantSports.includes(s))
                .map((sport) => (
                  <SportTab
                    key={sport}
                    sport={sport}
                    score={allScores[sport].score}
                    active={selectedSport === sport}
                    onClick={() => setSelectedSport(sport)}
                    locale={locale}
                  />
                ))}
            </div>
          </div>
        </section>

        {/* Forecast + sidebar — on mobile: map/windows before long forecast table */}
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 order-2 lg:order-1 space-y-3">
            <h2 className="text-h2 text-fg">
              {isPt ? 'Previsão horária' : 'Hourly forecast'}
            </h2>
            {forecastTableData.length > 0 ? (
              <div className="card-1 overflow-hidden p-3 md:p-4">
                <ForecastTable
                  hourly={forecastTableData}
                  hours={isMobile ? 72 : 120}
                  sport={selectedSport}
                  coastOrientation={spot.coastOrientation}
                  locale={locale as 'pt' | 'en'}
                  compact={isMobile}
                />
              </div>
            ) : (
              <div className="card-1 p-8 text-center text-body text-fg-subtle">
                {td.noForecast}
              </div>
            )}
          </section>

          <aside className="order-1 lg:order-2 space-y-6">
            <section>
              <h2 className="text-h2 text-fg mb-3">{td.location}</h2>
              <div className="card-1 p-2">
                <div className="h-48 sm:h-56 lg:h-64 rounded-card overflow-hidden">
                  <SpotMap lat={spot.lat} lon={spot.lon} locale={locale} />
                </div>
              </div>
            </section>

            {forecast.length > 0 && (
              <section>
                <h2 className="text-h2 text-fg mb-3">{td.bestWindows}</h2>
                <div className="card-1 p-4">
                  <MagicWindows
                    hourly={forecast.map((f) => ({
                      time: f.time,
                      waveHeight: f.waveHeight ?? 0,
                      wavePeriod: f.wavePeriod ?? 0,
                      windSpeed: f.windSpeed ?? 0,
                      windDirection: f.windDirection ?? 0,
                      windGust: f.windGust ?? 0,
                      waterTemp: f.waterTemp ?? 0,
                    }))}
                    spotType={selectedSport}
                    spotBestWind={spot.bestWind || ''}
                    locale={locale}
                  />
                </div>
              </section>
            )}
          </aside>
        </div>

        <SpotWebcamSection slug={spot.slug} locale={locale} />

        <SpotRelatedNews spot={spot} locale={locale} sport={selectedSport} />

        {/* Spot info — separated from actions */}
        <section className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="text-h2 text-fg mb-4">{td.about}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card-1 p-5 space-y-4">
              <p className="text-body text-fg-muted leading-relaxed">
                {isPt ? spot.description : spot.descriptionEn}
              </p>
              {mergedLocalTips && (
                <div className="pt-4 border-t border-divider space-y-2">
                  <LocalTipsSection tips={mergedLocalTips} locale={locale} />
                  {communityOverlay[spot.slug]?.contributor && (
                    <p className="text-xs text-fg-subtle">
                      {isPt ? 'Contribuição da comunidade' : 'Community contribution'}
                      {' · '}
                      @{communityOverlay[spot.slug].contributor}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="card-1 p-5 space-y-5">
              {spot.hazards && spot.hazards.length > 0 && (
                <div>
                  <h3 className="text-h3 text-fg mb-2">{td.hazards}</h3>
                  <div className="flex flex-wrap gap-2">
                    {spot.hazards.map((h, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-pill bg-score-poor/10 text-score-poor border border-score-poor/20 text-meta-sm"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {spot.facilities && spot.facilities.length > 0 && (
                <div>
                  <h3 className="text-h3 text-fg mb-2">{td.facilities}</h3>
                  <div className="flex flex-wrap gap-2">
                    {spot.facilities.map((f, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-pill bg-surface-2 text-fg-muted border border-divider text-meta-sm"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Actions — compact footer */}
        <section className="max-w-6xl mx-auto px-4 py-6 border-t border-divider">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AlertSubscribeForm
              spotSlug={spot.slug}
              spotName={isPt ? spot.name : spot.nameEn}
              defaultSport={selectedSport}
              locale={locale}
            />
            <div className="flex items-end">
              <FeedbackForm locale={locale} defaultSpotSlug={spot.slug} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

