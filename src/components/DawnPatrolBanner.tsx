'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sunrise, Clock, Shirt, Users, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import Link from 'next/link';
import { getAssetPath } from '@/lib/paths';

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
  };
  en: {
    headline: string;
    advice: string;
    bestTime: string;
    wetsuit: string;
    crowdTip: string;
  };
  spots: Array<{
    name: string;
    slug: string;
    score: number;
    verdict: 'go' | 'maybe' | 'skip';
    ptReason: string;
    enReason: string;
  }>;
}

export default function DawnPatrolBanner({ locale }: { locale: string }) {
  const [data, setData] = useState<DawnPatrolData | null>(null);
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
      <div className="w-full bg-surface-1 border-b border-divider p-5 animate-pulse">
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
      <div className="w-full bg-surface-1 border-b border-divider px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-fg-muted">
          <span>
            {isPt ? 'Dawn Patrol indisponível' : 'Dawn Patrol unavailable'}
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors text-fg-muted text-xs font-medium"
          >
            {isPt ? 'Tentar de novo' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const content = isPt ? data.pt : data.en;
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
    <div className="w-full bg-surface-1 border-b border-divider overflow-hidden">
      {/* Main banner — toggle area */}
      <div
        className="p-5 cursor-pointer hover:bg-surface-2 transition-colors select-none"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={content.headline}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            <div className="p-2.5 rounded-xl bg-score-fair/10 shrink-0">
              <Sunrise className="w-7 h-7 text-score-fair" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-score-fair uppercase tracking-wider">
                  {isPt ? 'Dawn Patrol' : 'Dawn Patrol'}
                </span>
                <span className="text-xs text-fg-subtle whitespace-nowrap">{data.date}</span>
              </div>
              <h3 className="text-lg font-bold text-fg truncate">{content.headline}</h3>
              <p className="text-sm text-fg-muted mt-1 line-clamp-2">{content.advice}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop CTA — visible sm+ */}
            <Link
              href={`/${locale}/spots/${data.topSpotSlug}/`}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-data-waves hover:bg-data-waves/80 text-bg-base rounded-xl text-sm font-medium transition-all hover:scale-105"
              onClick={e => e.stopPropagation()}
            >
              <Zap className="w-4 h-4" />
              {isPt ? 'Ver Spot' : 'View Spot'}
            </Link>
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
        </div>
      </div>

      {/* Expanded: All spots + mobile CTA */}
      {expanded && (
        <div className="border-t border-divider p-5">
          <h4 className="text-sm font-bold text-fg-muted uppercase tracking-wider mb-3">
            {isPt ? 'Vereditos de hoje' : "Today's Verdicts"}
          </h4>
          <div className="space-y-2">
            {data.spots.map(spot => (
              <Link
                key={spot.slug}
                href={`/${locale}/spots/${spot.slug}/`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-2 transition-colors group"
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
                  <div className="h-2 w-20 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={spot.score} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-windDir-offshore to-data-waves transition-all duration-700 ease-out motion-reduce:transition-none"
                      style={{ width: barAnimated ? `${spot.score}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs font-bold text-fg-muted tabular-nums">{spot.score}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Mobile CTA — visible inside expanded area */}
          <Link
            href={`/${locale}/spots/${data.topSpotSlug}/`}
            className="sm:hidden flex items-center justify-center gap-2 mt-4 w-full py-3 bg-data-waves hover:bg-data-waves/80 text-bg-base rounded-xl text-sm font-medium transition-all"
          >
            <Zap className="w-4 h-4" />
            {isPt ? 'Ver Spot em destaque' : 'View featured spot'}
          </Link>
        </div>
      )}
    </div>
  );
}
