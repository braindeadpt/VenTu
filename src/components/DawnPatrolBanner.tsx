'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sunrise, Clock, Shirt, Users, ChevronDown, ChevronUp, Zap, AlertTriangle, Waves, Anchor } from 'lucide-react';
import MoonIcon from '@/components/ui/MoonIcon';
import { getMoonPhase } from '@/lib/moonPhase';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { getAssetPath } from '@/lib/paths';
import { spots } from '@/lib/spots';
import { isDawnPatrolStale } from '@/lib/dataFreshness';
import {
  ipmaRadarUrl,
  warningBadgeLabel,
  warningLevelLabel,
  warningsSourceLabel,
  seaStateWarningForSpot,
  strongestSeaStateForSpots,
  RELEVANT_WARNING_TYPES,
  type IpmaWarningsData,
} from '@/lib/ipmaWarnings';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
  type CoastalWarningsFile,
} from '@/lib/ihCoastalWarnings';

interface DawnPatrolScoreMeta {
  stationName?: string;
  distanceKm?: number;
  region?: string;
  me?: number;
  n?: number;
}

type DawnPatrolScoreSource = 'boia' | 'viés regional' | 'previsão';

interface DawnPatrolData {
  date: string;
  topSpot: string;
  topSpotSlug: string;
  /** Score recalibrado do spot em destaque (hero do banner) + honestidade. */
  topScore?: number;
  topScoreForecast?: number;
  topScoreSource?: DawnPatrolScoreSource;
  topScoreMeta?: DawnPatrolScoreMeta | null;
  pt: {
    headline: string;
    advice: string;
    bestTime: string;
    wetsuit: string;
    crowdTip: string;
    moonTideLine?: string;
  };
  en: {
    headline: string;
    advice: string;
    bestTime: string;
    wetsuit: string;
    crowdTip: string;
    moonTideLine?: string;
  };
  spots: Array<{
    name: string;
    slug: string;
    score: number;
    scoreForecast?: number;
    scoreSource?: DawnPatrolScoreSource;
    scoreMeta?: DawnPatrolScoreMeta | null;
    verdict: 'go' | 'maybe' | 'skip';
    ptReason: string;
    enReason: string;
  }>;
}

/**
 * Tooltip honesto da recalibração — partilhado entre o hero (chip do spot em
 * destaque) e os vereditos expandidos, para as duas superfícies nunca
 * divergirem na explicação (boia vs viés regional vs previsão).
 */
function recalibrationTitle(
  source: DawnPatrolScoreSource | undefined,
  meta: DawnPatrolScoreMeta | null | undefined,
  forecast: number | undefined,
  score: number,
  isPt: boolean,
): string | undefined {
  if (!source || source === 'previsão') return undefined;
  if (source === 'boia') {
    return isPt
      ? `Score corrigido pela boia${meta?.stationName ? ` ${meta.stationName}` : ''} (previsão: ${forecast ?? score})`
      : `Score corrected by buoy${meta?.stationName ? ` ${meta.stationName}` : ''} (forecast: ${forecast ?? score})`;
  }
  return isPt
    ? `Score corrigido pelo viés regional${meta?.region ? ` (${meta.region})` : ''} (previsão: ${forecast ?? score})`
    : `Score corrected by regional bias${meta?.region ? ` (${meta.region})` : ''} (forecast: ${forecast ?? score})`;
}

const VALID_SLUGS = new Set(spots.map(s => s.slug));

function resolveSpotHref(locale: string, slug: string): string {
  if (slug && VALID_SLUGS.has(slug)) {
    return `/${locale}/spots/${slug}/`;
  }
  return `/${locale}/spots/`;
}

export default function DawnPatrolBanner({ locale }: { locale: string }) {
  const [data, setData] = useState<DawnPatrolData | null>(null);
  const [warningsData, setWarningsData] = useState<IpmaWarningsData | null>(null);
  const [coastalData, setCoastalData] = useState<CoastalWarningsFile | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [barAnimated, setBarAnimated] = useState(false);
  const isPt = locale === 'pt';

  useEffect(() => {
    fetch(getAssetPath('/data/dawn-patrol.json'))
      .then(r => {
        if (!r.ok) throw new Error('Fetch failed');
        return r.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  }, []);

  // Avisos IPMA (camada opcional — falha nunca quebra o banner).
  useEffect(() => {
    fetch(getAssetPath('/data/warnings.json'))
      .then(r => {
        if (!r.ok) throw new Error('warnings fetch failed');
        return r.json();
      })
      .then(d => setWarningsData(d as IpmaWarningsData))
      .catch(() => {});
  }, []);

  // Avisos à Navegação Costeiros do IH — mesma linha de segurança, ao lado
  // dos do IPMA/MeteoAlarm. O módulo tem cache própria (o card da página de
  // spot reutiliza-a), e a falha nunca quebra o banner.
  useEffect(() => {
    loadCoastalNavWarnings()
      .then((file) => setCoastalData(file))
      .catch(() => {});
  }, []);

  // Animate score bars when expanded
  useEffect(() => {
    if (expanded) {
      const frame = requestAnimationFrame(() => setBarAnimated(true));
      return () => cancelAnimationFrame(frame);
    }
    setBarAnimated(false);
  }, [expanded]);

  const handleToggle = useCallback(() => setExpanded(e => !e), []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(getAssetPath('/data/dawn-patrol.json'))
      .then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); setError(true); });
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-surface-1/[0.04] border-b border-divider p-5 animate-pulse">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-fg-muted/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-fg-muted/10 rounded w-32" />
            <div className="h-4 bg-fg-muted/10 rounded w-64" />
            <div className="h-3 bg-fg-muted/10 rounded w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-surface-1/[0.04] border-b border-divider px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-fg-muted">
          <span>
            {isPt ? 'Dawn Patrol indisponível' : 'Dawn Patrol unavailable'}
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1 rounded-lg bg-surface-2/[0.08] hover:bg-surface-3/[0.12] transition-colors text-fg-muted text-xs font-medium"
          >
            {isPt ? 'Tentar de novo' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const content = isPt ? data.pt : data.en;
  const stale = isDawnPatrolStale(data.date);

  // Avisos IPMA relevantes para a água (resumo compacto, no máx. 3).
  const relevantWarnings = (() => {
    if (!warningsData?.warnings) return [];
    const seen = new Set<string>();
    const out: typeof warningsData.warnings = [];
    for (const w of warningsData.warnings) {
      if (!RELEVANT_WARNING_TYPES.has(w.type)) continue;
      const key = `${w.type}|${w.level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out.slice(0, 3);
  })();
  // «Mar perigoso» — o mesmo aviso de segurança do hero do spot, aplicado ao
  // briefing: o aviso de Agitação Marítima mais forte entre os spots do Dawn
  // Patrol (spot em destaque + lista), com o slug do spot afectado.
  const seaState = (() => {
    if (!warningsData) return null;
    const slugs = [data.topSpotSlug, ...data.spots.map((s) => s.slug)];
    const best = strongestSeaStateForSpots(warningsData, slugs);
    if (!best) return null;
    const slug =
      slugs.find((s) => seaStateWarningForSpot(warningsData, s) === best) ??
      data.topSpotSlug;
    return { warning: best, slug };
  })();

  // «Avisos à Navegação Costeiros (IH)» — o primeiro spot (destaque ou lista)
  // coberto por um aviso em vigor, com ligação à página do spot (onde a secção
  // completa vive). Junto da linha IPMA/MeteoAlarm — nunca substitui o «Mar
  // perigoso», que continua a ser o aviso mais forte de agitação marítima.
  const coastalState = (() => {
    if (!coastalData) return null;
    const slugs = [data.topSpotSlug, ...data.spots.map((s) => s.slug)];
    for (const slug of slugs) {
      const ws = warningsForSpot(coastalData, slug);
      if (ws && ws.length > 0) return { warnings: ws, slug };
    }
    return null;
  })();

  const moon = getMoonPhase(new Date(`${data.date}T12:00:00`));
  const dateLabel = new Date(`${data.date}T12:00:00`).toLocaleDateString(
    isPt ? 'pt-PT' : 'en-GB',
    { weekday: 'short', day: 'numeric', month: 'short' },
  );
  const topSpotHref = resolveSpotHref(locale, data.topSpotSlug);
  const topSpotLinkValid = Boolean(data.topSpotSlug && VALID_SLUGS.has(data.topSpotSlug));
  const verdictColors = {
    go: 'bg-windDir-offshore/20 text-windDir-offshore border-windDir-offshore/30',
    maybe: 'bg-score-fair/20 text-score-fair border-score-fair/30',
    skip: 'bg-windDir-onshore/20 text-windDir-onshore border-windDir-onshore/30',
  };

  const verdictLabels = {
    go: isPt ? 'VAI!' : 'GO!',
    maybe: isPt ? 'TALVEZ' : 'MAYBE',
    skip: isPt ? 'SKIP' : 'SKIP',
  };

  return (
    <div className="w-full bg-surface-1/[0.04] border-b border-divider overflow-hidden border-l-4 border-l-accent">
      {/* Mar perigoso — mesmo aviso de segurança do hero do spot, para o briefing */}
      {seaState && (
        <Link
          href={resolveSpotHref(locale, seaState.slug)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
            seaState.warning.level === 'red'
              ? 'bg-red-500/10 text-red-500 border-b border-red-500/30'
              : seaState.warning.level === 'orange'
                ? 'bg-score-poor/10 text-score-poor border-b border-score-poor/30'
                : 'bg-score-fair/10 text-score-fair border-b border-score-fair/30'
          } hover:brightness-110 transition-all`}
        >
          <Waves className="w-4 h-4 shrink-0" aria-hidden />
          <span className="font-bold">
            {isPt ? 'Mar perigoso — não surfar' : 'Dangerous sea — do not surf'}
          </span>
          <span className="font-semibold">
            {warningBadgeLabel(seaState.warning, isPt)} ·{' '}
            {warningLevelLabel(seaState.warning.level, locale)}
          </span>
          <span className="text-meta-sm text-fg-muted ml-auto shrink-0">
            {isPt ? 'ver spot →' : 'view spot →'}
          </span>
        </Link>
      )}

      {/* Main banner — toggle area */}
      <div
        className="p-5 cursor-pointer hover:bg-surface-2/[0.08] transition-colors select-none"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={content.headline}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
              <div className="p-2.5 rounded-xl bg-accent/15 shrink-0">
                <Sunrise className="w-7 h-7 text-accent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-accent uppercase tracking-wider font-display">
                  {isPt ? 'Dawn Patrol' : 'Dawn Patrol'}
                </span>
                <span className="text-xs text-fg-subtle whitespace-nowrap">{dateLabel}</span>
                {stale && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-score-fair/15 text-score-fair border border-score-fair/30"
                    title={isPt ? 'Briefing com mais de 24 horas — a aguardar actualização' : 'Briefing older than 24 hours — awaiting update'}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {isPt ? 'Desactualizado' : 'Outdated'}
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-bold text-fg truncate">{content.headline}</h3>
              <p className="text-sm text-fg-muted mt-1 line-clamp-2">{content.advice}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop CTA — visible sm+ */}
            <Button
              href={topSpotHref}
              size="sm"
              className="hidden sm:inline-flex"
              locale={isPt ? 'pt' : 'en'}
              leftIcon={<Zap className="w-4 h-4" aria-hidden />}
              onClick={(e) => e.stopPropagation()}
            >
              {topSpotLinkValid
                ? (isPt ? 'Ver Spot' : 'View Spot')
                : (isPt ? 'Ver Spots' : 'View Spots')}
            </Button>
            {expanded ? <ChevronUp className="w-5 h-5 text-fg-subtle" /> : <ChevronDown className="w-5 h-5 text-fg-subtle" />}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-divider">
          {/* Score recalibrado do spot em destaque — visível no hero, não só no
              tooltip dos vereditos. Sufixo honesto (boia / viés regional) com a
              previsão original no tooltip, igual à lista expandida. */}
          {data.topScore != null && (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Zap className="w-4 h-4 text-accent shrink-0" aria-hidden />
              <span>
                {isPt ? 'Score:' : 'Score:'}{' '}
                <span className="font-bold text-fg tabular-nums">{data.topScore}</span>
                {data.topScoreSource && data.topScoreSource !== 'previsão' && (
                  <span
                    className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold bg-accent/15 text-accent border border-accent/30 cursor-help"
                    title={recalibrationTitle(
                      data.topScoreSource,
                      data.topScoreMeta,
                      data.topScoreForecast,
                      data.topScore,
                      isPt,
                    )}
                  >
                    {isPt
                      ? data.topScoreSource === 'boia'
                        ? '(boia)'
                        : '(viés regional)'
                      : data.topScoreSource === 'boia'
                        ? '(buoy)'
                        : '(regional bias)'}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Clock className="w-4 h-4 text-data-waves shrink-0" />
            <span>{isPt ? 'Melhor hora:' : 'Best time:'} <span className="font-bold text-fg">{content.bestTime}</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Shirt className="w-4 h-4 text-data-waves shrink-0" />
            <span>{isPt ? 'Fato:' : 'Wetsuit:'} <span className="font-bold text-fg">{content.wetsuit}</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Users className="w-4 h-4 text-data-waves shrink-0" />
            <span>{content.crowdTip}</span>
          </div>
          {content.moonTideLine ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted w-full sm:w-auto">
              <MoonIcon
                illumination={moon.illumination}
                waxing={moon.waxing}
                size={18}
                className="opacity-90"
              />
              <span className="text-fg-muted">{content.moonTideLine}</span>
            </div>
          ) : null}
        </div>

        {relevantWarnings.length > 0 && (
          <a
            href={ipmaRadarUrl(locale)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-sm mt-2 text-score-poor hover:underline"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              {isPt
                ? `Aviso ativo (${warningsSourceLabel(warningsData, true)})`
                : `Active warning (${warningsSourceLabel(warningsData, false)})`}:{' '}
              {relevantWarnings
                .map((w) => `${warningBadgeLabel(w, isPt)} (${warningLevelLabel(w.level, locale)})`)
                .join(' · ')}
            </span>
          </a>
        )}

        {coastalState && (
          <Link
            href={resolveSpotHref(locale, coastalState.slug)}
            className="flex items-start gap-2 text-sm mt-2 text-score-poor hover:underline"
          >
            <Anchor className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              {isPt
                ? 'Aviso à navegação costeira (IH): '
                : 'Coastal navigation warning (IH): '}
              {coastalState.warnings
                .map(
                  (w) =>
                    `${w.ref}${w.category ? ` — ${w.category}` : ''}`,
                )
                .join(' · ')}
            </span>
          </Link>
        )}
      </div>

      {/* Expanded: All spots + mobile CTA */}
      {expanded && (
        <div className="border-t border-divider p-5">
          <h4 className="text-sm font-bold text-fg-muted uppercase tracking-wider mb-3">
            {isPt ? 'Vereditos de hoje' : "Today's Verdicts"}
          </h4>
          {data.spots.length === 0 ? (
            <p className="text-sm text-fg-muted mb-4">
              {isPt
                ? 'Ainda não há vereditos por spot para hoje. Consulta o mapa ou o spot em destaque.'
                : 'No per-spot verdicts for today yet. Check the map or the featured spot.'}
            </p>
          ) : (
          <div className="space-y-2">
            {data.spots.map(spot => (
              <Link
                key={spot.slug}
                href={resolveSpotHref(locale, spot.slug)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-2/[0.08] transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${verdictColors[spot.verdict]}`}>
                    {verdictLabels[spot.verdict]}
                  </span>
                  <span className="font-medium text-fg group-hover:text-data-waves/80 transition-colors truncate">
                    {spot.name}
                  </span>
                  <span className="text-xs text-fg-subtle truncate hidden sm:inline">{isPt ? spot.ptReason : spot.enReason}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-2 w-20 rounded-full bg-surface-2/[0.08] overflow-hidden" role="progressbar" aria-valuenow={spot.score} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-windDir-offshore to-data-waves transition-all duration-700 ease-out motion-reduce:transition-none"
                      style={{ width: barAnimated ? `${spot.score}%` : '0%' }}
                    />
                  </div>
                  <span
                    className="text-xs font-bold text-fg-muted tabular-nums"
                    title={recalibrationTitle(
                      spot.scoreSource,
                      spot.scoreMeta,
                      spot.scoreForecast,
                      spot.score,
                      isPt,
                    )}
                  >
                    {spot.score}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          )}

          {/* Mobile CTA — visible inside expanded area */}
          <Button
            href={topSpotHref}
            size="lg"
            className="sm:hidden w-full mt-4"
            locale={isPt ? 'pt' : 'en'}
            leftIcon={<Zap className="w-4 h-4" aria-hidden />}
          >
            {topSpotLinkValid
              ? (isPt ? 'Ver Spot em destaque' : 'View featured spot')
              : (isPt ? 'Ver todos os spots' : 'View all spots')}
          </Button>
        </div>
      )}
    </div>
  );
}
