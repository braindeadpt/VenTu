'use client';

import { useEffect, useState } from 'react';
import { Waves, Wind, Droplets, Clock } from 'lucide-react';
import { getScoreTokens } from '@/lib/sportScore';
import type { SportScore } from '@/lib/sportScore';
import {
  isObservedWaveFresh,
  observedWaveLabel,
  waveCalibrationTag,
  type ObservedWave,
  type ObservedWaveMeta,
} from '@/lib/observedWave';
import ObservedWaveSourcesChip from '@/components/spots/ObservedWaveSourcesChip';
import ScoreWaveSourceBadge from '@/components/ui/ScoreWaveSourceBadge';
import { waveFactorSuffix, type ScoreWaveCorrection } from '@/lib/scoreConditions';

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
  /** Optional fresh buoy reading — compact «boia X a Y km» chip. */
  observedWave?: ObservedWave | null;
  /** Runner-up source (WMO when IH won) — side-by-side chip when both fresh. */
  observedWaveAlt?: ObservedWave | null;
  /** Why the winner was chosen (freshness/distance) — attached by the merge. */
  observedWaveMeta?: ObservedWaveMeta | null;
  /**
   * Wave correction (resolveScoreWaveCorrection, já calculado pelo client) —
   * «Corrigido pela boia X» com ME/n, mesmo caminho do hero.
   */
  scoreWaveCorrection?: ScoreWaveCorrection | null;
}

/**
 * Sticky condensed bar that appears just under the header when the user
 * scrolls past the hero (mobile AND desktop). Keeps the key score + 4 stat
 * chips visible at all times, so a glance from the table or windows section
 * still shows the headline numbers — including the observed wave chip
 * (single source or IH vs WMO) when there is a fresh buoy reading.
 *
 * Visibility is gated by the IntersectionObserver on the hero (hidden until
 * the hero leaves the viewport), so the bar only takes space when useful.
 */
export default function SpotStickyBar({
  score,
  conditions,
  sportLabel,
  heroRef,
  locale,
  observedWave,
  observedWaveAlt,
  observedWaveMeta,
  scoreWaveCorrection,
}: SpotStickyBarProps) {
  const isPt = locale === 'pt';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Always observe — the bar is hidden on md+ via CSS (`md:hidden`), so
    // gating the observer on viewport width here would freeze the mount-time
    // decision and break rotation/resize into mobile widths.
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
  const waveSource = scoreWaveCorrection?.source ?? 'forecast';
  // Altura que o score usou: a medição da boia quando 'observed', senão a row
  // (já corrigida pelo viés regional quando aplicável) — mesma lógica do hero.
  const waveHeightShown =
    waveSource === 'observed' && observedWave
      ? observedWave.waveHeight
      : conditions.waveHeight;

  return (
    <div
      role="region"
      aria-label={isPt ? 'Métricas principais' : 'Key metrics'}
      className="fixed left-0 right-0 z-30 h-14 bg-bg-base/95 supports-[backdrop-filter]:backdrop-blur-md border-b border-divider"
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
        <Stat
          icon={<Waves className="w-3 h-3 text-data-waves" />}
          value={`${waveHeightShown.toFixed(1)}m${waveFactorSuffix(waveSource, locale)}`}
          label={isPt ? 'Onda' : 'Wave'}
        />
        <Stat icon={<Clock className="w-3 h-3 text-data-period" />} value={`${Math.round(conditions.wavePeriod)}s`} label={isPt ? 'Período' : 'Period'} />
        <Stat icon={<Wind className="w-3 h-3 text-data-wind" />} value={`${windKt}kt`} label={isPt ? 'Vento' : 'Wind'} />
        <Stat icon={<Droplets className="w-3 h-3 text-data-water" />} value={`${conditions.waterTemp.toFixed(1)}°`} label={isPt ? 'Água' : 'Water'} />
        {observedWave &&
          isObservedWaveFresh(observedWave) &&
          (observedWaveAlt && isObservedWaveFresh(observedWaveAlt) ? (
            <ObservedWaveSourcesChip
              observedWave={observedWave}
              altWave={observedWaveAlt}
              meta={observedWaveMeta}
              locale={locale}
            />
          ) : (
            <Stat
              icon={<Waves className="w-3 h-3 text-score-good" />}
              value={observedWaveLabel(observedWave, locale)}
              label={isPt ? 'medida' : 'measured'}
            />
          ))}
        {observedWave &&
          isObservedWaveFresh(observedWave) &&
          !(observedWaveAlt && isObservedWaveFresh(observedWaveAlt)) &&
          (() => {
            const calTag = waveCalibrationTag(observedWave, locale);
            return calTag ? (
              <span
                className="shrink-0 inline-flex items-center gap-1 rounded-pill border border-data-period/30 bg-data-period/10 px-2 py-1 font-medium whitespace-nowrap text-meta-sm text-data-period"
                title={calTag.title}
                data-wave-calibrated="compact"
              >
                {calTag.label}
              </span>
            ) : null;
          })()}
        {scoreWaveCorrection &&
          (scoreWaveCorrection.source === 'observed' ||
            scoreWaveCorrection.source === 'bias-corrected') && (
            <ScoreWaveSourceBadge
              source={scoreWaveCorrection.source}
              correction={scoreWaveCorrection}
              locale={locale}
              className="shrink-0"
            />
          )}
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
