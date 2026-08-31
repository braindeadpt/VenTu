'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sunrise, Clock, Shirt, Users, ChevronDown, ChevronUp, Zap, AlertTriangle, Waves } from 'lucide-react';
import MoonIcon from '@/components/ui/MoonIcon';
import { getMoonPhase } from '@/lib/moonPhase';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { getAssetPath } from '@/lib/paths';
import { spots } from '@/lib/spots';
import { isDawnPatrolStale } from '@/lib/dataFreshness';
import {
  ipmaRadarUrl,
  warningTypeLabel,
  warningsSourceLabel,
  seaStateWarningForSpot,
  strongestSeaStateForSpots,
  WARNING_LEVEL_META,
  RELEVANT_WARNING_TYPES,
  type IpmaWarningsData,
} from '@/lib/ipmaWarnings';

interface DawnPatrolData {
  date: string;
  topSpot: string;
  topSpotSlug: string;
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
    scoreSource?: 'boia' | 'viés regional' | 'previsão';
    scoreMeta?: { stationName?: string; distanceKm?: number; region?: string; me?: number; n?: number } | null;
    verdict: 'go' | 'maybe' | 'skip';
    ptReason: string;
    enReason: string;
  }>;
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
            {warningTypeLabel(seaState.warning.type, isPt)} ·{' '}
            {WARNING_LEVEL_META[seaState.warning.level]?.label[isPt ? 'pt' : 'en'] ?? seaState.warning.level}
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
                .map(
                  (w) =>
                    `${warningTypeLabel(w.type, isPt)} (${WARNING_LEVEL_META[w.level]?.label[isPt ? 'pt' : 'en'] ?? w.level})`,
                )
                .join(' · ')}
            </span>
          </a>
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
                    title={
                      spot.scoreSource && spot.scoreSource !== 'previsão'
                        ? isPt
                          ? spot.scoreSource === 'boia'
                            ? `Score corrigido pela boia${spot.scoreMeta?.stationName ? ` ${spot.scoreMeta.stationName}` : ''} (previsão: ${spot.scoreForecast ?? spot.score})`
                            : `Score corrigido pelo viés regional${spot.scoreMeta?.region ? ` (${spot.scoreMeta.region})` : ''} (previsão: ${spot.scoreForecast ?? spot.score})`
                          : spot.scoreSource === 'boia'
                            ? `Score corrected by buoy${spot.scoreMeta?.stationName ? ` ${spot.scoreMeta.stationName}` : ''} (forecast: ${spot.scoreForecast ?? spot.score})`
                            : `Score corrected by regional bias${spot.scoreMeta?.region ? ` (${spot.scoreMeta.region})` : ''} (forecast: ${spot.scoreForecast ?? spot.score})`
                        : undefined
                    }
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
