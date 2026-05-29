'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';

import type { Spot } from '@/types';
import { fetchMarineData, getCurrentConditions, getForecastData } from '@/lib/openmeteo';
import {
  getAllSportScores,
  getRelevantSports,
  getHourlyScores,
} from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { getWindguruUrl } from '@/lib/windguru';
import { getCardinalLabel } from '@/lib/wind';
import { getWindRelationToCoast, getWindRelationLabel } from '@/lib/wind';
import { resolveWavePowerKw } from '@/lib/waveEnergy';
import { buildTideSchedule, phaseFromConditionsStatus } from '@/lib/tideSchedule';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { cn } from '@/lib/cn';

import SeoHead from '@/components/SeoHead';
import ForecastTable from '@/components/weather/ForecastTable';
import type { ForecastHour } from '@/components/weather/ForecastTable';

import SpotMap from '@/components/spots/SpotMap';
import MagicWindows from '@/components/MagicWindows';
import { computeMagicWindows } from '@/lib/magicWindows';
import SpotWebcamSection from '@/components/weather/SpotWebcamSection';
import SpotWeatherlinkSection from '@/components/weather/SpotWeatherlinkSection';
import SpotDetailHero from '@/components/spots/SpotDetailHero';
import TideScheduleStrip from '@/components/spots/TideScheduleStrip';
import SportTab from '@/components/spots/SportTab';
import ScoreFeedback from '@/components/spots/ScoreFeedback';
import { getLocalTips } from '@/lib/spotTips';
import { loadCommunityTips, mergeLocalTips } from '@/lib/communityTips';
import { rememberDataUpdate } from '@/lib/dataCache';
import { LocalTipsSection } from '@/components/spots/LocalTipsSection';
import AlertSubscribeForm from '@/components/alerts/AlertSubscribeForm';
import FeedbackForm from '@/components/FeedbackForm';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatChip from '@/components/ui/StatChip';
import SwellRadar from '@/components/ui/SwellRadar';

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
  confidence?: import('@/lib/forecastConfidence').ConfidenceTier;
  confidenceDetail?: import('@/lib/forecastConfidence').ConfidenceDetail;
  dailyConfidence?: import('@/lib/forecastConfidence').DailyConfidence[];
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
}

export default function SpotDetailClient({
  spot,
  locale,
}: {
  spot: Spot;
  locale: string;
}) {
  const searchParams = useSearchParams();
  const sportFromUrl = searchParams?.get('sport') as SportType | null;

  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const td = t.spotDetail;

  const [spotData, setSpotData] = useState<SpotData | null>(null);
  const initialSport = sportFromUrl || (spot.compatibleSports?.[0] as SportType) || 'surf';
  const [selectedSport, setSelectedSport] = useState<SportType>(initialSport);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [forecastExpanded, setForecastExpanded] = useState(false);
  const [communityOverlay, setCommunityOverlay] = useState<
    Record<string, import('@/lib/communityTips').CommunityTipEntry>
  >({});

  const tideSchedule = useMemo(() => {
    if (!spotData?.forecast?.length) return null;
    return buildTideSchedule(spotData.forecast, {
      locale: isPt ? 'pt' : 'en',
      phaseOverride: phaseFromConditionsStatus(spotData.conditions.tideStatus),
    });
  }, [spotData, isPt]);

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

  useEffect(() => {
    if (!spotData) return;
    const sports = getRelevantSports(spot, spotData.allScores);
    if (sports.length > 0 && !sports.includes(selectedSport)) {
      setSelectedSport(sports[0]);
    }
  }, [spot, spotData, selectedSport]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoadError(false);
        let conditions: Conditions;
        let forecast: SpotData['forecast'] = [];
        const [conditionsResp, forecastsResp] = await Promise.all([
          fetch(getAssetPath('/data/conditions.json')),
          fetch(getAssetPath('/data/forecasts.json')),
        ]);

        if (conditionsResp.ok && forecastsResp.ok) {
          const condJson = await conditionsResp.json();
          const dataId = getConditionsDataId(spot);
          const spotCond = condJson[dataId] ?? condJson[spot.id];
          const fcJson = await forecastsResp.json();
          const spotFc = fcJson[dataId] ?? fcJson[spot.id];

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
              confidence: spotCond.confidence,
              confidenceDetail: spotCond.confidenceDetail,
              dailyConfidence: spotCond.dailyConfidence,
              source: 'real',
              updatedAt: spotCond.updatedAt,
            };

            forecast = spotFc;

            const allScores = getAllSportScores(spot, conditions);
            setSpotData({ spot, conditions, allScores, forecast });
            rememberDataUpdate(spotCond.updatedAt);

            if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
              setSelectedSport(sportFromUrl);
            } else {
              const bestSport = (
                Object.entries(allScores) as [SportType, { score: number }][]
              ).sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
              if (bestSport) setSelectedSport(bestSport);
            }
            setLoading(false);
            return;
          }
        }

        const marineResult = await fetchMarineData(spot.lat, spot.lon);
        conditions = getCurrentConditions(marineResult);
        const allScores = getAllSportScores(spot, conditions);
        forecast = getForecastData(marineResult).slice(0, 120);

        if (conditionsResp.ok) {
          const condJson = await conditionsResp.json();
          const dataId = getConditionsDataId(spot);
          const spotCond = condJson[dataId] ?? condJson[spot.id];
          if (spotCond) {
            conditions = {
              waveHeight: spotCond.waveHeight || 0,
              wavePeriod: spotCond.wavePeriod || 0,
              waveDirection: spotCond.waveDirection || 0,
              windSpeed: spotCond.windSpeed || 0,
              windDirection: spotCond.windDirection || 0,
              windGust: spotCond.windGust || 0,
              waterTemp: spotCond.waterTemp || 0,
              source: 'real',
              updatedAt: spotCond.updatedAt,
            };
          }
        }

        setSpotData({ spot, conditions, allScores, forecast });

        if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
          setSelectedSport(sportFromUrl);
        } else {
          const bestSport = (
            Object.entries(allScores) as [SportType, { score: number }][]
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

  const hourlyScores = useMemo(() => {
    if (!spotData || !spotData.forecast.length) return [];
    return getHourlyScores(spot, selectedSport, spotData.forecast, spotData.conditions);
  }, [spot, selectedSport, spotData]);

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

  const forecastHours = useMemo(() => {
    if (forecastExpanded) return isMobile ? 72 : 120;
    return isMobile ? 36 : 48;
  }, [forecastExpanded, isMobile]);

  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);
  const windguruUrl = getWindguruUrl(
    spot.slug,
    isPt ? spot.name : spot.nameEn,
    spot.lat,
    spot.lon,
  );

  const magicWindowsHourly = useMemo(
    () =>
      spotData?.forecast.map((f) => ({
        time: f.time,
        waveHeight: f.waveHeight ?? 0,
        wavePeriod: f.wavePeriod ?? 0,
        windSpeed: f.windSpeed ?? 0,
        windDirection: f.windDirection ?? 0,
        windGust: f.windGust ?? 0,
        waterTemp: f.waterTemp ?? 0,
      })) ?? [],
    [spotData?.forecast],
  );

  const showMagicWindows = useMemo(
    () =>
      magicWindowsHourly.length > 0 &&
      computeMagicWindows(magicWindowsHourly, selectedSport, spot.bestWind || '').length > 0,
    [magicWindowsHourly, selectedSport, spot.bestWind],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base p-4 space-y-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-8 w-3/4" />
        </div>
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError || !spotData) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t.spots.backToSpots}
          </Link>
          <ErrorState
            message={td.loadError}
            locale={locale}
            onRetry={() => {
              setLoading(true);
              setRetryCount((c) => c + 1);
            }}
          />
        </div>
      </div>
    );
  }

  const { conditions, allScores, forecast } = spotData;
  const relevantSports = getRelevantSports(spot, allScores);
  const score = allScores[selectedSport] ?? allScores[relevantSports[0] ?? 'surf'];
  const mergedLocalTipsRaw = mergeLocalTips(
    spot,
    getLocalTips(spot.slug),
    communityOverlay[spot.slug],
  );
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
        accommodation: mergedLocalTipsRaw.accommodation,
        accommodationEn: mergedLocalTipsRaw.accommodationEn,
      }
    : null;

  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const gustKt = Math.round((conditions.windGust ?? conditions.windSpeed) * 1.94384);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const powerKw = resolveWavePowerKw(conditions);
  const windCardinal = getCardinalLabel(conditions.windDirection);

  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
      : null;
  const windRelationMeta = windRelation
    ? getWindRelationLabel(windRelation, isPt ? 'pt' : 'en')
    : null;

  return (
    <>
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
            name:
              spot.compatibleSports?.[0] &&
              SPORT_LABELS[spot.compatibleSports[0] as keyof typeof SPORT_LABELS]
                ? SPORT_LABELS[spot.compatibleSports[0] as keyof typeof SPORT_LABELS][
                    isPt ? 'pt' : 'en'
                  ]
                : spot.type,
          },
        }}
      />

      <div className="min-h-screen bg-bg-base pb-10">
        <SpotDetailHero
          spot={spot}
          spotSlug={spot.slug}
          locale={locale}
          backLabel={t.spots.backToSpots}
          directionsLabel={td.getDirections}
          sport={selectedSport}
          score={score.score}
          rating={score.rating}
          ratingEn={score.ratingEn}
          conditions={conditions}
        />

        <section className="sticky top-16 z-30 bg-bg-base border-b border-divider md:bg-bg-base/95 md:backdrop-blur-sm">
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

        {/* Dashboard: Agora + mapa acima da dobra */}
        <section className="max-w-6xl mx-auto px-4 py-4" aria-label={td.now}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card variant="card-1" className="p-4 space-y-4">
              <h2 className="text-h3 text-fg">{td.now}</h2>
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <SwellRadar
                  swellDirection={conditions.waveDirection}
                  swellHeight={swellH}
                  swellPeriod={conditions.wavePeriod}
                  windDirection={conditions.windDirection}
                  windSpeed={conditions.windSpeed}
                  coastOrientation={spot.coastOrientation}
                  size="md"
                  showLegend={false}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 w-full">
                  <StatChip
                    icon={<Waves className="w-4 h-4 text-data-waves" />}
                    value={`${conditions.waveHeight.toFixed(1)}m`}
                    label={isPt ? 'Ondas' : 'Waves'}
                    className="bg-surface-1/[0.04]"
                  />
                  <StatChip
                    icon={<Clock className="w-4 h-4 text-data-period" />}
                    value={`${Math.round(conditions.wavePeriod)}s`}
                    label={isPt ? 'Período' : 'Period'}
                    className="bg-surface-1/[0.04]"
                  />
                  <StatChip
                    icon={<Waves className="w-4 h-4 text-data-waves/80" />}
                    value={`${swellH.toFixed(1)}m`}
                    label={isPt ? 'Swell' : 'Swell'}
                    className="bg-surface-1/[0.04]"
                  />
                  <StatChip
                    icon={<Wind className="w-4 h-4 text-data-wind" />}
                    value={`${windKt}kt`}
                    label={`${isPt ? 'Vento' : 'Wind'} · ${windCardinal}`}
                    className="bg-surface-1/[0.04]"
                  />
                  <StatChip
                    icon={<Wind className="w-4 h-4 text-data-wind/70" />}
                    value={`${gustKt}kt`}
                    label={isPt ? 'Rajada' : 'Gust'}
                    className="bg-surface-1/[0.04]"
                  />
                  <StatChip
                    icon={<Zap className="w-4 h-4 text-data-period" />}
                    value={`${powerKw.toFixed(0)}`}
                    label={isPt ? 'Energia kW' : 'Power kW'}
                    className="bg-surface-1/[0.04]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {windRelationMeta && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
                      windRelationMeta.className,
                    )}
                  >
                    {windRelationMeta.label}
                  </span>
                )}
              </div>

              {tideSchedule && (
                <TideScheduleStrip schedule={tideSchedule} locale={locale} />
              )}

              <div className="pt-2 border-t border-divider/60">
                <p className="text-meta-sm text-fg-subtle mb-1.5">{td.scoreFeedbackHint}</p>
                <ScoreFeedback
                  spotSlug={spot.slug}
                  sport={selectedSport}
                  predictedScore={score.score}
                  conditionsSnapshot={{
                    waveHeight: conditions.waveHeight,
                    wavePeriod: conditions.wavePeriod,
                    windSpeed: conditions.windSpeed,
                    windDirection: conditions.windDirection,
                    waterTemp: conditions.waterTemp,
                  }}
                  locale={locale}
                />
              </div>
            </Card>

            <div className="space-y-4">
              <Card variant="card-1" className="p-3 space-y-3">
                <h2 className="text-h3 text-fg">{td.location}</h2>
                <div className="h-40 sm:h-44 rounded-card overflow-hidden border border-divider">
                  <SpotMap lat={spot.lat} lon={spot.lon} locale={locale} />
                </div>
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-meta text-data-waves hover:text-data-waves/80 font-medium transition-colors duration-150"
                >
                  {isPt ? 'Abrir no Google Maps' : 'Open in Google Maps'}
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
                </a>
              </Card>

              {showMagicWindows && (
                <Card variant="card-1" className="p-4">
                  <h2 className="text-h3 text-fg mb-3">{td.bestWindows}</h2>
                  <MagicWindows
                    hourly={magicWindowsHourly}
                    spotType={selectedSport}
                    spotBestWind={spot.bestWind || ''}
                    locale={locale}
                  />
                </Card>
              )}
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-h2 text-fg">
              {isPt ? 'Previsão horária' : 'Hourly forecast'}
            </h2>
            <a
              href={windguruUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-meta text-data-waves hover:text-data-waves/80"
            >
              {td.windguruLink}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          </div>
          {/* TODO: Windguru WRF 9km iframe — pending ToS review (see src/lib/windguru.ts) */}
          <p className="text-meta text-fg-muted md:hidden">{td.forecastHint}</p>
          {forecastTableData.length > 0 ? (
            <>
              <div className="card-1 overflow-hidden p-3 md:p-4">
                <ForecastTable
                  hourly={forecastTableData}
                  hours={forecastHours}
                  sport={selectedSport}
                  coastOrientation={spot.coastOrientation}
                  locale={locale as 'pt' | 'en'}
                  compact={isMobile}
                />
              </div>
              {forecastTableData.length > (isMobile ? 36 : 48) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForecastExpanded((v) => !v)}
                  rightIcon={
                    forecastExpanded ? (
                      <ChevronUp className="w-4 h-4" aria-hidden />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden />
                    )
                  }
                  locale={isPt ? 'pt' : 'en'}
                >
                  {forecastExpanded ? td.collapseForecast : td.expandForecast}
                </Button>
              )}
            </>
          ) : (
            <div className="card-1 p-8 text-center text-body text-fg-subtle">{td.noForecast}</div>
          )}
        </section>

        <section className="max-w-6xl mx-auto px-4 py-4 space-y-3">
          <h2 className="text-h2 text-fg">{td.logistics}</h2>
          <p className="text-body text-fg-muted leading-relaxed max-w-3xl">
            {isPt ? spot.description : spot.descriptionEn}
          </p>
          <LocalTipsSection spot={spot} tips={mergedLocalTips} locale={locale} />
          {communityOverlay[spot.slug]?.contributor && (
            <p className="text-meta-sm text-fg-subtle">
              {isPt ? 'Contribuição da comunidade' : 'Community contribution'}
              {' · '}
              @{communityOverlay[spot.slug].contributor}
            </p>
          )}
        </section>

        <SpotWeatherlinkSection slug={spot.slug} locale={locale} />

        <div className="max-w-6xl mx-auto px-4">
          <SpotWebcamSection slug={spot.slug} locale={locale} />
        </div>

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
