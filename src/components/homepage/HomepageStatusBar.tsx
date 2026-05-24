'use client';

interface HomepageStatusBarProps {
  locale: string;
  hoursSinceMin: number;
  maxTs: number | null;
  minTs: number | null;
  spotCount: number;
}

export default function HomepageStatusBar({
  locale,
  hoursSinceMin,
  maxTs,
  minTs,
  spotCount,
}: HomepageStatusBarProps) {
  const isPt = locale === 'pt';

  const dotColor =
    hoursSinceMin < 3
      ? 'bg-[rgb(var(--score-good))]'
      : hoursSinceMin < 12
        ? 'bg-[rgb(var(--score-fair))]'
        : 'bg-[rgb(var(--score-poor))]';

  const tooltip = isPt
    ? hoursSinceMin < 3
      ? 'Dados frescos (menos de 3 horas)'
      : hoursSinceMin < 12
        ? 'Dados ligeiramente desactualizados (3–12 horas)'
        : 'Dados muito desactualizados (mais de 12 horas)'
    : hoursSinceMin < 3
      ? 'Fresh data (under 3 hours)'
      : hoursSinceMin < 12
        ? 'Slightly stale data (3–12 hours)'
        : 'Very stale data (over 12 hours)';

  return (
    <section
      role="status"
      aria-live="polite"
      className="w-full bg-surface-1 border-b border-divider z-30 sticky top-16"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 sm:h-10 flex items-center">
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-meta text-fg-muted min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${hoursSinceMin < 12 ? 'animate-pulse' : ''}`}
            title={tooltip}
            aria-label={tooltip}
          />
          <span className="truncate">
            {minTs
              ? `${isPt ? 'Actualizado às' : 'Updated at'} ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(maxTs!))} · ${isPt ? 'a cada 3h' : 'every 3h'} · ${spotCount} ${isPt ? 'spots monitorizados' : 'spots monitored'}`
              : isPt
                ? 'Sem dados de condições'
                : 'No condition data'}
          </span>
        </div>
      </div>
    </section>
  );
}
