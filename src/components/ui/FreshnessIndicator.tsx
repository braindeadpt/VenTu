import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/cn';

interface FreshnessIndicatorProps {
  hoursAgo: number | null;
  locale: string;
  sourceLabel?: string;
  size?: 'sm' | 'md';
}

export default function FreshnessIndicator({
  hoursAgo,
  locale,
  sourceLabel,
  size = 'md',
}: FreshnessIndicatorProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as Locale);
  const label = sourceLabel ?? t.hero.gridStatusSource;

  const dotClass =
    hoursAgo === null
      ? 'bg-fg-subtle'
      : hoursAgo < 3
        ? 'bg-[rgb(var(--score-good))]'
        : hoursAgo < 12
          ? 'bg-[rgb(var(--score-fair))]'
          : 'bg-[rgb(var(--score-poor))]';

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'pill pill-ghost inline-flex items-center gap-1.5 px-2 py-1 min-h-0',
        size === 'sm' ? 'text-meta-sm' : 'text-meta',
      )}
      title={
        isPt
          ? 'Hora da última actualização de condições (Open-Meteo)'
          : 'Time of last conditions update (Open-Meteo)'
      }
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} aria-hidden />
      {hoursAgo !== null ? (
        <span className="font-mono tabular-nums text-fg-muted">
          {t.hero.updatedAgo.replace('{hours}', String(hoursAgo))}
        </span>
      ) : (
        <span className="text-fg-muted">{t.hero.statusNoData}</span>
      )}
      <span aria-hidden className="text-fg-subtle">
        ·
      </span>
      <span className="text-fg-muted">{label}</span>
    </span>
  );
}
