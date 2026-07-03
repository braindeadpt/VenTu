interface TickerStat {
  label: string;
  value: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

interface HeroTickerProps {
  bestWindowLabel?: string;
  stats: TickerStat[];
  locale: string;
}

const SEP = <span aria-hidden className="text-fg-subtle/40">·</span>;

function TickerItems({ bestWindowLabel, stats, locale }: { bestWindowLabel?: string; stats: TickerStat[]; locale: string }) {
  const isPt = locale === 'pt';
  const liveDot = (
    <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-score-good shadow-[0_0_6px_rgb(var(--score-good)/0.7)]" />
  );
  return (
    <>
      <span className="inline-flex items-center gap-1.5 text-meta font-medium text-fg shrink-0">
        {liveDot}
        {isPt ? 'AO VIVO' : 'LIVE'}
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
      className="pointer-events-auto w-full flex items-center px-0 sm:px-1 py-0 overflow-hidden"
    >
      {/* Desktop: static. Mobile: marquee loop */}
      <span className="inline-flex flex-nowrap items-center gap-2 sm:gap-3 motion-safe:animate-marquee sm:animate-none">
        <TickerItems {...props} />
        <span className="sm:hidden" aria-hidden><TickerItems {...props} /></span>
      </span>
    </div>
  );
}
