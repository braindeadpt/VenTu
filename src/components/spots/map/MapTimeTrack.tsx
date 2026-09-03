'use client';

import { Pause, Play } from 'lucide-react';

export interface MapTimeTrackLabels {
  scrub: string;
  play: string;
  pause: string;
}

interface MapTimeTrackProps {
  length: number;
  index: number;
  onIndexChange: (index: number) => void;
  paused: boolean;
  userPaused: boolean;
  onUserPausedChange?: (paused: boolean) => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  clock: string;
  labels: MapTimeTrackLabels;
  /** `hud` = fullscreen chrome (44px). `floating` = on-map compact panel. */
  variant?: 'floating' | 'hud';
  /** Radar e2e selectors (`data-radar-scrubber` / `data-radar-toggle`). */
  mode?: 'radar';
}

/**
 * Shared map time track (play / pause / range / clock). Radar is the first
 * mode; later sessions can drive score hours from the same control.
 */
export default function MapTimeTrack({
  length,
  index,
  onIndexChange,
  paused,
  userPaused,
  onUserPausedChange,
  onScrubbingChange,
  clock,
  labels,
  variant = 'floating',
  mode = 'radar',
}: MapTimeTrackProps) {
  if (length <= 1) return null;

  const isHud = variant === 'hud';
  const radarAttrs = mode === 'radar';

  return (
    <div
      className={
        isHud
          ? 'flex items-center gap-2 min-h-[44px] w-full'
          : 'flex flex-col gap-1 px-2.5 pt-1.5 pb-2 rounded-md bg-bg-elevated/95 border border-divider shadow-card max-md:flex-row max-md:items-center max-md:gap-2 max-md:px-2 max-md:py-0.5'
      }
      data-map-time-track="true"
      data-map-time-track-mode={mode}
      data-radar-scrubber={radarAttrs ? 'true' : undefined}
    >
      <div
        className={
          isHud
            ? 'flex items-center gap-2 shrink-0'
            : 'flex items-center justify-between gap-3 text-meta-sm max-md:flex-none max-md:justify-start max-md:gap-2'
        }
      >
        <span className="flex items-center gap-1.5 text-fg-muted">
          <button
            type="button"
            onClick={() => onUserPausedChange?.(!paused)}
            aria-label={paused ? labels.play : labels.pause}
            aria-pressed={userPaused}
            title={paused ? labels.play : labels.pause}
            data-radar-toggle={radarAttrs ? 'true' : undefined}
            className={
              isHud
                ? 'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-input text-fg bg-surface-1/[0.04] border border-divider hover:bg-surface-2/[0.08] active:scale-95 transition-colors duration-150'
                : 'flex items-center justify-center w-6 h-6 rounded-md text-fg bg-bg-elevated border border-divider shadow-sm hover:bg-bg-elevated/60 active:scale-95 transition-colors'
            }
          >
            {paused ? (
              <Play className="w-3.5 h-3.5" aria-hidden />
            ) : (
              <Pause className="w-3.5 h-3.5" aria-hidden />
            )}
          </button>
          {!isHud && <span className="hidden sm:inline">{labels.scrub}</span>}
        </span>
        <span className="font-semibold tabular-nums font-mono text-meta-sm text-fg">{clock}</span>
      </div>
      <input
        type="range"
        min={0}
        max={length - 1}
        step={1}
        value={index}
        onChange={(e) => onIndexChange(Number(e.target.value))}
        onPointerDown={() => onScrubbingChange(true)}
        onPointerUp={() => onScrubbingChange(false)}
        onPointerCancel={() => onScrubbingChange(false)}
        onBlur={() => onScrubbingChange(false)}
        aria-label={labels.scrub}
        className={
          isHud
            ? 'flex-1 min-h-[44px] accent-data-waves cursor-pointer touch-manipulation'
            : 'w-40 accent-data-waves cursor-pointer touch-manipulation max-md:order-first max-md:w-20 max-md:flex-1'
        }
      />
    </div>
  );
}
