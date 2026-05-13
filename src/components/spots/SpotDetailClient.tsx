'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
// useSearchParams removed — using window.location.search for static export safety
import {
  Wind, Waves, Droplets, Zap, ArrowLeft, Share2,
  MapPin, Star,
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
import {
  getCardinalLabel,
  getWindArrow,
  getWindRelationToCoast,
} from '@/lib/wind';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';

import ScoreGauge from '@/components/ui/ScoreGauge';
import WaveShape from '@/components/ui/WaveShape';
import SwellRadar from '@/components/ui/SwellRadar';
import ForecastTable from '@/components/weather/ForecastTable';
import type { ForecastHour } from '@/components/weather/ForecastTable';

import SpotMap from '@/components/spots/SpotMap';
import FavoriteButton from '@/components/FavoriteButton';
import MagicWindows from '@/components/MagicWindows';

// Lazy-load SpotChat — Supabase client is heavy (~45-60KB), chat is below the fold
const SpotChat = dynamic(() => import('@/components/spots/SpotChat'), { ssr: false });

/* ═══════════════════════════════════════════════════════════════════════
 *  SpotDetailClient — Redesigned showcase of all signature components.
 *
 *  Preserves ALL existing state logic, fetch flow, and integrations.
 *  Changes ONLY presentation (JSX, classes, visual composition).
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
  source?: 'real' | 'mock';
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
  }>;
}

/* ─── Helpers ─── */

/** Score → colour tokens from design system. */
function scoreTokens(score: number) {
  if (score >= 80)
    return {
      text: 'text-score-epic',
      bg: 'bg-score-epic/15',
      border: 'border-score-epic/25',
      ring: 'ring-score-epic/40',
      glow: 'shadow-glow-epic',
    };
  if (score >= 60)
    return {
      text: 'text-score-good',
      bg: 'bg-score-good/15',
      border: 'border-score-good/25',
      ring: 'ring-score-good/40',
      glow: 'shadow-glow-good',
    };
  if (score >= 40)
    return {
      text: 'text-score-fair',
      bg: 'bg-score-fair/15',
      border: 'border-score-fair/25',
      ring: 'ring-score-fair/40',
      glow: 'shadow-glow-fair',
    };
  if (score >= 20)
    return {
      text: 'text-score-poor',
      bg: 'bg-score-poor/15',
      border: 'border-score-poor/25',
      ring: 'ring-score-poor/40',
      glow: 'shadow-glow-poor',
    };
  return {
    text: 'text-score-closed',
    bg: 'bg-score-closed/15',
    border: 'border-score-closed/25',
    ring: 'ring-score-closed/40',
    glow: 'shadow-glow-closed',
  };
}

/* ─── Sub-components ─── */

function SportTab({
  sport,
  score,
  active,
  onClick,
  locale,
}: {
  sport: SportType;
  score: number;
  active: boolean;
  onClick: () => void;
  locale: string;
}) {
  const isPt = locale === 'pt';
  const tokens = scoreTokens(score);
  const label = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];

  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-4 py-2.5 rounded-pill
        font-medium text-sm whitespace-nowrap
        transition-all duration-fast
        ${
          active
            ? `${tokens.bg} ${tokens.text} ${tokens.border} border ring-1 ${tokens.ring} ${tokens.glow}`
            : 'bg-surface-1 text-fg-muted border border-divider hover:bg-surface-2 hover:text-fg'
        }
      `}
      aria-pressed={active}
    >
      <span className="font-medium">{label}</span>
      <span
        className={`font-mono text-num-sm font-semibold ${active ? tokens.text : 'text-fg-subtle'}`}
      >
        {score}
      </span>
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
}) {
  const display = value === undefined || value === null || value === '—' ? '—' : value;

  return (
    <div className="card-1 p-4 flex flex-col items-center text-center gap-2">
      <Icon className="w-[18px] h-[18px] text-fg-subtle" />
      <div className="font-mono text-num-lg text-fg">
        {display}
        {unit && display !== '—' && (
          <span className="text-num-sm text-fg-subtle ml-0.5">{unit}</span>
        )}
      </div>
      <div className="text-meta-sm text-fg-subtle uppercase tracking-wider">{label}</div>
      {sub && <div className="text-meta text-fg-subtle">{sub}</div>}
    </div>
  );
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
  const [copyToast, setCopyToast] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Data loading (preserved exactly) ── */
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch(getAssetPath('/data/conditions.json'), {
          cache: 'no-store',
        });
        if (response.ok) {
          const precomputed = await response.json();
          const cond = precomputed[spot.id];

          if (cond) {
            const conditions: Conditions = {
              waveHeight: cond.waveHeight || 0,
              wavePeriod: cond.wavePeriod || 0,
              waveDirection: cond.waveDirection || 0,
              windSpeed: cond.windSpeed || 0,
              windDirection: cond.windDirection || 0,
              windGust: cond.windGust || 0,
              waterTemp: cond.waterTemp || 0,
            };
            const allScores = getAllSportScores(spot, conditions);

            let forecast: SpotData['forecast'] = [];
            try {
              const marineData = await fetchMarineData(spot.lat, spot.lon);
              forecast = getForecastData(marineData).slice(0, 120);
            } catch {
              /* forecast not critical */
            }

            setSpotData({ spot, conditions, allScores, forecast });

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
      } catch {
        /* fall through */
      }

      /* Fallback: live fetch */
      try {
        const marineData = await fetchMarineData(spot.lat, spot.lon);
        const conditions = getCurrentConditions(marineData);
        const allScores = getAllSportScores(spot, conditions);
        const forecast = getForecastData(marineData).slice(0, 120);

        setSpotData({ spot, conditions, allScores, forecast });

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
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [spot, sportFromUrl]);

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
      score: hourlyScores[i],
    }));
  }, [spotData, hourlyScores]);

  /* ── Share handler ── */
  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopyToast(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopyToast(false), 2000);
    });
  }, []);

  /* ── Loading ── */
  if (loading || !spotData) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
      </div>
    );
  }

  const { conditions, allScores, forecast } = spotData;
  const score = allScores[selectedSport];
  const tokens = scoreTokens(score.score);
  const relevantSports = getRelevantSports(spot, allScores);

  const windKt = conditions.windSpeed * 1.94384;
  const windRelation = spot.coastOrientation
    ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
    : null;
  const swellDir = getCardinalLabel(conditions.waveDirection);
  const windDir = getCardinalLabel(conditions.windDirection);

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      {/* ═══════════════════════════════════════════════════════════════
          HEADER / HERO
          ═══════════════════════════════════════════════════════════════ */}
      <header className="max-w-5xl mx-auto px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-1.5 text-meta text-fg-muted hover:text-fg transition-colors duration-fast"
          >
            <ArrowLeft className="w-4 h-4" />
            {t.spots.backToSpots}
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-display-lg text-fg truncate">
              {isPt ? spot.name : spot.nameEn}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-lg text-fg-muted mt-1">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{spot.region}</span>
              <span>·</span>
              <Star className="w-4 h-4 flex-shrink-0" />
              <span>{spot.difficulty}</span>
            </div>

            {/* Badges row */}
            {(spot.blueFlag || spot.waterQuality || spot.accessibleBeach) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {spot.blueFlag && (
                  <span className="badge-blue-flag text-meta-sm">
                    🏖️ Blue Flag
                  </span>
                )}
                {spot.waterQuality && (
                  <span className="badge-water-quality text-meta-sm">
                    💧 {td.waterQuality}
                  </span>
                )}
                {spot.accessibleBeach && (
                  <span className="badge-accessible text-meta-sm">
                    ♿ {isPt ? 'Acessível' : 'Accessible'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleShare}
              className="p-3 rounded-button bg-surface-1 border border-divider text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors duration-fast relative min-w-[44px] min-h-[44px]"
              aria-label={td.share}
              title={td.share}
            >
              <Share2 className="w-5 h-5" />
              {copyToast && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-meta-sm text-score-good bg-surface-2 px-2 py-1 rounded whitespace-nowrap border border-divider shadow-sm">
                  {td.copyLink}
                </span>
              )}
            </button>
            <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          SPORT TABS
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 edge-fade-x">
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
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          MAIN SHOWCASE — 3 signature widgets
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Widget 1: ScoreGauge */}
          <div className="card-1 p-6 flex flex-col items-center justify-center gap-3">
            <ScoreGauge
              score={score.score}
              label={SPORT_LABELS[selectedSport][isPt ? 'pt' : 'en']}
              sublabel="/100"
              size="lg"
            />
            <p className={`text-body font-medium ${tokens.text}`}>
              {isPt ? score.rating : score.ratingEn}
            </p>
          </div>

          {/* Widget 2: WaveShape */}
          <div className="card-1 p-6 flex flex-col items-center justify-center gap-3">
            <WaveShape
              height={conditions.waveHeight}
              period={conditions.wavePeriod}
              direction={swellDir}
              size="lg"
            />
            <p className="text-meta text-fg-subtle">
              {conditions.waveHeight.toFixed(1)}m @ {Math.round(conditions.wavePeriod)}s {swellDir}
            </p>
          </div>

          {/* Widget 3: SwellRadar */}
          <div className="card-1 p-6 flex flex-col items-center justify-center gap-3">
            <SwellRadar
              swellDirection={conditions.waveDirection}
              swellHeight={conditions.waveHeight}
              windDirection={conditions.windDirection}
              windSpeed={conditions.windSpeed}
              coastOrientation={spot.coastOrientation ?? undefined}
              size="lg"
            />
            <p className="text-meta text-fg-subtle">
              {windRelation
                ? `${isPt ? 'Vento' : 'Wind'} ${windRelation} ${Math.round(windKt)}kt ${windDir}`
                : `${Math.round(windKt)}kt ${windDir}`}
            </p>
          </div>
        </div>

        {/* Summary line */}
        <p className="text-body-lg text-fg-muted text-center mt-4">
          {isPt ? score.rating : score.ratingEn}
          {' · '}
          {conditions.waveHeight.toFixed(1)}m @ {Math.round(conditions.wavePeriod)}s {swellDir}
          {' · '}
          {windRelation && `${isPt ? 'Vento' : 'Wind'} ${windRelation} `}
          {Math.round(windKt)}kt {windDir}
        </p>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          BEST WINDOWS (MagicWindows — ressuscitado)
          ═══════════════════════════════════════════════════════════════ */}
      {forecast.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-6">
          <h2 className="text-h2 text-fg mb-4">{td.bestWindows}</h2>
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

      {/* ═══════════════════════════════════════════════════════════════
          FORECAST TABLE
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        {forecastTableData.length > 0 ? (
          <div className="card-1 p-4">
            <ForecastTable
              hourly={forecastTableData}
              hours={120}
              sport={selectedSport}
              coastOrientation={spot.coastOrientation}
              locale={locale as 'pt' | 'en'}
            />
          </div>
        ) : (
          <div className="card-1 p-8 text-center text-body text-fg-subtle">
            {td.noForecast}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          STATS DETAILHADOS — 4 universais
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={Waves}
            label={t.forecastTable.waves}
            value={conditions.waveHeight.toFixed(1)}
            unit="m"
          />
          <StatCard
            icon={Wind}
            label={t.forecastTable.wind}
            value={Math.round(windKt)}
            unit="kt"
            sub={`${getWindArrow(conditions.windDirection)} ${windDir}`}
          />
          <StatCard
            icon={Droplets}
            label={t.forecastTable.water}
            value={conditions.waterTemp.toFixed(1)}
            unit="°C"
          />
          <StatCard
            icon={Zap}
            label={t.forecastTable.gust}
            value={conditions.windGust > 0 ? Math.round(conditions.windGust * 1.94384) : '—'}
            unit={conditions.windGust > 0 ? 'kt' : undefined}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          CHAT
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-h2 text-fg mb-4">{td.chat}</h2>
        <div className="card-1 p-4">
          <SpotChat
            spotSlug={spot.slug}
            spotName={isPt ? spot.name : spot.nameEn}
            locale={locale}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SOBRE O SPOT
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-h2 text-fg mb-4">{td.about}</h2>
        <div className="card-1 p-6 space-y-4">
          <p className="text-body text-fg-muted leading-relaxed">
            {isPt ? spot.description : spot.descriptionEn}
          </p>

          {/* Local tips */}
          {spot.localTips && (
            <div className="pt-4 border-t border-divider">
              <h3 className="text-h3 text-fg mb-2">{td.localTips}</h3>
              <div className="space-y-2">
                {spot.localTips.bestTide && (
                  <p className="text-body text-fg-muted">
                    <span className="text-fg font-medium">{isPt ? 'Maré' : 'Tide'}: </span>
                    {isPt ? spot.localTips.bestTide : (spot.localTips.bestTideEn || spot.localTips.bestTide)}
                  </p>
                )}
                {spot.localTips.parking && (
                  <p className="text-body text-fg-muted">
                    <span className="text-fg font-medium">{isPt ? 'Estacionamento' : 'Parking'}: </span>
                    {isPt ? spot.localTips.parking : (spot.localTips.parkingEn || spot.localTips.parking)}
                  </p>
                )}
                {spot.localTips.food && (
                  <p className="text-body text-fg-muted">
                    <span className="text-fg font-medium">{isPt ? 'Comida' : 'Food'}: </span>
                    {isPt ? spot.localTips.food : (spot.localTips.foodEn || spot.localTips.food)}
                  </p>
                )}
                {spot.localTips.localRule && (
                  <p className="text-body text-fg-muted">
                    <span className="text-fg font-medium">{isPt ? 'Regras locais' : 'Local rules'}: </span>
                    {isPt ? spot.localTips.localRule : (spot.localTips.localRuleEn || spot.localTips.localRule)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Hazards */}
          {spot.hazards && spot.hazards.length > 0 && (
            <div className="pt-4 border-t border-divider">
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

          {/* Facilities */}
          {spot.facilities && spot.facilities.length > 0 && (
            <div className="pt-4 border-t border-divider">
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

      </section>

      {/* ═══════════════════════════════════════════════════════════════
          MAPA
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-h2 text-fg mb-4">{td.location}</h2>
        <div className="card-1 p-2">
          <div className="h-80 md:h-96 rounded-card overflow-hidden">
            <SpotMap lat={spot.lat} lon={spot.lon} locale={locale} />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TODO (futuro): activar SwellDetective APENAS com dados históricos
 *  reais. O componente está pronto em src/components/SwellDetective.tsx
 *  mas usa mock data para a maioria dos spots. Activar agora seria
 *  induzir utilizadores em erro com "padrões históricos" inventados.
 *  Aguarda pipeline de histórico real (parsing Open-Meteo archived
 *  ou ingestion própria).
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  TEST NOTES
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1. Spot completo (Supertubos):
 *     - Hero com nome, região, dificuldade, badges
 *     - 3+ sport tabs com scores
 *     - Showcase: ScoreGauge lg + WaveShape lg + SwellRadar lg
 *     - ForecastTable com 120h + score row colorido
 *     - Stats: ondas, vento c/ arrow, água, rajada
 *     - Chat funcional
 *
 *  2. Spot sem hourly (interior / falha de API):
 *     - ForecastTable mostra "Previsão indisponível"
 *     - MagicWindows omitido (forecast.length === 0)
 *     - Showcase continua com dados current
 *
 *  3. Spot sem coastOrientation:
 *     - SwellRadar em modo agnóstico (sem semicírculos)
 *     - Resumo textual sem "Vento offshore/onshore"
 *
 *  4. Switch de sport:
 *     - ScoreGauge atualiza (animated count-up)
 *     - Tabs activas mudam cor
 *     - ForecastTable score row recalcula via useMemo
 *     - Resumo textual atualiza
 *
 *  5. Mobile (360px):
 *     - Header: nome truncado, botões shrink
 *     - Showcase: grid 1 coluna
 *     - Stats: grid 2 colunas
 *     - Sport tabs: scroll horizontal com edge-fade
 *     - ForecastTable: overflow-x scroll, sticky first col
 *
 *  6. Reduced motion:
 *     - ScoreGauge count-up respeita prefers-reduced-motion
 *     - Hover transitions desligadas via globals.css
 *
 *  7. Share button:
 *     - Click → clipboard → toast "Link copiado!" por 2s
 *     - Sem toast nativo, usa span absoluto
 *
 *  8. FavoriteButton:
 *     - Continua a togglar, persistente via localStorage
 *     - Não alterado — consumido como está
 *
 *  9. Chat:
 *     - SpotChat dentro de card-1 wrapper
 *     - Funcionalidade inalterada
 *
 *  10. i18n:
 *      - Todas as strings via getTranslation()
 *      - spotDetail chaves: share, copyLink, bestWindows, about,
 *        localTips, facilities, hazards, chat, location, waterQuality,
 *        noForecast
 */
