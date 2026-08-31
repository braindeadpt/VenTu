import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { AlertTriangle } from 'lucide-react';
import { STALE_THRESHOLD_HOURS, formatForecastUpdatedAt } from '@/lib/dataFreshness';
import type { BuoyLayerMeta } from '@/lib/pipelineMeta';
import { cn } from '@/lib/cn';

interface FreshnessIndicatorProps {
  hoursAgo: number | null;
  updatedAtTs?: number | null;
  locale: string;
  sourceLabel?: string;
  size?: 'sm' | 'md';
  /** Header bar: só hora + ponto (esconde fonte até 2xl). */
  compact?: boolean;
  /** IH buoy layer state from pipeline-meta.json — shows a warning when the
   *  observed-wave layer is disabled/down/stale (diagnostics surface). */
  buoyLayer?: BuoyLayerMeta | null;
}

/** Short pt/en labels for each non-ok buoy state. */
function buoyLayerLabel(status: BuoyLayerMeta['status'], isPt: boolean): string {
  switch (status) {
    case 'no-key':
      return isPt ? 'Boias: sem key' : 'Buoys: no key';
    case 'down':
      return isPt ? 'Boias: em baixo' : 'Buoys: down';
    case 'stale':
      return isPt ? 'Boias: leituras antigas' : 'Buoys: stale';
    default:
      return '';
  }
}

export default function FreshnessIndicator({
  hoursAgo,
  updatedAtTs,
  locale,
  sourceLabel,
  size = 'md',
  compact = false,
  buoyLayer,
}: FreshnessIndicatorProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as Locale);
  const label = sourceLabel ?? t.hero.gridStatusSource;

  if (hoursAgo === null && updatedAtTs == null) {
    return null;
  }

  const dotClass =
    hoursAgo === null
      ? 'bg-fg-subtle'
      : hoursAgo < STALE_THRESHOLD_HOURS
        ? 'bg-[rgb(var(--score-good))]'
        : hoursAgo < 12
          ? 'bg-[rgb(var(--score-fair))]'
          : 'bg-[rgb(var(--score-poor))]';

  const timeLabel =
    updatedAtTs != null ? formatForecastUpdatedAt(updatedAtTs, locale) : null;

  const buoyStatus = buoyLayer && buoyLayer.status !== 'ok' ? buoyLayer.status : null;

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
          ? 'Hora da última actualização de condições (Open-Meteo, 2h de dia / 4h de noite Lisboa)'
          : 'Last conditions update (Open-Meteo, 2h daytime / 4h night Lisbon)'
      }
    >
      {buoyStatus ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 shrink-0',
            buoyStatus === 'no-key' ? 'text-score-fair' : 'text-score-poor',
          )}
          title={
            isPt
              ? 'Camada de onda observada (boias IH) indisponível — alturas de onda são previsão do modelo'
              : 'Observed-wave layer (IH buoys) unavailable — wave heights are model forecasts'
          }
        >
          <AlertTriangle className="w-3 h-3" aria-hidden />
          <span className="font-medium">{buoyLayerLabel(buoyStatus, isPt)}</span>
        </span>
      ) : null}
      <span className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} aria-hidden />
      {timeLabel ? (
        <time
          className="font-mono tabular-nums text-fg-muted"
          dateTime={new Date(updatedAtTs!).toISOString()}
        >
          {timeLabel}
        </time>
      ) : hoursAgo !== null ? (
        <span className="font-mono tabular-nums text-fg-muted">
          {t.hero.updatedAgo.replace('{hours}', String(hoursAgo))}
        </span>
      ) : (
        <span className="text-fg-muted">{t.hero.statusNoData}</span>
      )}
      <span aria-hidden className={cn('text-fg-subtle', compact && 'hidden 2xl:inline')}>
        ·
      </span>
      <span className={cn('text-fg-muted', compact && 'hidden 2xl:inline')}>{label}</span>
    </span>
  );
}
