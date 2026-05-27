'use client';

import { cn } from '@/lib/cn';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getScoreTokens } from '@/lib/sportScore';

interface SportTabProps {
  sport: SportType;
  score: number;
  active: boolean;
  onClick: () => void;
  locale: string;
}

export default function SportTab({ sport, score, active, onClick, locale }: SportTabProps) {
  const isPt = locale === 'pt';
  const tokens = getScoreTokens(score);
  const label = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
  const glow = active && (tokens.tier === 'epic' || tokens.tier === 'good');

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      id={`sport-tab-${sport}`}
      onClick={onClick}
      className={cn(
        'pill shrink-0 gap-2 px-3 py-2 min-h-[44px] text-meta font-medium',
        'transition-[background-color,border-color,color,box-shadow] duration-150 motion-reduce:transition-none',
        active
          ? cn(tokens.bg, tokens.text, tokens.border, 'border', glow && tokens.glow)
          : 'pill-ghost',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'font-mono text-num-sm font-semibold tabular-nums rounded-pill px-1.5 py-0.5',
          active ? tokens.text : cn(tokens.bg, tokens.text, 'border', tokens.border),
        )}
      >
        {score}
      </span>
    </button>
  );
}
