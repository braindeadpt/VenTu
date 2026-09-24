'use client';

import { useEffect, useRef, useState } from 'react';
import { getTranslation } from '@/lib/i18n';
import { getSportLabel } from '@/lib/homepageSport';
import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { ArrowRight, Clock, Droplets, Waves, Wind, X, Zap } from 'lucide-react';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import type { Spot } from '@/types';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import { getCompatibleSports, SPORT_LABELS } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getScoreTierLabel } from '@/lib/sportScore';
import { getScoreRgb, getScoreTier } from '@/lib/scoreThresholds';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { resolveWavePowerKw, MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel, getWindRelationLabel, getWindRelationToCoast, getWindRelationDotClass } from '@/lib/wind';
import { getDifficultyLabel } from '@/lib/mapDifficulty';
import { getGoogleMapsDirectionsUrl, getSpotDetailHref } from '@/lib/mapSpotDetail';
import { getMapSpotNarrative } from '@/lib/mapSpotNarrative';
import { getSpotScoreFactors, scoreFactorClass } from '@/lib/spotScoreFactors';
import { getMapTideLine } from '@/lib/spotTideRelevance';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
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

  const narrative = getMapSpotNarrative(spot, conditions, allScores, highlightSport, locale);
  const tideLine = getMapTideLine(spot, conditions, locale);
  const scoreFactors = getSpotScoreFactors({ spot, conditions, allScores, sport: highlightSport, locale });
  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
      : undefined;
  const windRelationMeta =
    windRelation != null
      ? getWindRelationLabel(windRelation, locale)
      : undefined;

  return (
    <div className="space-y-4">
      <SpotImage spot={spot} aspect="video" locale={locale} className="rounded-xl w-full" />

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-h3 text-fg font-semibold">
            {localizedSpotName(spot, locale)}
          </h2>
          <ConfidenceBadge
            confidence={conditions.confidence}
            detail={conditions.confidenceDetail}
            locale={locale}
            size="sm"
          />
        </div>
        <p className="text-meta text-fg-muted">
          {localizedSpotRegion(spot, locale)}
          <span aria-hidden> · </span>
          <span className="capitalize">{getDifficultyLabel(spot.difficulty, locale)}</span>
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

      <div className="flex flex-wrap gap-1.5" role="list" aria-label={getTranslation(locale).ranked.scoresBySport}>
        {sortedSports.map((sport) => {
          const score = allScores[sport]?.score ?? 0;
          const label = getSportLabel(sport, locale);
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
              <ScoreBadge score={score} locale={locale} size="sm" />
            </span>
          );
        })}
      </div>

      {scoreFactors.length > 0 && (
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono tabular-nums text-meta-sm text-fg-muted"
          data-score-factors={scoreFactors.map((f) => f.label).join(' · ')}
          data-score-factors-sport={highlightSport}
        >
          {scoreFactors.map((f, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span aria-hidden className="mr-1.5 text-fg-subtle/40">·</span>}
              <span className={scoreFactorClass(f.kind)}>{f.label}</span>
            </span>
          ))}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-meta-sm">
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
            <span>{getTranslation(locale).homepage.layerWaves}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold">
            {swellH.toFixed(1)}m · {Math.round(swellT)}s
          </p>
        </div>
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Wind className="w-3.5 h-3.5 text-data-wind" aria-hidden />
            <span>{getTranslation(locale).homepage.layerWind}</span>
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
            <span>{getTranslation(locale).spotsUi.waterWord}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold">
            {conditions.waterTemp.toFixed(1)}°C
          </p>
        </div>
        <div className="rounded-lg bg-surface-1/[0.04] border border-divider p-2.5">
          <div className="flex items-center gap-1.5 text-fg-muted mb-1">
            <Zap className="w-3.5 h-3.5 text-score-fair" aria-hidden />
            <span>{getTranslation(locale).spotsUi.powerWord}</span>
          </div>
          <p className="font-mono tabular-nums text-fg font-semibold">{powerKw.toFixed(1)} kW/m</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          href={detailHref}
          variant="secondary"
          size="lg"
          className="flex-1"
          locale={locale}
          onClick={onViewSpot}
        >
          {getTranslation(locale).spotsMap.viewSpot}
        </Button>
        <Button
          href={directionsUrl}
          variant="ghost"
          size="lg"
          className="flex-1"
          locale={locale}
          target="_blank"
          rel="noopener noreferrer"
        >
          {getTranslation(locale).spotsUi.getDirections}
        </Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * UX v3 (M4) — pré-visualização do spot da maquete aprovada:
 * cartão de 320 px ancorado ao marcador (desktop) / conteúdo do sheet
 * (mobile). Mesmo conteúdo nas duas superfícies (§7 do MAP-UX-V3).
 * ════════════════════════════════════════════════════════════════════════ */

export interface SpotCardContentProps {
  data: MapSpotPreviewData;
  locale: string;
  /** Modalidade do filtro activo (racional de score e série da sparkline). */
  highlightSport?: GridSportFilter;
  /** Score à hora activa das 48 h — sobrepõe o melhor score live. */
  scoreOverride?: number;
  /** Índice da hora nas 48 h para o marcador «actual» da sparkline. */
  hoursFrame?: number;
  /** Rótulo temporal já localizado («agora» ou a hora escolhida). */
  hourLabel?: string;
  onViewSpot?: () => void;
}

/** Chave da série de score por spot no ficheiro map-hours (48 h). */
function mapHoursSportKey(sport: GridSportFilter): string {
  if (sport === 'all') return 'best';
  if (sport === 'big-wave') return 'surf';
  return sport;
}

/** «qua 17:00» — o times do map-hours são naive em hora de Lisboa. */
function sparkEndLabel(time: string, locale: string): string {
  const day = new Date(`${time.slice(0, 10)}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(day);
  return `${wd} ${time.slice(11, 16)}`;
}

/** Sparkline das 48 h (maquete): área + linha na cor do escalão, linha
 *  tracejada no 60 e ponto na hora escolhida. Dados do map-hours já
 *  carregado pela camada das 48 h (fetchMapHours é memoizado). */
function ScoreSparkline({
  spotId,
  sport,
  locale,
  score,
  hoursFrame,
}: {
  spotId: string;
  sport: GridSportFilter;
  locale: string;
  score: number;
  hoursFrame: number;
}) {
  const [file, setFile] = useState<MapHoursFile | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMapHours().then((f) => {
      if (alive) setFile(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  const series = file?.spots[spotId]?.[mapHoursSportKey(sport)];
  if (!series || series.length < 2) return null;

  const t = getTranslation(locale).mapUiMarkers;
  const w = 288;
  const h = 44;
  const n = series.length;
  const X = (i: number) => (i / (n - 1)) * w;
  const Y = (v: number) => h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 6);
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const cur = Math.max(0, Math.min(n - 1, hoursFrame));
  const color = getScoreRgb(score);
  const lastTime = file?.times?.[n - 1];

  return (
    <div>
      <svg
        className="block w-full h-11 mb-1"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={`${d}L${w} ${h}L0 ${h}Z`}
          fill={color}
          opacity={0.12}
        />
        <line
          x1={0}
          x2={w}
          y1={Y(60)}
          y2={Y(60)}
          stroke="rgb(var(--fg-subtle) / 0.5)"
          strokeDasharray="2 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <circle cx={X(cur)} cy={Y(series[cur])} r={3.5} fill={color} />
      </svg>
      <div
        className="flex justify-between text-[10px] text-fg-subtle font-mono tabular-nums mb-3"
        title={t.sparkThresholdHint}
      >
        <span>{t.sparkNow}</span>
        <span>{t.sparkNext48h}</span>
        <span>{lastTime ? sparkEndLabel(lastTime, locale) : ''}</span>
      </div>
    </div>
  );
}

/**
 * Corpo do cartão de pré-visualização (§7): nome + região, score grande +
 * banda, porquê (getSpotScoreFactors), 3 métricas, sparkline 48 h e CTAs.
 * Partilhado pelo cartão desktop (MapSpotCard) e pelo sheet mobile
 * (MapSpotSheet) — a mesma superfície nas duas formas.
 */
export function SpotCardContent({
  data,
  locale,
  highlightSport = 'all',
  scoreOverride,
  hoursFrame = 0,
  hourLabel,
  onViewSpot,
}: SpotCardContentProps) {
  const { spot, conditions, allScores, warning } = data;
  const t = getTranslation(locale);
  const score = Math.max(0, Math.min(100, Math.round(bestScore(data, highlightSport, scoreOverride))));
  const scoreColor = getScoreRgb(score);
  const tierLabel = getScoreTierLabel(getScoreTier(score), locale);
  const windKt = Math.round(conditions.windSpeed * MS_TO_KNOTS);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = conditions.swellPeriod ?? conditions.wavePeriod;
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);
  const detailHref = getSpotDetailHref(
    locale,
    spot.slug,
    highlightSport !== 'all' && highlightSport !== 'big-wave' ? highlightSport : undefined,
  );
  const scoreFactors = getSpotScoreFactors({
    spot,
    conditions,
    allScores,
    sport: highlightSport,
    locale,
  });
  const sportLabel =
    highlightSport === 'all' ? t.mapUiMarkers.bestModality : getSportLabel(highlightSport, locale);
  // CORRECCOES-24SET (M6#2): o vento conta-se UMA vez — na linha de
  // factores partilhada («… · side-offshore 2 kt», já em minúscula e
  // idêntica à linha da lista — contrato data-score-factors). A frase
  // «porquê» ficava com «vento 8 kt Onshore» a duplicar o factor; agora
  // leva só a onda.
  const whyBits = `${swellH.toFixed(1)} m a ${Math.round(swellT)} s`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-xl text-fg font-semibold leading-tight pr-8">
          {localizedSpotName(spot, locale)}
        </h3>
        <ConfidenceBadge
          confidence={conditions.confidence}
          detail={conditions.confidenceDetail}
          locale={locale}
          size="sm"
        />
      </div>
      <p className="text-meta text-fg-muted mt-0.5">
        {localizedSpotRegion(spot, locale)}
        <span aria-hidden> · </span>
        <span className="capitalize">{getDifficultyLabel(spot.difficulty, locale)}</span>
      </p>

      <div className="flex items-baseline gap-2 mt-3 mb-0.5">
        <span
          className="font-mono tabular-nums font-medium leading-none tracking-tight"
          style={{ fontSize: 44, color: scoreColor }}
          data-card-score={score}
        >
          {score}
        </span>
        <span
          className="font-display font-semibold uppercase"
          style={{ fontSize: 13, letterSpacing: '0.16em', color: scoreColor }}
        >
          {tierLabel}
        </span>
      </div>

      <p className="text-body-sm text-fg">
        {sportLabel} · {hourLabel ?? t.mapUiMarkers.now}
        {whyBits ? ` — ${whyBits}` : ''}
      </p>

      {warning ? (
        <div className="mt-2">
          <WarningPill warning={warning} locale={locale} variant="default" />
        </div>
      ) : null}

      {scoreFactors.length > 0 && (
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono tabular-nums text-meta-sm text-fg-muted mt-1.5"
          data-score-factors={scoreFactors.map((f) => f.label).join(' · ')}
          data-score-factors-sport={highlightSport}
        >
          {scoreFactors.map((f, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && (
                <span aria-hidden className="mr-1.5 text-fg-subtle/40">
                  ·
                </span>
              )}
              <span className={scoreFactorClass(f.kind)}>{f.label}</span>
            </span>
          ))}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 my-3 py-2.5 border-y border-divider text-[11px] text-fg-muted">
        <div>
          {t.mapUiMarkers.metricWave}
          <b className="block font-mono tabular-nums text-[15px] text-fg font-medium mt-0.5">
            {swellH.toFixed(1)} m
          </b>
        </div>
        <div>
          {t.mapUiMarkers.metricPeriod}
          <b className="block font-mono tabular-nums text-[15px] text-fg font-medium mt-0.5">
            {Math.round(swellT)} s
          </b>
        </div>
        <div>
          {t.mapUiMarkers.metricWind}
          <b className="block font-mono tabular-nums text-[15px] text-fg font-medium mt-0.5">
            {windKt} kt
          </b>
        </div>
      </div>

      <ScoreSparkline
        spotId={spot.id}
        sport={highlightSport}
        locale={locale}
        score={score}
        hoursFrame={hoursFrame}
      />

      {/* CTAs numa só linha cada um (CORRECCOES-24SET M6#2) — nowrap
          explícito: «Ver spot →» e «Como chegar» nunca quebram. */}
      <div className="flex gap-2">
        <Button
          href={detailHref}
          variant="primary"
          size="lg"
          className="flex-1 whitespace-nowrap"
          locale={locale}
          onClick={onViewSpot}
        >
          {t.spotsMap.viewSpot}
          <ArrowRight className="w-4 h-4 ml-1" aria-hidden />
        </Button>
        <Button
          href={directionsUrl}
          variant="secondary"
          size="lg"
          className="flex-1 whitespace-nowrap"
          locale={locale}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.spotsUi.getDirections}
        </Button>
      </div>
    </div>
  );
}

function bestScore(
  data: MapSpotPreviewData,
  sport: GridSportFilter,
  scoreOverride?: number,
): number {
  if (typeof scoreOverride === 'number' && Number.isFinite(scoreOverride)) return scoreOverride;
  if (sport === 'all') {
    return Math.max(...Object.values(data.allScores).map((s) => s?.score || 0));
  }
  if (sport === 'big-wave') return data.allScores.surf?.score || 0;
  return data.allScores[sport]?.score || 0;
}

export interface MapSpotCardProps extends SpotCardContentProps {
  onClose: () => void;
}

/**
 * Cartão de pré-visualização desktop (§7): 320 px, ancorado ao marcador —
 * nasce à direita, vira para a esquerda se não couber e nunca sai do mapa
 * (clamp vertical). Entra com opacity + scale .96→1 em 180 ms.
 */
export function MapSpotCard({
  data,
  locale,
  highlightSport,
  scoreOverride,
  hoursFrame,
  hourLabel,
  onClose,
  onViewSpot,
}: MapSpotCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const t = getTranslation(locale);

  // Entrada da maquete: opacity + scale .96→1 em 180 ms (out-expo).
  useEffect(() => {
    setEntered(false);
    if (reducedMotion) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [data.spot.id, reducedMotion]);

  // Âncora: segue o marcador em cada frame (pan/zoom do Leaflet movem o
  // ícone por transform — ler o rect a cada frame acompanha sem custo de
  // re-render). Também repõe o realce «seleccionado» quando o marcador é
  // recriado por um LOD/refresh.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const root = card.closest('[data-map-fullscreen]') as HTMLElement | null;
    if (!root) return;
    let raf = 0;
    const spotSel = `[data-v3spot="${CSS.escape(data.spot.id)}"]`;
    const tick = () => {
      const markerInner = root.querySelector<HTMLElement>(spotSel);
      if (markerInner) {
        const iconEl = markerInner.closest<HTMLElement>('.leaflet-marker-icon');
        if (iconEl) iconEl.style.zIndex = '800';
        const disc = markerInner.querySelector<HTMLElement>('.v3in');
        const dotEl = markerInner.querySelector<HTMLElement>('.v3dot > i');
        if (disc && !disc.dataset.v3sel) {
          disc.dataset.v3sel = '1';
          disc.style.transform = 'scale(1.15)';
          disc.style.boxShadow =
            '0 0 0 3px rgb(var(--bg-base)), 0 0 0 6px rgb(var(--accent))';
        }
        if (dotEl && !dotEl.dataset.v3sel) {
          dotEl.dataset.v3sel = '1';
          dotEl.style.boxShadow =
            '0 0 0 1.5px rgb(var(--bg-base)), 0 0 0 4px rgb(var(--fg))';
        }
        const mr = markerInner.getBoundingClientRect();
        const cr = root.getBoundingClientRect();
        const cw = card.offsetWidth || 320;
        const ch = card.offsetHeight || 380;
        let left = mr.left - cr.left + mr.width / 2 + 30;
        let top = mr.top - cr.top + mr.height / 2 - ch / 2;
        if (left + cw > cr.width - 70) {
          left = mr.left - cr.left + mr.width / 2 - cw - 30;
        }
        // Nunca nascer por baixo do painel de exploração nem fora do mapa.
        const panel = root.querySelector<HTMLElement>('[data-map-panel]');
        const panelRight = panel ? panel.getBoundingClientRect().right - cr.left : 0;
        left = Math.max(panelRight + 8, Math.min(cr.width - cw - 8, left));
        top = Math.max(60, Math.min(cr.height - ch - 12, top));
        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(top)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      const markerInner = root.querySelector<HTMLElement>(spotSel);
      const disc = markerInner?.querySelector<HTMLElement>('.v3in');
      const dotEl = markerInner?.querySelector<HTMLElement>('.v3dot > i');
      if (disc?.dataset.v3sel) {
        delete disc.dataset.v3sel;
        disc.style.transform = '';
        disc.style.boxShadow = '';
      }
      if (dotEl?.dataset.v3sel) {
        delete dotEl.dataset.v3sel;
        dotEl.style.boxShadow = '';
      }
    };
  }, [data.spot.id]);

  return (
    <section
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-live="polite"
      aria-label={t.mapUiMarkers.spotCardAria}
      data-testid="map-spot-card"
      data-spot-id={data.spot.id}
      className="absolute left-0 top-0 z-[1150] w-[320px] rounded-2xl border border-divider bg-bg-elevated p-4 shadow-modal"
      style={{
        opacity: reducedMotion || entered ? 1 : 0,
        transform: reducedMotion ? 'none' : entered ? 'scale(1)' : 'scale(0.96)',
        transformOrigin: '0 50%',
        transition: reducedMotion
          ? 'none'
          : 'opacity .18s cubic-bezier(.16,1,.3,1), transform .18s cubic-bezier(.16,1,.3,1)',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t.homepage.close}
        className="absolute right-2 top-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-input text-fg-muted hover:text-fg hover:bg-surface-1/[0.04] transition-colors duration-150"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
      <SpotCardContent
        data={data}
        locale={locale}
        highlightSport={highlightSport}
        scoreOverride={scoreOverride}
        hoursFrame={hoursFrame}
        hourLabel={hourLabel}
        onViewSpot={onViewSpot}
      />
    </section>
  );
}
