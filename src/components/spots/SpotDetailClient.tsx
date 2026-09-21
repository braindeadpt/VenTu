'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

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
import type { ForecastHour } from '@/components/weather/ForecastTable';

import { computeMagicWindows } from '@/lib/magicWindows';
import { findCurrentHourIndex } from '@/lib/openMeteoTime';
import { buildSpotVerdict } from '@/lib/spotVerdict';
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
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import SpotTimelineProvider from '@/components/spots/timeline/SpotTimelineProvider';
import SpotVerdictSection from '@/components/spots/page/SpotVerdictSection';
import SpotInstrumentsSection from '@/components/spots/page/SpotInstrumentsSection';
import SpotForecastSection from '@/components/spots/page/SpotForecastSection';
import SpotContextSection from '@/components/spots/page/SpotContextSection';
import type { ObservedConditions } from '@/lib/observations';
import type { ObservedWave, ObservedWaveMeta } from '@/lib/observedWave';
import type { VentuEvent } from '@/types/events';
import { trackSpotView } from '@/components/homepage/SignupNudge';
import { useAuth } from '@/contexts/AuthProvider';
import { getSpotLivecam } from '@/lib/spotLivecams';

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
  bakedAtMs,
}: {
  spot: Spot;
  locale: string;
  events?: VentuEvent[];
  /** Baked at build (static export) — skips the client fetch, kills the hydration layout shift. */
  initialData?: SpotData;
  /**
   * Build-time clock captured by the server page (SSG). Freshness gates are
   * evaluated against it until mount so the first client paint reproduces the
   * baked verdict exactly (React #418 guard); after mount the live clock takes
   * over. Undefined when the page is rendered without a bake (e2e fetch path).
   */
  bakedAtMs?: number;
}) {
  // ?sport= deep links are read after hydration: useSearchParams() would make
  // Next's static export bail the whole page to client-side rendering (empty
  // <main> in the baked HTML → the content mounts after load → CLS 0.4+).
  const [sportFromUrl, setSportFromUrl] = useState<SportType | null>(null);

  // `ventu_live=1` (set by the hermetic e2e helpers whenever they intercept
  // /data/* files) forces the client-fetch path. When it is set the page must
  // NOT seed from the baked snapshot: two value-bearing sources (baked
  // initialData + the live fetch) racing each other during the swap produced
  // torn renders — the score badge from one snapshot, the stat value from the
  // other. Seeding null makes the client render ONE source (the fetched one),
  // so a mixed frame is structurally impossible. In production nobody sets the
  // cookie, so the bake (and its CLS win) stays the default.
  const [forceLive] = useState(() =>
    typeof document !== 'undefined' &&
    document.cookie.split(';').some((c) => c.trim() === 'ventu_live=1'),
  );
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

  const [spotData, setSpotData] = useState<SpotData | null>(
    forceLive ? null : (initialData ?? null),
  );
  const initialSport = sportFromUrl || (spot.compatibleSports?.[0] as SportType) || 'surf';
  // Same selection policy the fetch path applies after loadData: prefer the URL
  // sport when it scores, else the highest-scoring sport.
  const [selectedSport, setSelectedSport] = useState<SportType>(() => {
    if (sportFromUrl && !forceLive && initialData?.allScores[sportFromUrl]?.score) {
      return sportFromUrl;
    }
    if (!forceLive && initialData) {
      const best = (
        Object.entries(initialData.allScores) as [SportType, { score: number }][]
      ).sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
      if (best) return best;
    }
    return initialSport;
  });
  const [loading, setLoading] = useState(forceLive ? true : !initialData);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Baked pages render the freshness verdicts (buoy + wind observed blocks)
  // with the BUILD clock. The first client paint must reproduce the bake
  // exactly, or a reading crossing the 3h/6h gate between bake and
  // hydration flips the subtree after hydration -> React #418. Until
  // mount we evaluate freshness against the baked reference; after mount
  // the live clock takes over (same mounted+useEffect pattern as
  // AccountClient/PassaporteClient).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const freshnessNowMs = mounted ? undefined : bakedAtMs;
  const [isMobile, setIsMobile] = useState(false);
  const [communityOverlay, setCommunityOverlay] = useState<
    Record<string, import('@/lib/communityTips').CommunityTipEntry>
  >({});

  const { session } = useAuth();

  const tideSchedule = useMemo(() => {
    if (!spotData?.forecast?.length) return null;
    return buildTideSchedule(spotData.forecast, {
      locale: isPt ? 'pt' : 'en',
      phaseOverride: phaseFromConditionsStatus(spotData.conditions.tideStatus),
      // Same baked-clock pin as the freshness gates (React #418 guard): the
      // next high/low tide times and the phase label are relative to `now`.
      // Until mount we evaluate against the baked reference so the first paint
      // reproduces the build exactly; after mount the live clock takes over.
      now: freshnessNowMs != null ? new Date(freshnessNowMs) : undefined,
    });
  }, [spotData, isPt, freshnessNowMs]);

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
  // paint — the CLS the bake fixes). `forceLive` (the `ventu_live=1` cookie set
  // by hermetic e2e when they craft /data/* files) forces the client-fetch path
  // anyway — the same production code used when no bake exists — so tests can
  // control the served data. With the cookie set, spotData is seeded null
  // above, so the fetch is the page's ONLY data source (no baked snapshot to
  // tear against). In production nobody sets the cookie, so the bake stays the
  // default.
  useEffect(() => {
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
            } else if (!initialData || forceLive) {
              // Sem baked data a selecção inicial veio do placeholder — aplica
              // o melhor score fresco. COM baked data o swap pós-fetch muda o
              // separador inteiro (scores/tabela/herói) = CLS ~0.6 no CI;
              // mantém-se a escolha do bake — os dados actualizam-se dentro
              // do separador, sem salto.
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
        } else if (!initialData || forceLive) {
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
  }, [spot, sportFromUrl, retryCount, initialData, forceLive]);

  // Baked pages don't run loadData; keep the freshness heuristic fed.
  useEffect(() => {
    if (initialData?.conditions.updatedAt) {
      rememberDataUpdate(initialData.conditions.updatedAt);
    }
  }, [initialData]);

  const hourlyScores = useMemo(() => {
    if (!spotData || !spotData.forecast.length) return [];
    const scores = getHourlyScores(spot, selectedSport, spotData.forecast, spotData.conditions);
    // A hora corrente usa os dados actuais (correcções observadas já
    // aplicadas no allScores) — a mesma fonte do badge do herói. O modelo
    // só pontua as horas futuras: previsão manda no futuro, dados actuais
    // mandam no agora, e badge/tabela/strip/veredicto contam o mesmo número.
    const nowScore = spotData.allScores[selectedSport]?.score;
    if (typeof nowScore === 'number') {
      const nowIdx = findCurrentHourIndex(
        spotData.forecast.map((f) => f.time),
        new Date(freshnessNowMs ?? Date.now()),
      );
      if (nowIdx >= 0) scores[nowIdx] = nowScore;
    }
    return scores;
  }, [spot, selectedSport, spotData, freshnessNowMs]);

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

  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);
  const windguruUrl = getWindguruUrl(
    spot.slug,
    isPt ? spot.name : spot.nameEn,
    spot.lat,
    spot.lon,
  );

  const magicWindowsHourly = useMemo(() => {
    const HOUR_MS = 3_600_000;
    // Same baked-clock pin as the freshness gates: the next-24h window list
    // must be identical on first paint (React #418 guard) — after mount the
    // live clock re-filters it.
    const now = freshnessNowMs ?? Date.now();
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
        tideHeight: f.tideHeight,
      }))
      .filter((h) => {
        const t = new Date(h.time).getTime();
        return t >= now && t < cutoff;
      });
  }, [spotData?.forecast, freshnessNowMs]);

  // Scores canónicos por hora, alinhados com magicWindowsHourly (mesma
  // janela 24h). Alimentam a detecção das janelas e a faixa — um só scorer.
  const magicWindowsScores = useMemo(() => {
    if (!spotData || !hourlyScores.length) return undefined;
    const byTime = new Map(
      spotData.forecast.map((f, i) => [f.time, hourlyScores[i] ?? 0] as const),
    );
    return magicWindowsHourly.map((h) => byTime.get(h.time) ?? 0);
  }, [spotData, hourlyScores, magicWindowsHourly]);

  const magicWindows = useMemo(
    () => computeMagicWindows(magicWindowsHourly, selectedSport, spot.bestWind || '', magicWindowsScores),
    [magicWindowsHourly, selectedSport, spot.bestWind, magicWindowsScores],
  );

  // Eixo de tempo partilhado (docs/design/SPOT-PAGE.md): as mesmas horas e
  // scores canónicos que alimentam a ForecastTable — o veredicto, a régua e
  // a tabela leem sempre o mesmo índice.
  const timelineHours = useMemo(
    () => spotData?.forecast.map((f) => f.time) ?? [],
    [spotData],
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

  const { conditions, allScores } = spotData;
  const relevantSports = getRelevantSports(spot, allScores);
  // A mesma lista de tabs para a linha standalone e para a barra sticky — a
  // ordem canónica (surf → wakeboard) filtrada pelos desportos relevantes.
  const tabSports = (
    ['surf', 'kitesurf', 'windsurf', 'foil', 'bodyboard', 'sup', 'wakeboard'] as SportType[]
  ).filter((s) => relevantSports.includes(s));

  const score = allScores[selectedSport] ?? allScores[relevantSports[0] ?? 'surf'];

  // Veredicto editorial — «devo ir?» numa linha, derivado dos mesmos dados
  // (janelas + condições + maré). Computação barata (24 iterações) — sem
  // useMemo porque só corre depois de spotData estar carregado.
  const verdict = buildSpotVerdict({
    scoreNow: score.score,
    conditions,
    hourly: magicWindowsHourly,
    windows: magicWindows,
    tide: tideSchedule,
    coastOrientation: spot.coastOrientation,
    isPt,
    nowMs: freshnessNowMs ?? Date.now(),
  });
  const scoreWindSource = resolveScoreWindSource(
    {
    waveHeight: conditions.waveHeight,
    wavePeriod: conditions.wavePeriod,
    waveDirection: conditions.waveDirection,
    windSpeed: conditions.windSpeed,
    windDirection: conditions.windDirection,
    windGust: conditions.windGust,
    waterTemp: conditions.waterTemp,
    observed: conditions.observed,
    },
    freshnessNowMs,
  );
  const scoreWindCorrection: ScoreWindCorrection | null =
    resolveScoreWindCorrection({ ...conditions, windBias: conditions.windBias });
  const scoreWaveSource = resolveScoreWaveSource(
    {
      ...conditions,
      observedWave: conditions.observedWave,
      waveBias: conditions.waveBias,
    },
    freshnessNowMs,
  );
  const scoreWaveCorrection = resolveScoreWaveCorrection(
    {
      ...conditions,
      observedWave: conditions.observedWave,
      waveBias: conditions.waveBias,
    },
    freshnessNowMs,
  );
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
        {/* Eixo de tempo partilhado — uma hora escolhida comanda o veredicto,
            a régua e a previsão (docs/design/SPOT-PAGE.md). */}
        <SpotTimelineProvider
          hours={timelineHours}
          scores={hourlyScores}
          nowScore={score.score}
          mounted={mounted}
          nowMs={freshnessNowMs}
        >
          {/* §0–3 — Veredicto + barra fixa + «Quando ir» (dona: S2A). */}
          <SpotVerdictSection
            spot={spot}
            locale={locale}
            backLabel={t.spots.backToSpots}
            directionsLabel={td.getDirections}
            livecamLabel={getSpotLivecam(spot.slug) ? td.livecam : undefined}
            selectedSport={selectedSport}
            score={score}
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
            tabSports={tabSports}
            allScores={allScores}
            sportLabel={SPORT_LABELS[selectedSport][isPt ? 'pt' : 'en']}
            onSelectSport={setSelectedSport}
            sportTabsAria={tv.sportTabsAria}
            whenToGoTitle={td.whenToGo}
            rangeLabel={tv.next24h}
            verdict={verdict ?? null}
            hourly={magicWindowsHourly}
            hourlyScores={magicWindowsScores}
            windows={magicWindows}
            freshnessNowMs={freshnessNowMs}
          />

          {/* Coluna única — ordem do contrato: Instrumentos → Previsão →
              Contexto (grelha 1→3 interna). */}
          <div className="max-w-6xl mx-auto px-4 pt-4 space-y-4">
            <SpotInstrumentsSection
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
                gustLabel: td.gustLabel,
                gustHint: td.gustHint,
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
              freshnessNowMs={freshnessNowMs}
              ariaLabel={t.spotPageInstruments.sectionTitle}
            />

            <SpotForecastSection
              locale={locale}
              isPt={isPt}
              isMobile={isMobile}
              hours={forecastTableData}
              coastOrientation={spot.coastOrientation}
              sport={selectedSport}
              windguruUrl={windguruUrl}
              waveSource={scoreWaveSource}
              waveCorrection={scoreWaveCorrection}
              nowMs={freshnessNowMs}
              copy={{
                title: tv.hourlyForecast,
                windguruLink: td.windguruLink,
                forecastHint: td.forecastHint,
                expandForecast: td.expandForecast,
                collapseForecast: td.collapseForecast,
                noForecast: td.noForecast,
              }}
            />

            <SpotContextSection
              spot={spot}
              locale={locale}
              isMobile={isMobile}
              events={events}
              mergedLocalTips={mergedLocalTips}
              directionsUrl={directionsUrl}
              copy={{
                warningsRadar: td.warningsRadar,
                livecam: td.livecam,
                beachStation: td.beachStation,
                logistics: td.logistics,
                location: td.location,
                aboutSpot: td.aboutSpot,
                openGoogleMaps: td.openGoogleMaps,
                openMapsLabel: td.openMapsLabel,
                region: t.spots.region,
                level: t.spots.level,
              }}
            />
          </div>
        </SpotTimelineProvider>
      </div>
    </>
  );
}
