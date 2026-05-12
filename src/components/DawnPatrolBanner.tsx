'use client';

import { useState, useEffect } from 'react';
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
  const isPt = locale === 'pt';

  useEffect(() => {
    fetch(getAssetPath('/data/dawn-patrol.json'))
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <Sunrise className="w-6 h-6 text-score-fair" />
          <div className="h-4 bg-surface-1 rounded w-48" />
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
    <div className="glass-card overflow-hidden">
      {/* Main banner */}
      <div 
        className="p-5 cursor-pointer hover:bg-surface-1 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-score-fair/10">
              <Sunrise className="w-7 h-7 text-score-fair" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-score-fair uppercase tracking-wider">
                  {isPt ? '🌅 Dawn Patrol' : '🌅 Dawn Patrol'}
                </span>
                <span className="text-xs text-fg-subtle">{data.date}</span>
              </div>
              <h3 className="text-lg font-bold text-fg">{content.headline}</h3>
              <p className="text-sm text-fg-muted mt-1">{content.advice}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/spots/${data.topSpotSlug}/`}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-data-waves hover:bg-data-waves/80 text-bg-base rounded-xl text-sm font-medium transition-all hover:scale-105"
              onClick={e => e.stopPropagation()}
            >
              <Zap className="w-4 h-4" />
              {isPt ? 'Ver Spot' : 'View Spot'}
            </Link>
            {expanded ? <ChevronUp className="w-5 h-5 text-fg-subtle" /> : <ChevronDown className="w-5 h-5 text-fg-subtle" />}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 mt-4 pt-3 border-t border-divider">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Clock className="w-4 h-4 text-data-waves" />
            {isPt ? 'Melhor hora:' : 'Best time:'} <span className="font-bold text-fg">{content.bestTime}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Shirt className="w-4 h-4 text-data-waves" />
            {isPt ? 'Fato:' : 'Wetsuit:'} <span className="font-bold text-fg">{content.wetsuit}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Users className="w-4 h-4 text-data-waves" />
            {content.crowdTip}
          </div>
        </div>
      </div>

      {/* Expanded: All spots */}
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
                className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-1 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${verdictColors[spot.verdict]}`}>
                    {verdictLabels[spot.verdict]}
                  </span>
                  <span className="font-medium text-fg group-hover:text-data-waves/80 transition-colors">
                    {spot.name}
                  </span>
                  <span className="text-xs text-fg-subtle">{isPt ? spot.ptReason : spot.enReason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 rounded-full bg-surface-2 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-windDir-offshore to-data-waves"
                      style={{ width: `${spot.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-fg-muted">{spot.score}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
