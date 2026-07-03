interface TickerStat {
  /** Short label, e.g. "Onda" / "Vento" / "Updated". */
  label: string;
  /** Value with unit, e.g. "1.5m", "12kt", "2h". */
  value: string;
  /** Optional icon as a Lucide node (rendered small). */
  icon?: React.ReactNode;
  /** Accessibility label overrides the visible text. */
  ariaLabel?: string;
}

interface HeroTickerProps {
  /** Best-window label (e.g. "Epic 14h–17h" or "Marginal"). */
  bestWindowLabel?: string;
  /** Aggregated data line — best spot, vento médio, onda média, freshness. */
  stats: TickerStat[];
  locale: string;
}

const SEPARATOR = <span aria-hidden className="text-fg-subtle/40">·</span>;

/**
 * Discrete live-data ticker. Geist Mono, sits at the bottom of the hero.
 * Pure data, no decoration — reinforces "this is a live data product".
 */
export default function HeroTicker({ bestWindowLabel, stats, locale }: HeroTickerProps) {
  const isPt = locale === 'pt';
  const liveDot = (
    <span
      aria-hidden
      className="inline-block w-1.5 h-1.5 rounded-full bg-score-good shadow-[0_0_6px_rgb(var(--score-good)/0.7)]"
    />
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 px-3 sm:px-4 py-2 rounded-pill bg-bg-base/55 backdrop-blur-md border border-divider"
    >
      <span className="inline-flex items-center gap-1.5 text-meta font-medium text-fg">
        {liveDot}
        {isPt ? 'AO VIVO' : 'LIVE'}
      </span>
      {bestWindowLabel && (
        <>
          {SEPARATOR}
          <span className="font-mono tabular-nums text-meta text-fg truncate max-w-[180px] sm:max-w-[260px]">
            {bestWindowLabel}
          </span>
        </>
      )}
      {stats.map((s, i) => (
        <span key={`${s.label}-${i}`} className="inline-flex items-center gap-1.5">
          {SEPARATOR}
          <span className="text-meta text-fg-muted">{s.label}</span>
          <span
            className="font-mono tabular-nums text-meta text-fg"
            aria-label={s.ariaLabel ?? `${s.label} ${s.value}`}
          >
            {s.value}
          </span>
        </span>
      ))}
    </div>
  );
}
