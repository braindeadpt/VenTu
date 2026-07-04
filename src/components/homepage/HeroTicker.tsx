import {
  formatForecastUpdatedParts,
  getAgeHours,
} from '@/lib/dataFreshness';
import {
  HERO_FORECAST_LAYERS,
  getHeroFreshnessTitle,
} from '@/lib/heroDataProvenance';

interface HeroTickerProps {
  updatedAtTs?: number | null;
  locale: string;
  /** e.g. "6 spots firing" — live count for current sport filter */
  statusLine?: string;
}

const SEP = <span aria-hidden className="text-fg-subtle/40">·</span>;

function freshnessDotClass(ageHours: number | null): string {
  if (ageHours === null) return 'bg-fg-subtle';
  if (ageHours < 3) return 'bg-score-good shadow-[0_0_6px_rgb(var(--score-good)/0.7)]';
  if (ageHours < 12) return 'bg-score-fair';
  return 'bg-score-poor';
}

function TickerItems({ updatedAtTs, locale, statusLine }: HeroTickerProps) {
  const isPt = locale === 'pt';
  const ageHours = updatedAtTs != null ? getAgeHours(updatedAtTs) : null;
  const updated =
    updatedAtTs != null ? formatForecastUpdatedParts(updatedAtTs, locale) : null;

  return (
    <>
      {statusLine ? (
        <>
          <span className="text-meta font-medium text-fg shrink-0" suppressHydrationWarning>
            {statusLine}
          </span>
          {SEP}
        </>
      ) : null}
      <span
        className="inline-flex items-center gap-1.5 shrink-0"
        title={updatedAtTs != null ? getHeroFreshnessTitle(locale, updatedAtTs) : undefined}
      >
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full ${freshnessDotClass(ageHours)}`}
        />
        {updated ? (
          <time
            dateTime={new Date(updatedAtTs!).toISOString()}
            className="inline-flex items-baseline gap-1 text-meta"
          >
            <span className="text-fg-muted font-medium">{updated.prefix}</span>
            <span className="font-mono tabular-nums text-fg">{updated.datePart}</span>
            <span className="font-mono tabular-nums text-fg">{updated.timePart}</span>
          </time>
        ) : (
          <span className="text-meta text-fg-muted">
            {isPt ? 'Hora de actualização indisponível' : 'Update time unavailable'}
          </span>
        )}
      </span>

      {HERO_FORECAST_LAYERS.map((layer) => (
        <span key={layer.key} className="inline-flex items-center gap-1 shrink-0">
          {SEP}
          <span
            className="inline-flex items-center gap-1 text-meta"
            title={isPt ? layer.detailPt : layer.detailEn}
          >
            <span className="text-fg-muted">{isPt ? layer.labelPt : layer.labelEn}</span>
            <span className="font-medium text-fg">{isPt ? layer.sourcePt : layer.sourceEn}</span>
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
      aria-label={
        props.statusLine
          ? props.locale === 'pt'
            ? `${props.statusLine}. Actualização das previsões e fontes de dados`
            : `${props.statusLine}. Forecast update time and data sources`
          : props.locale === 'pt'
            ? 'Actualização das previsões e fontes de dados'
            : 'Forecast update time and data sources'
      }
      className="pointer-events-auto w-full flex items-center px-0 sm:px-1 py-0 overflow-hidden [text-shadow:0_1px_12px_rgb(var(--bg-base)/0.85)]"
    >
      <span className="inline-flex flex-nowrap items-center gap-2 sm:gap-3 motion-safe:animate-marquee sm:animate-none">
        <TickerItems {...props} />
        <span className="sm:hidden" aria-hidden>
          <TickerItems {...props} />
        </span>
      </span>
    </div>
  );
}
