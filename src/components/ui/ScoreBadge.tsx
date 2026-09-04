import { cn } from '@/lib/cn';
import { getScoreTokens, getScoreTierLabel } from '@/lib/sportScore';

interface ScoreBadgeProps {
  score: number;
  locale?: 'pt' | 'en';
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export default function ScoreBadge({
  score,
  locale = 'pt',
  showLabel = true,
  size = 'md',
  className,
}: ScoreBadgeProps) {
  const tokens = getScoreTokens(score);
  const label = getScoreTierLabel(tokens.tier, locale);
  const glow = tokens.tier === 'epic' || tokens.tier === 'good';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-mono font-semibold tabular-nums border',
        tokens.bg,
        tokens.text,
        tokens.border,
        glow && tokens.glow,
        size === 'sm' ? 'px-2 py-0.5 text-meta-sm' : 'px-2.5 py-1 text-meta',
        className,
      )}
    >
      <span data-visual-dynamic>{score}</span>
      {showLabel && (
        <span
          className={cn(
            'font-sans font-medium',
            tokens.tier === 'epic' && 'text-accent font-display',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
