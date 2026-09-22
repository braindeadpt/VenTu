'use client';

import Link from 'next/link';
import { ArrowLeft, MapPin, Navigation, Video } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { SpotVerdictConditions } from '@/components/spots/page/SpotVerdictSection';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import { formatHourLong } from '@/lib/verdict/formatHourLabel';
import { getTranslation } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useCountUp } from '@/components/spots/verdict/useCountUp';
import SpotLevelToday from '@/components/spots/SpotLevelToday';
import FavoriteButton from '@/components/FavoriteButton';
import SpotAlertPopover from '@/components/spots/SpotAlertPopover';
import SpotMoreMenu from '@/components/spots/verdict/SpotMoreMenu';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import ConfidenceBadge from '@/components/ui/ConfidenceBadge';
import ScoreWaveSourceBadge from '@/components/ui/ScoreWaveSourceBadge';
import ScoreWindSourceBadge from '@/components/ui/ScoreWindSourceBadge';
import type {
  ScoreWaveCorrection,
  ScoreWaveSource,
  ScoreWindCorrection,
  ScoreWindSource,
} from '@/lib/scoreConditions';

interface SpotVerdictHeroProps {
  spot: Spot;
  locale: string;
  backLabel: string;
  directionsLabel: string;
  livecamLabel?: string;
  selectedSport: SportType;
  /** Score «agora» com correcções — fallback antes de montar (o eixo ainda está em 0). */
  score: SportScore;
  conditions: SpotVerdictConditions;
  /** Todos os scores — o formatador canónico do «porquê» (spotScoreFactors,
   *  o mesmo do popup do mapa) resolve o desporto explicado daqui. */
  allScores: Record<SportType, SportScore>;
  /** Fonte da onda/vento do score «agora» (correcção por boia/estação). */
  scoreWaveSource?: ScoreWaveSource;
  scoreWaveCorrection?: ScoreWaveCorrection | null;
  scoreWindSource?: ScoreWindSource;
  scoreWindCorrection?: ScoreWindCorrection | null;
  freshnessNowMs?: number;
}

/** '38.73° N' — coordenada com 2 casas e rótulo cardinal localizado. */
function formatCoord(
  v: number,
  pos: string,
  neg: string,
  nf: Intl.NumberFormat,
): string {
  return `${nf.format(Math.abs(v))}° ${v >= 0 ? pos : neg}`;
}

/**
 * §1 do contrato — «posso ir?». Sem foto no topo: meta (região ·
 * coordenadas), nome em Space Grotesk, hora escolhida + rótulo
 * Agora/Previsão, score grande em Geist Mono na cor --verdict, banda,
 * frase de porquê (factores do scorer), nível hoje, linha de fonte e
 * confiança que liga a #como-sabemos, e as acções Favorito · Alerta ·
 * Direcções + menu «Mais» (Partilhar, Check-in).
 */
export default function SpotVerdictHero({
  spot,
  locale,
  backLabel,
  directionsLabel,
  livecamLabel,
  selectedSport,
  score,
  conditions,
  allScores,
  scoreWaveSource = 'forecast',
  scoreWaveCorrection = null,
  scoreWindSource = 'forecast',
  scoreWindCorrection = null,
  freshnessNowMs,
}: SpotVerdictHeroProps) {
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotPageVerdict;
  const { nowIndex } = useSpotTimelineData();
  const { selectedScore, selectedHour, isNow } = useSpotTimelineIndex();
  const reducedMotion = usePrefersReducedMotion();

  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);

  // Score da hora escolhida (agora = corrigido; futuro = canónico).
  const target = selectedScore ?? score.score;
  const displayScore = useCountUp(target, reducedMotion);
  const band = scoreBand(target);
  const bandLabel = (isPt ? band.labelPt : band.labelEn).toUpperCase();

  const nf = new Intl.NumberFormat(isPt ? 'pt-PT' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const coords = `${formatCoord(spot.lat, tv.coordNorth, tv.coordSouth, nf)} · ${formatCoord(
    spot.lon,
    tv.coordEast,
    tv.coordWest,
    nf,
  )}`;

  // Os factores descrevem as condições actuais — escondidos quando a hora
  // escolhida é previsão (mostrar factores de «agora» sobre uma hora futura
  // induzia em erro). Antes de montar (nowIndex<0) a hora mostrada é a do
  // bake = «agora», por isso a linha fica. Uma só gramática de factores:
  // o formatador canónico do mapa (getSpotScoreFactors), não uma linha
  // própria — mapa e página dizem o mesmo «porquê».
  const why =
    isNow || nowIndex < 0
      ? getSpotScoreFactors({
          spot,
          conditions,
          allScores,
          sport: selectedSport,
          locale,
        })
          .map((s) => s.label)
          .join(' · ') || null
      : null;

  // Correcções observadas (boia/estação) só se aplicam ao «agora»: noutras
  // horas o score é previsão pura e a linha de fonte diz isso. Antes de
  // montar (nowIndex<0) a hora mostrada é a do bake = «agora».
  const showObservedSources = isNow || nowIndex < 0;

  return (
    // `spot-hero-card` é marcador sem estilo fora de `.spot-hero-ink` — os
    // specs legados escopam as asserções do hero por esta classe.
    <header
      id="agora"
      data-spot-slug={spot.slug}
      className="spot-hero-card scroll-mt-32 border-b border-divider"
    >
      <div className="max-w-6xl mx-auto px-4 pt-2 pb-5">
        {/* Preserva a modalidade: /spots/ lê ?sport= — o voltar não a perde. */}
        <Link
          href={`/${locale}/spots/?sport=${selectedSport}`}
          className="inline-flex items-center gap-1.5 min-h-[44px] -mt-1 text-meta-sm text-fg-muted hover:text-fg transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {backLabel}
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta-sm text-fg-muted">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>{region}</span>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums">{coords}</span>
            </p>
            <h1 className="font-display text-display-lg text-fg tracking-tight leading-tight">
              {title}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta-sm text-fg-muted">
              <span className="font-mono tabular-nums text-fg">
                {selectedHour ? formatHourLong(selectedHour, locale) : '--:--'}
              </span>
              {nowIndex >= 0 && (
                <span
                  className={cn(
                    'rounded-pill border px-2 py-0.5 text-meta-sm font-medium',
                    isNow
                      ? 'border-divider-strong text-fg'
                      : 'border-divider text-fg-muted',
                  )}
                >
                  {isNow ? tv.nowLabel : tv.forecastLabel}
                </span>
              )}
            </p>
            <SpotLevelToday difficulty={spot.difficulty} score={target} locale={locale} />
          </div>

          <div className="flex flex-col gap-1 shrink-0 lg:items-end lg:text-right">
            <div className="flex items-baseline gap-1.5">
              <span
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={target}
                aria-valuetext={`${target} / 100 — ${bandLabel}`}
                aria-label={tv.sectionTitle}
                className="font-mono font-medium tabular-nums leading-[0.84] tracking-[-0.05em] text-[clamp(64px,10vw,104px)]"
                style={{ color: 'var(--verdict)' }}
                data-visual-dynamic
              >
                {displayScore}
              </span>
              <span className="font-mono text-num-lg text-fg-subtle">/100</span>
            </div>
            <span
              className="font-display text-lg font-semibold uppercase tracking-wide leading-none"
              style={{ color: 'var(--verdict)' }}
              data-visual-dynamic
            >
              {bandLabel}
            </span>
            {why && (
              <p className="text-meta-sm text-fg-muted leading-snug max-w-[42ch] lg:ml-auto">
                {why}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
          <SpotAlertPopover spotId={spot.id} sport={selectedSport} locale={locale} />
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center justify-center gap-2 font-medium',
              'px-4 py-2 text-sm rounded-input min-h-[44px]',
              'bg-accent hover:bg-accent-hover active:bg-accent-active border border-transparent',
              'transition-opacity duration-150 shadow-card',
            )}
          >
            <Navigation className="w-4 h-4" aria-hidden />
            {directionsLabel}
          </a>
          {livecamLabel && (
            <a
              href="#spot-livecam"
              className={cn(
                'inline-flex items-center justify-center gap-2 font-medium',
                'px-4 py-2 text-sm rounded-input min-h-[44px]',
                'border border-divider-strong text-fg-muted',
                'hover:text-fg hover:border-fg-subtle transition-colors duration-150',
              )}
            >
              <Video className="w-4 h-4" aria-hidden />
              {livecamLabel}
            </a>
          )}
          <SpotMoreMenu
            label={tv.moreLabel}
            menuLabel={tv.moreMenuLabel}
            shareLabel={tv.shareLabel}
            shareTitle={`${title} — ${region}`}
            spotId={spot.id}
            spotName={spot.name}
            locale={locale}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta-sm text-fg-muted">
          <ScoreWaveSourceBadge
            source={showObservedSources ? scoreWaveSource : 'forecast'}
            correction={showObservedSources ? scoreWaveCorrection : null}
            locale={locale}
          />
          <ScoreWindSourceBadge
            source={showObservedSources ? scoreWindSource : 'forecast'}
            correction={showObservedSources ? scoreWindCorrection : null}
            locale={locale}
          />
          <DataSourceBadge
            source={conditions.source}
            updatedAt={conditions.updatedAt}
            locale={locale}
            size="sm"
            nowMs={freshnessNowMs}
          />
          <ConfidenceBadge
            confidence={conditions.confidence}
            detail={conditions.confidenceDetail}
            locale={locale}
            size="sm"
          />
          <a
            href="#como-sabemos"
            className="inline-flex items-center min-h-[44px] -my-2 text-fg-muted hover:text-fg underline underline-offset-2 decoration-divider-strong transition-colors duration-150"
          >
            {tv.howWeKnow} →
          </a>
        </div>
      </div>
    </header>
  );
}
