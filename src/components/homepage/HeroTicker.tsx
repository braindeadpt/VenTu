import { formatForecastUpdatedAt } from '@/lib/dataFreshness';

interface TickerStat {
  label: string;
  value: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

interface HeroTickerProps {
  updatedAtTs?: number | null;
  bestWindowLabel?: string;
  stats: TickerStat[];
  locale: string;
}

const SEP = <span aria-hidden className="text-fg-subtle/40">·</span>;

function freshnessDotClass(ageHours: number | null): string {
  if (ageHours === null) return 'bg-fg-subtle';
  if (ageHours < 3) return 'bg-score-good shadow-[0_0_6px_rgb(var(--score-good)/0.7)]';
  if (ageHours < 12) return 'bg-score-fair';
  return 'bg-score-poor';
}

function TickerItems({
  updatedAtTs,
  bestWindowLabel,
  stats,
  locale,
}: {
  updatedAtTs?: number | null;
  bestWindowLabel?: string;
  stats: TickerStat[];
  locale: string;
}) {
  const isPt = locale === 'pt';
  const ageHours =
    updatedAtTs != null ? Math.max(0, (Date.now() - updatedAtTs) / 3600000) : null;
  const updatedLabel =
    updatedAtTs != null
      ? formatForecastUpdatedAt(updatedAtTs, locale)
      : isPt
        ? 'Sem hora de actualização'
        : 'Update time unavailable';

  return (
    <>
      <span
        className="inline-flex items-center gap-1.5 text-meta font-medium text-fg shrink-0"
        title={
          isPt
            ? 'Hora da última actualização das previsões (Open-Meteo)'
            : 'Last forecast update time (Open-Meteo)'
        }
      >
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full ${freshnessDotClass(ageHours)}`}
        />
        <time dateTime={updatedAtTs != null ? new Date(updatedAtTs).toISOString() : undefined}>
          {updatedLabel}
        </time>
      </span>
      {bestWindowLabel && (
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {SEP}
          <span className="font-mono tabular-nums text-meta text-fg truncate max-w-[180px] sm:max-w-[260px]">
            {bestWindowLabel}
          </span>
        </span>
      )}
      {stats.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 shrink-0">
          {SEP}
          <span className="text-meta text-fg-muted">{s.label}</span>
          <span className="font-mono tabular-nums text-meta text-fg" aria-label={s.ariaLabel ?? `${s.label} ${s.value}`}>
            {s.value}
          </span>
        </span>
      ))}
    </>
  );
}

export default function HeroTicker(props: HeroTickerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-full flex items-center px-0 sm:px-1 py-0 overflow-hidden [text-shadow:0_1px_12px_rgb(var(--bg-base)/0.85)]"
    >
      {/* Desktop: static. Mobile: marquee loop */}
      <span className="inline-flex flex-nowrap items-center gap-2 sm:gap-3 motion-safe:animate-marquee sm:animate-none">
        <TickerItems {...props} />
        <span className="sm:hidden" aria-hidden><TickerItems {...props} /></span>
      </span>
    </div>
  );
}
