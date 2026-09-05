'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
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
import { buildTideSchedule, phaseFromConditionsStatus, type TideHourPoint } from '@/lib/tideSchedule';
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
import { useSpotHeroScrolledPast } from '@/hooks/useSpotHeroScrolledPast';
import { getLocalTips } from '@/lib/spotTips';
import { loadCommunityTips, mergeLocalTips } from '@/lib/communityTips';
import { rememberDataUpdate } from '@/lib/dataCache';
import { loadConditionsJson, loadForecastForSpot } from '@/lib/spotDataCache';
import {
  rawToScoreInput,
  applyRegionalBiasFallback,
  resolveScoreWaveCorrection,
  resolveScoreWaveSource,
} from '@/lib/scoreConditions';
import { loadWaveBiasRegions } from '@/lib/waveBias';
import {
  resolveScoreWindCorrection,
  resolveScoreWindSource,
} from '@/lib/scoreConditions';
import type { ScoreWindCorrection } from '@/lib/scoreConditions';
import { LocalTipsSection } from '@/components/spots/LocalTipsSection';
import FeedbackForm from '@/components/FeedbackForm';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import SpotConditionsDashboard from '@/components/spots/SpotConditionsDashboard';
import SpotWarningsSection from '@/components/spots/SpotWarningsSection';
import SpotStickyBar from '@/components/spots/SpotStickyBar';
import SpotLogisticsPanel from '@/components/spots/SpotLogisticsPanel';
import SpotNearbyDirectory from '@/components/directory/SpotNearbyDirectory';
import SpotUpcomingEvents from '@/components/events/SpotUpcomingEvents';
import type { ObservedConditions } from '@/lib/observations';
import type { ObservedWave, ObservedWaveMeta } from '@/lib/observedWave';
import type { VentuEvent } from '@/types/events';
import { trackSpotView } from '@/components/homepage/SignupNudge';
import { useAuth } from '@/contexts/AuthProvider';

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
  observedWave?: ObservedWave;
  /** Runner-up source (WMO when IH won, IH when WMO won). */
  observedWaveAlt?: ObservedWave;
  /** Why the winner was chosen (freshness/distance). */
  observedWaveMeta?: ObservedWaveMeta;
  /** Recusa cross-border: leitura ES descartada hoje por par ES×PT incoherent. */
  observedWaveCoherenceRefused?: { esCode: string; day?: string | null };
  /** Confiança baixa da leitura IH: par ES×PT incoherent há N+ dias consecutivos. */
  observedWaveCoherenceWarning?: {
    esCode: string;
    ptRefCode?: string;
    days: number;
    firstDay?: string | null;
    lastDay?: string | null;
  };
  /** Regional bias meta — baked by the pipeline (VENTU_WAVE_BIAS_CORRECTION=1)
   *  ou aplicado em runtime pelo fallback client-side (`fallback: true`). */
  waveBias?: { region: string; me: number; n: number; deltaM: number; fallback?: boolean };
  /** Station wind bias baked by the merge (wind-bias.json) — badge tooltip. */
  windBias?: { station?: string; source?: string; me?: number; mae?: number; rmse?: number; n?: number };
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
  events = [],
  initialData,
}: {
  spot: Spot;
  locale: string;
  events?: VentuEvent[];
  /** Baked at build (static export) — skips the client fetch, kills the hydration layout shift. */
  initialData?: SpotData;
}) {
  // ?sport= deep links are read after hydration: useSearchParams() would make
  // Next's static export bail the whole page to client-side rendering (empty
  // <main> in the baked HTML → the content mounts after load → CLS 0.4+).
  const [sportFromUrl, setSportFromUrl] = useState<SportType | null>(null);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('sport');
    if (
      s &&
      ['surf', 'kitesurf', 'windsurf', 'foil', 'bodyboard', 'sup', 'wakeboard'].includes(s)
    ) {
      setSportFromUrl(s as SportType);
    }
  }, []);

  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const td = t.spotDetail;
  const tv = t.spotVerify;

  const [spotData, setSpotData] = useState<SpotData | null>(initialData ?? null);
  const initialSport = sportFromUrl || (spot.compatibleSports?.[0] as SportType) || 'surf';
  // Same selection policy the fetch path applies after loadData: prefer the URL
  // sport when it scores, else the highest-scoring sport.
  const [selectedSport, setSelectedSport] = useState<SportType>(() => {
    if (sportFromUrl && initialData?.allScores[sportFromUrl]?.score) {
      return sportFromUrl;
    }
    if (initialData) {
      const best = (
        Object.entries(initialData.allScores) as [SportType, { score: number }][]
      ).sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
      if (best) return best;
    }
    return initialSport;
  });
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [forecastExpanded, setForecastExpanded] = useState(false);
  const [communityOverlay, setCommunityOverlay] = useState<
    Record<string, import('@/lib/communityTips').CommunityTipEntry>
  >({});

  const heroRef = useRef<HTMLElement>(null);
  // O hero saiu do viewport? Partilhado pela SpotStickyBar (mostra) e pela
  // linha standalone de sport tabs (esconde-se quando a barra toma o lugar),
  // para nunca divergirem. `enabled: !loading` garante que o observer só se
  // liga quando o hero está montado (durante o loading o ref ainda é null).
  // Chamado antes de qualquer early-return (regras dos hooks).
  const stickyActive = useSpotHeroScrolledPast(heroRef, { enabled: !loading });
  const { session } = useAuth();

  const tideSchedule = useMemo(() => {
    if (!spotData?.forecast?.length) return null;
    return buildTideSchedule(spotData.forecast, {
      locale: isPt ? 'pt' : 'en',
      phaseOverride: phaseFromConditionsStatus(spotData.conditions.tideStatus),
    });
  }, [spotData, isPt]);

  const tideHourly: TideHourPoint[] = useMemo(() => {
    if (!spotData?.forecast?.length) return [];
    return spotData.forecast.map((h) => ({
      time: h.time,
      tideHeight: h.tideHeight,
    }));
  }, [spotData]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Track anonymous spot views for the signup nudge
  useEffect(() => {
    if (!session?.user) trackSpotView();
  }, [session?.user]);

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

  // Late ?sport= deep link (read after hydration): select it once data is
  // ready and it scores, matching the old pre-hydration behaviour.
  useEffect(() => {
    if (!sportFromUrl || !spotData) return;
    if (spotData.allScores[sportFromUrl]?.score > 0) {
      setSelectedSport(sportFromUrl);
    }
  }, [sportFromUrl, spotData]);

  // Baked pages skip the fetch: static-export data is immutable per build, so a
  // refetch can only re-read the same files (and would re-swap the page after
  // paint — the CLS the bake fixes). The `ventu_live=1` cookie (set by hermetic
  // e2e via interceptConditions when they craft /data/* files) forces the
  // client-fetch path anyway — the same production code used when no bake
  // exists — so tests can control the served data. In production nobody sets
  // the cookie, so the bake stays the default.
  useEffect(() => {
    const forceLive = document.cookie
      .split(';')
      .some((c) => c.trim() === 'ventu_live=1')
    if (initialData && !forceLive) return;
    let cancelled = false;
    const loadSlug = spot.slug;

    async function loadData() {
      try {
        setLoadError(false);
        let conditions: Conditions;
        let forecast: SpotData['forecast'] = [];

        let condJson: Record<string, unknown> | null = null;
        let spotFc: SpotData['forecast'] | null = null;
        let waveBiasFile: import('@/lib/scoreConditions').WaveBiasRegionsFile | null = null;

        try {
          const dataId = getConditionsDataId(spot);
          // wave-bias.json (client fetch, session cache) alimenta o fallback
          // do viés regional quando a boia não está fresca (ver
          // applyRegionalBiasFallback) — nunca bloqueia o carregamento.
          [condJson, spotFc, waveBiasFile] = await Promise.all([
            loadConditionsJson(),
            loadForecastForSpot(dataId).then((d) => d as SpotData['forecast']).catch(() => null),
            loadWaveBiasRegions().catch(() => null),
          ]);
        } catch {
          condJson = null;
        }

        if (cancelled || spot.slug !== loadSlug) return;

        if (condJson && spotFc) {
          const dataId = getConditionsDataId(spot);
          let spotCond = (condJson[dataId] ?? condJson[spot.id]) as Record<string, unknown> | undefined;

          if (spotCond) {
            // Fallback do viés regional: quando a boia não está fresca e a
            // região tem viés histórico no wave-bias.json, aplica a correcção
            // à row (mesma semântica da pipeline) — o badge «Corrigido (viés
            // regional)» e a altura mostrada reflectem o viés aplicado.
            const biasPatch = applyRegionalBiasFallback(spotCond, spot.region, waveBiasFile);
            if (biasPatch) spotCond = { ...spotCond, ...biasPatch };
          }

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
              observedWave: spotCond.observedWave as ObservedWave | undefined,
              observedWaveAlt: spotCond.observedWaveAlt as ObservedWave | undefined,
              observedWaveMeta: spotCond.observedWaveMeta as ObservedWaveMeta | undefined,
              observedWaveCoherenceRefused: spotCond.observedWaveCoherenceRefused as
                | Conditions['observedWaveCoherenceRefused']
                | undefined,
              observedWaveCoherenceWarning: spotCond.observedWaveCoherenceWarning as
                | Conditions['observedWaveCoherenceWarning']
                | undefined,
              waveBias: spotCond.waveBias as Conditions['waveBias'],
              windBias: spotCond.windBias as Conditions['windBias'],
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

            const allScores = getAllSportScores(spot, rawToScoreInput(spotCond));
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
              observed: spotCond.observed as ObservedConditions | undefined,
              observedWave: spotCond.observedWave as ObservedWave | undefined,
              observedWaveAlt: spotCond.observedWaveAlt as ObservedWave | undefined,
              observedWaveMeta: spotCond.observedWaveMeta as ObservedWaveMeta | undefined,
              observedWaveCoherenceRefused: spotCond.observedWaveCoherenceRefused as
                | Conditions['observedWaveCoherenceRefused']
                | undefined,
              observedWaveCoherenceWarning: spotCond.observedWaveCoherenceWarning as
                | Conditions['observedWaveCoherenceWarning']
                | undefined,
              waveBias: spotCond.waveBias as Conditions['waveBias'],
              windBias: spotCond.windBias as Conditions['windBias'],
              source: 'real',
              updatedAt:
                typeof spotCond.updatedAt === 'string' ? spotCond.updatedAt : undefined,
            };
          }
        }

        const allScores = getAllSportScores(
          spot,
          rawToScoreInput({
            waveHeight: conditions.waveHeight,
            wavePeriod: conditions.wavePeriod,
            waveDirection: conditions.waveDirection,
            windSpeed: conditions.windSpeed,
            windDirection: conditions.windDirection,
            windGust: conditions.windGust,
            waterTemp: conditions.waterTemp,
            observed: conditions.observed,
            observedWave: conditions.observedWave,
          }),
        );

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
  }, [spot, sportFromUrl, retryCount, initialData]);

  // Baked pages don't run loadData; keep the freshness heuristic fed.
  useEffect(() => {
    if (initialData?.conditions.updatedAt) {
      rememberDataUpdate(initialData.conditions.updatedAt);
    }
  }, [initialData]);

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
  // A mesma lista de tabs para a linha standalone e para a barra sticky — a
  // ordem canónica (surf → wakeboard) filtrada pelos desportos relevantes.
  const tabSports = (
    ['surf', 'kitesurf', 'windsurf', 'foil', 'bodyboard', 'sup', 'wakeboard'] as SportType[]
  ).filter((s) => relevantSports.includes(s));
  const score = allScores[selectedSport] ?? allScores[relevantSports[0] ?? 'surf'];
  const scoreWindSource = resolveScoreWindSource({
    waveHeight: conditions.waveHeight,
    wavePeriod: conditions.wavePeriod,
    waveDirection: conditions.waveDirection,
    windSpeed: conditions.windSpeed,
    windDirection: conditions.windDirection,
    windGust: conditions.windGust,
    waterTemp: conditions.waterTemp,
    observed: conditions.observed,
  });
  const scoreWindCorrection: ScoreWindCorrection | null =
    resolveScoreWindCorrection({ ...conditions, windBias: conditions.windBias });
  const scoreWaveSource = resolveScoreWaveSource({
    ...conditions,
    observedWave: conditions.observedWave,
    waveBias: conditions.waveBias,
  });
  const scoreWaveCorrection = resolveScoreWaveCorrection({
    ...conditions,
    observedWave: conditions.observedWave,
    waveBias: conditions.waveBias,
  });
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
        title={`${isPt ? spot.name : spot.nameEn} - ${spot.region}, ${spot.regionEn}`}
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
          scoreWindSource={scoreWindSource}
          scoreWindCorrection={scoreWindCorrection}
          windObservedSource={
            conditions.observed?.source === 'ipma' ||
            conditions.observed?.source === 'ecowitt' ||
            conditions.observed?.source === 'metar'
              ? conditions.observed.source
              : undefined
          }
          scoreWaveSource={scoreWaveSource}
          scoreWaveCorrection={scoreWaveCorrection}
          observedWave={conditions.observedWave}
          observedWaveAlt={conditions.observedWaveAlt}
          observedWaveMeta={conditions.observedWaveMeta}
          heroRef={heroRef}
        />

        <SpotStickyBar
          score={score}
          sportLabel={SPORT_LABELS[selectedSport][isPt ? 'pt' : 'en']}
          conditions={conditions}
          active={stickyActive}
          locale={locale}
          spotId={spot.id}
          sports={tabSports}
          allScores={allScores}
          selectedSport={selectedSport}
          onSelectSport={setSelectedSport}
          observedWave={conditions.observedWave}
          observedWaveAlt={conditions.observedWaveAlt}
          observedWaveMeta={conditions.observedWaveMeta}
          scoreWaveCorrection={scoreWaveCorrection}
        />

        <section
          // Cota de pinagem partilhada com a SpotStickyBar (globals.css): a
          // linha standalone e a barra prendem-se na mesma altura do header.
          style={{ top: 'var(--ventu-spot-sticky-top)' }}
          className={`sticky z-20 bg-bg-base border-b border-divider supports-[backdrop-filter]:md:bg-bg-base/95 supports-[backdrop-filter]:md:backdrop-blur-sm ${
            stickyActive ? 'invisible' : ''
          }`}
          aria-hidden={stickyActive}
        >
          <div className="max-w-6xl mx-auto px-4 py-2">
            <div
              className="flex items-center gap-2 -mx-4 px-4 overflow-x-auto overscroll-x-contain no-scrollbar pb-1 edge-fade-x scroll-smooth"
              role="tablist"
              aria-label={tv.sportTabsAria}
              style={{ height: 'var(--ventu-spot-tabs-h)' }}
            >
              {tabSports.map((sport) => (
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
            aria-label={td.bestWindows}
          >
            <header className="flex items-baseline justify-between mb-2">
              <h2 className="font-display text-h2 text-fg font-semibold tracking-tight">
                {td.bestWindows}
              </h2>
              <span className="text-meta-sm text-fg-muted font-mono tabular-nums">
                {tv.next24h}
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
            tideHourly={tideHourly}
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
              radarFootnote: tv.radarFootnote,
              verificationTitle: td.verificationTitle,
              scoreFeedbackHint: td.scoreFeedbackHint,
            }}
          />
        </section>

        <section className="max-w-6xl mx-auto px-4 py-3">
          <SpotWarningsSection spotId={spot.id} locale={locale} />
        </section>

        <section className="max-w-6xl mx-auto px-4 py-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-h2 text-fg">{tv.hourlyForecast}</h2>
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
                  waveSource={scoreWaveSource}
                  waveCorrection={scoreWaveCorrection}
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
                  locale={locale as 'pt' | 'en' | 'es' | 'de' | 'fr'}
                >
                  {forecastExpanded ? td.collapseForecast : td.expandForecast}
                </Button>
              )}
            </>
          ) : (
            <div className="card-1 p-8 text-center text-body text-fg-subtle">{td.noForecast}</div>
          )}
        </section>

        <SpotUpcomingEvents spotId={spot.id} locale={locale} events={events} />

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
            regionLabel={t.spots.region}
            difficultyLabel={t.spots.level}
          />
          <LocalTipsSection spot={spot} tips={mergedLocalTips} locale={locale} />
          <SpotNearbyDirectory
            spotId={spot.id}
            spotLat={spot.lat}
            spotLon={spot.lon}
            locale={locale}
          />
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
