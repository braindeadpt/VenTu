'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

import type { Spot } from '@/types';
import { fetchMarineData, getCurrentConditions, getForecastData } from '@/lib/openmeteo';
import {
  getAllSportScores,
  getRelevantSports,
  getHourlyScores,
} from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { getWindguruUrl } from '@/lib/windguru';
import { buildTideSchedule, phaseFromConditionsStatus } from '@/lib/tideSchedule';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import SeoHead from '@/components/SeoHead';
import ForecastTable from '@/components/weather/ForecastTable';
import type { ForecastHour } from '@/components/weather/ForecastTable';

import MagicWindows from '@/components/MagicWindows';
import { computeMagicWindows } from '@/lib/magicWindows';
import SpotWebcamSection from '@/components/weather/SpotWebcamSection';
import SpotWeatherlinkSection from '@/components/weather/SpotWeatherlinkSection';
import SpotDetailHero from '@/components/spots/SpotDetailHero';
import SportTab from '@/components/spots/SportTab';
import { getLocalTips } from '@/lib/spotTips';
import { loadCommunityTips, mergeLocalTips } from '@/lib/communityTips';
import { rememberDataUpdate } from '@/lib/dataCache';
import { loadConditionsJson, loadForecastForSpot } from '@/lib/spotDataCache';
import { LocalTipsSection } from '@/components/spots/LocalTipsSection';
import FeedbackForm from '@/components/FeedbackForm';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import SpotConditionsDashboard from '@/components/spots/SpotConditionsDashboard';
import SpotStickyBar from '@/components/spots/SpotStickyBar';
import SpotLogisticsPanel from '@/components/spots/SpotLogisticsPanel';
import type { ObservedConditions } from '@/lib/observations';

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
  swellDirection?: number;
  secondarySwellHeight?: number;
  secondarySwellPeriod?: number;
  secondarySwellDirection?: number;
  wavePowerKw?: number;
  tideHeight?: number;
  tideStatus?: 'high' | 'low' | 'rising' | 'falling';
  tideLabel?: string;
  source?: 'real' | 'mock';
  updatedAt?: string;
  confidence?: import('@/lib/forecastConfidence').ConfidenceTier;
  confidenceDetail?: import('@/lib/forecastConfidence').ConfidenceDetail;
  dailyConfidence?: import('@/lib/forecastConfidence').DailyConfidence[];
  observed?: ObservedConditions;
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

  const heroRef = useRef<HTMLElement>(null);

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
    let cancelled = false;
    const loadSlug = spot.slug;

    async function loadData() {
      try {
        setLoadError(false);
        let conditions: Conditions;
        let forecast: SpotData['forecast'] = [];

        let condJson: Record<string, unknown> | null = null;
        let spotFc: SpotData['forecast'] | null = null;

        try {
          const dataId = getConditionsDataId(spot);
          [condJson, spotFc] = await Promise.all([
            loadConditionsJson(),
            loadForecastForSpot(dataId).then((d) => d as SpotData['forecast']).catch(() => null),
          ]);
        } catch {
          condJson = null;
        }

        if (cancelled || spot.slug !== loadSlug) return;

        if (condJson && spotFc) {
          const dataId = getConditionsDataId(spot);
          const spotCond = (condJson[dataId] ?? condJson[spot.id]) as Record<string, unknown> | undefined;

          if (spotCond && spotFc) {
            conditions = {
              waveHeight: Number(spotCond.waveHeight) || 0,
              wavePeriod: Number(spotCond.wavePeriod) || 0,
              waveDirection: Number(spotCond.waveDirection) || 0,
              windSpeed: Number(spotCond.windSpeed) || 0,
              windDirection: Number(spotCond.windDirection) || 0,
              windGust: Number(spotCond.windGust) || 0,
              waterTemp: Number(spotCond.waterTemp) || 0,
              swellHeight: spotCond.swellHeight as number | undefined,
              swellPeriod: spotCond.swellPeriod as number | undefined,
              swellDirection: spotCond.swellDirection as number | undefined,
              secondarySwellHeight: spotCond.secondarySwellHeight as number | undefined,
              secondarySwellPeriod: spotCond.secondarySwellPeriod as number | undefined,
              secondarySwellDirection: spotCond.secondarySwellDirection as number | undefined,
              wavePowerKw: spotCond.wavePowerKw as number | undefined,
              observed: spotCond.observed as ObservedConditions | undefined,
              tideHeight: spotCond.tideHeight as number | undefined,
              tideStatus: spotCond.tideStatus as Conditions['tideStatus'],
              tideLabel: spotCond.tideLabel as string | undefined,
              confidence: spotCond.confidence as Conditions['confidence'],
              confidenceDetail: spotCond.confidenceDetail as Conditions['confidenceDetail'],
              dailyConfidence: spotCond.dailyConfidence as Conditions['dailyConfidence'],
              source: 'real',
              updatedAt:
                typeof spotCond.updatedAt === 'string' ? spotCond.updatedAt : undefined,
            };

            forecast = spotFc;

            const allScores = getAllSportScores(spot, conditions);
            if (cancelled || spot.slug !== loadSlug) return;

            setSpotData({ spot, conditions, allScores, forecast });
            rememberDataUpdate(
              typeof spotCond.updatedAt === 'string' ? spotCond.updatedAt : undefined,
            );

            if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
              setSelectedSport(sportFromUrl);
            } else {
              const bestSport = (
                Object.entries(allScores) as [SportType, { score: number }][]
              ).sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
              if (bestSport) setSelectedSport(bestSport);
            }
            return;
          }
        }

        const marineResult = await fetchMarineData(spot.lat, spot.lon);
        if (cancelled || spot.slug !== loadSlug) return;

        conditions = getCurrentConditions(marineResult);
        const allScores = getAllSportScores(spot, conditions);
        forecast = getForecastData(marineResult).slice(0, 120);

        if (condJson) {
          const dataId = getConditionsDataId(spot);
          const spotCond = (condJson[dataId] ?? condJson[spot.id]) as Record<string, unknown> | undefined;
          if (spotCond) {
            conditions = {
              waveHeight: Number(spotCond.waveHeight) || 0,
              wavePeriod: Number(spotCond.wavePeriod) || 0,
              waveDirection: Number(spotCond.waveDirection) || 0,
              windSpeed: Number(spotCond.windSpeed) || 0,
              windDirection: Number(spotCond.windDirection) || 0,
              windGust: Number(spotCond.windGust) || 0,
              waterTemp: Number(spotCond.waterTemp) || 0,
              source: 'real',
              updatedAt:
                typeof spotCond.updatedAt === 'string' ? spotCond.updatedAt : undefined,
            };
          }
        }

        if (cancelled || spot.slug !== loadSlug) return;

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
        if (cancelled) return;
        console.error(e);
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    void loadData();

    return () => {
      cancelled = true;
    };
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

  const magicWindowsHourly = useMemo(() => {
    const HOUR_MS = 3_600_000;
    const now = Date.now();
    const cutoff = now + 24 * HOUR_MS;
    return (spotData?.forecast ?? [])
      .map((f) => ({
        time: f.time,
        waveHeight: f.waveHeight ?? 0,
        wavePeriod: f.wavePeriod ?? 0,
        windSpeed: f.windSpeed ?? 0,
        windDirection: f.windDirection ?? 0,
        windGust: f.windGust ?? 0,
        waterTemp: f.waterTemp ?? 0,
      }))
      .filter((h) => {
        const t = new Date(h.time).getTime();
        return t >= now && t < cutoff;
      });
  }, [spotData?.forecast]);

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

  return (
    <>
      <SeoHead
        title={`${isPt ? spot.name : spot.nameEn} - ${spot.region}${isPt ? ', ' : ', '}${spot.regionEn}`}
        description={isPt ? spot.description : spot.descriptionEn}
        image="/og-image.png"
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
          heroRef={heroRef}
        />

        <SpotStickyBar
          score={score}
          sportLabel={SPORT_LABELS[selectedSport][isPt ? 'pt' : 'en']}
          conditions={conditions}
          heroRef={heroRef}
          locale={locale}
        />

        <section className="sticky top-16 z-20 bg-bg-base border-b border-divider supports-[backdrop-filter]:md:bg-bg-base/95 supports-[backdrop-filter]:md:backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <p className="text-meta-sm text-fg-muted mb-2 md:hidden">{td.sportTabsHint}</p>
            <div
              className="flex items-center gap-2 -mx-4 px-4 overflow-x-auto overscroll-x-contain no-scrollbar pb-1 edge-fade-x scroll-smooth"
              role="tablist"
              aria-label={isPt ? 'Modalidade' : 'Sport'}
            >
              {(['surf', 'kitesurf', 'windsurf', 'foil', 'bodyboard', 'sup', 'wakeboard'] as SportType[])
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

        {/* Best windows promoted — directly under the score, side by side with
            the "Agora" panel when there is room. This is the answer the
            practitioner is looking for. */}
        {(showMagicWindows || true) && (
          <section
            className="max-w-6xl mx-auto px-4 pt-3"
            aria-label={isPt ? 'Melhores janelas' : 'Best windows'}
          >
            <header className="flex items-baseline justify-between mb-2">
              <h2 className="font-display text-h2 text-fg font-semibold tracking-tight">
                {td.bestWindows}
              </h2>
              <span className="text-meta-sm text-fg-muted font-mono tabular-nums">
                {isPt ? 'Próximas 24h' : 'Next 24h'}
              </span>
            </header>
            <MagicWindows
              hourly={magicWindowsHourly}
              spotType={selectedSport}
              spotBestWind={spot.bestWind || ''}
              locale={locale}
            />
          </section>
        )}

        <section className="max-w-6xl mx-auto px-4 py-3">
          <SpotConditionsDashboard
            spot={spot}
            locale={locale}
            conditions={conditions}
            tideSchedule={tideSchedule}
            selectedSport={selectedSport}
            score={score}
            copy={{
              title: td.now,
              subtitle: td.nowSubtitle,
              wavesLabel: td.wavesLabel,
              wavesHint: td.wavesHint,
              periodLabel: td.periodLabel,
              periodHint: td.periodHint,
              windLabel: td.windLabel,
              windHint: td.windHint,
              gustLabel: td.gustLabel,
              gustHint: td.gustHint,
              waterLabel: td.waterLabel,
              waterHint: td.waterHint,
              seaStateTitle: td.seaStateTitle,
              seaStateHint: td.seaStateHint,
              windContextTitle: td.windContextTitle,
              windRelationHints: {
                offshore: td.windOffshoreHint,
                onshore: td.windOnshoreHint,
                cross: td.windCrossHint,
              },
              radarFootnote: isPt
                ? 'Azul = ondulação · âmbar = vento. Terra/mar no radar são só referência de costa.'
                : 'Blue = swell · amber = wind. Land/sea shading on the radar is coast reference only.',
              verificationTitle: td.verificationTitle,
              scoreFeedbackHint: td.scoreFeedbackHint,
            }}
          />
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

        <section className="max-w-6xl mx-auto px-4 py-4 space-y-4">
          <h2 className="text-h2 text-fg">{td.logistics}</h2>
          <SpotLogisticsPanel
            spot={spot}
            locale={locale}
            locationTitle={td.location}
            aboutTitle={td.aboutSpot}
            directionsHref={directionsUrl}
            googleMapsLinkLabel={td.openGoogleMaps}
            openMapsLabel={td.openMapsLabel}
            regionLabel={isPt ? 'Região' : 'Region'}
            difficultyLabel={isPt ? 'Nível' : 'Level'}
          />
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
          <FeedbackForm locale={locale} defaultSpotSlug={spot.slug} />
        </section>
      </div>
    </>
  );
}
