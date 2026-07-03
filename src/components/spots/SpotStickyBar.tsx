'use client';

import { useEffect, useRef, useState } from 'react';
import { Waves, Wind, Droplets, Clock } from 'lucide-react';
import { getScoreTokens } from '@/lib/sportScore';
import type { SportScore } from '@/lib/sportScore';

interface SpotStickyBarProps {
  score: SportScore;
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    windSpeed: number;
    waterTemp: number;
  };
  /** Sport label (e.g. "Surf", "Kite"). */
  sportLabel: string;
  /** Hero element to track for visibility. */
  heroRef: React.RefObject<HTMLElement | null>;
  /** Locale. */
  locale: string;
}

/**
 * Sticky condensed bar that appears just under the header when the user
 * scrolls past the hero on mobile. Keeps the key score + 4 stat chips
 * visible at all times, so a glance from the table or windows section
 * still shows the headline numbers.
 *
 * Hidden on md+ (tablet/desktop keeps the full hero in view via scroll).
 */
export default function SpotStickyBar({
  score,
  conditions,
  sportLabel,
  heroRef,
  locale,
}: SpotStickyBarProps) {
  const isPt = locale === 'pt';
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches) {
      return;
    }
    if (!heroRef.current) return;
    // Use a sentinel placed right after the hero. When the sentinel scrolls
    // out of view (above the viewport) the hero is gone — show the bar.
    const observer = new IntersectionObserver(
      ([entry]) => {
        // entry.boundingClientRect.bottom < 0 → hero is fully above viewport
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' },
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [heroRef]);

  if (!visible) return null;

  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const tokens = getScoreTokens(score.score);

  return (
    <div
      role="region"
      aria-label={isPt ? 'Métricas principais' : 'Key metrics'}
      className="md:hidden fixed left-0 right-0 z-30 h-14 bg-bg-base/95 supports-[backdrop-filter]:backdrop-blur-md border-b border-divider"
      style={{ top: '64px' }}
    >
      <div className="max-w-6xl mx-auto px-2 h-full flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <div
          className={[
            'shrink-0 flex items-center justify-center min-w-[36px] h-8 rounded-pill border font-mono font-semibold text-xs px-1.5 tabular-nums',
            tokens.bg,
            tokens.text,
            tokens.border,
          ].join(' ')}
          aria-label={`${sportLabel} score ${score.score}`}
        >
          {score.score}
        </div>
        <Stat icon={<Waves className="w-3 h-3 text-data-waves" />} value={`${conditions.waveHeight.toFixed(1)}m`} label={isPt ? 'Onda' : 'Wave'} />
        <Stat icon={<Clock className="w-3 h-3 text-data-period" />} value={`${Math.round(conditions.wavePeriod)}s`} label={isPt ? 'Período' : 'Period'} />
        <Stat icon={<Wind className="w-3 h-3 text-data-wind" />} value={`${windKt}kt`} label={isPt ? 'Vento' : 'Wind'} />
        <Stat icon={<Droplets className="w-3 h-3 text-data-water" />} value={`${conditions.waterTemp.toFixed(1)}°`} label={isPt ? 'Água' : 'Water'} />
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-pill bg-surface-1/[0.04] border border-divider">
      {icon}
      <span className="font-mono tabular-nums text-meta font-medium text-fg">{value}</span>
      <span className="text-meta-sm text-fg-muted hidden sm:inline">{label}</span>
    </div>
  );
}
