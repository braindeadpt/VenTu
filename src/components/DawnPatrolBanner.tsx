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
          <Sunrise className="w-6 h-6 text-yellow-400" />
          <div className="h-4 bg-white/10 rounded w-48" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const content = isPt ? data.pt : data.en;
  const verdictColors = {
    go: 'bg-green-500/20 text-green-400 border-green-500/30',
    maybe: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    skip: 'bg-red-500/20 text-red-400 border-red-500/30',
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
        className="p-5 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-yellow-500/10">
              <Sunrise className="w-7 h-7 text-yellow-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                  {isPt ? '🌅 Dawn Patrol' : '🌅 Dawn Patrol'}
                </span>
                <span className="text-xs text-white/40">{data.date}</span>
              </div>
              <h3 className="text-lg font-bold text-white/90">{content.headline}</h3>
              <p className="text-sm text-white/60 mt-1">{content.advice}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/spots/${data.topSpotSlug}/`}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-ocean-500 hover:bg-ocean-600 text-white rounded-xl text-sm font-medium transition-all hover:scale-105"
              onClick={e => e.stopPropagation()}
            >
              <Zap className="w-4 h-4" />
              {isPt ? 'Ver Spot' : 'View Spot'}
            </Link>
            {expanded ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 mt-4 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Clock className="w-4 h-4 text-cyan-400" />
            {isPt ? 'Melhor hora:' : 'Best time:'} <span className="font-bold text-white">{content.bestTime}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Shirt className="w-4 h-4 text-surf-400" />
            {isPt ? 'Fato:' : 'Wetsuit:'} <span className="font-bold text-white">{content.wetsuit}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Users className="w-4 h-4 text-wave-400" />
            {content.crowdTip}
          </div>
        </div>
      </div>

      {/* Expanded: All spots */}
      {expanded && (
        <div className="border-t border-white/10 p-5">
          <h4 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">
            {isPt ? 'Vereditos de hoje' : "Today's Verdicts"}
          </h4>
          <div className="space-y-2">
            {data.spots.map(spot => (
              <Link
                key={spot.slug}
                href={`/${locale}/spots/${spot.slug}/`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${verdictColors[spot.verdict]}`}>
                    {verdictLabels[spot.verdict]}
                  </span>
                  <span className="font-medium text-white/80 group-hover:text-ocean-300 transition-colors">
                    {spot.name}
                  </span>
                  <span className="text-xs text-white/40">{isPt ? spot.ptReason : spot.enReason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 rounded-full bg-white/10 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-green-400 to-cyan-400"
                      style={{ width: `${spot.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-white/60">{spot.score}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
