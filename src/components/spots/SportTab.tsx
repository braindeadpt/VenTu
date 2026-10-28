'use client';

import { scoreToNota } from '@/lib/nota';
import { cn } from '@/lib/cn';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getScoreTokens } from '@/lib/sportScore';
import { LuaNoite } from '@/components/ui/NoiteJanela';

interface SportTabProps {
  sport: SportType;
  score: number;
  active: boolean;
  onClick: () => void;
  locale: string;
  /** De noite: a lua no lugar do «0» (opção A, 28/10). */
  noite?: boolean;
}

export default function SportTab({ sport, score, active, onClick, locale, noite = false }: SportTabProps) {
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
        'pill shrink-0 gap-2 px-3 py-2 min-h-[44px] text-body-sm font-medium',
        'transition-[background-color,border-color,color,box-shadow] duration-150 motion-reduce:transition-none',
        active
          ? cn(tokens.bg, tokens.text, tokens.border, 'border', glow && tokens.glow)
          : 'pill-ghost',
      )}
    >
      <span>{label}</span>
      {noite ? (
        <LuaNoite size={24} locale={locale} />
      ) : (
      <span
        className={cn(
          'font-mono text-num-sm font-semibold tabular-nums',
          active
            ? tokens.text
            : cn(tokens.bg, tokens.text, 'border', tokens.border, 'rounded-pill px-1.5 py-0.5'),
        )}
      >
        {scoreToNota(score)}
      </span>
      )}
    </button>
  );
}
