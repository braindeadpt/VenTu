import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { AlertTriangle, Anchor } from 'lucide-react';
import { STALE_THRESHOLD_HOURS, formatForecastUpdatedAt } from '@/lib/dataFreshness';
import type { BuoyLayerMeta, CoastalWarningsLayerMeta } from '@/lib/pipelineMeta';
import {
  deriveBuoyLayerDowntime,
  formatBuoyLayerDowntimeSuffix,
  formatBuoyLayerDowntimeTitle,
} from '@/lib/buoyLayerDowntime';
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
  /** Coastal navigation warnings (IH) layer — fetch/em vigor/cobertura. */
  coastalWarningsLayer?: CoastalWarningsLayerMeta | null;
}

type UiLabels = ReturnType<typeof getTranslation>['ui'];

/** Etiquetas curtas por estado não-ok da camada de boias. */
function buoyLayerLabel(status: BuoyLayerMeta['status'], t: UiLabels): string {
  switch (status) {
    case 'no-key':
      return t.buoyNoKey;
    case 'down':
      return t.buoyDown;
    case 'stale':
      return t.buoyStale;
    default:
      return '';
  }
}

function coastalLayerLabel(status: NonNullable<CoastalWarningsLayerMeta>['status'], t: UiLabels): string {
  switch (status) {
    case 'down':
      return t.coastalNoData;
    case 'stale':
      return t.coastalStale;
    default:
      return '';
  }
}

/** Tag BCP-47 para datas/horas (Intl), por locale do site. */
const DATE_LOCALE: Record<string, string> = {
  pt: 'pt-PT',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
};

export default function FreshnessIndicator({
  hoursAgo,
  updatedAtTs,
  locale,
  sourceLabel,
  size = 'md',
  compact = false,
  buoyLayer,
  coastalWarningsLayer,
}: FreshnessIndicatorProps) {
  const dateLocale = DATE_LOCALE[locale] ?? 'en-GB';
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
  // Streak down/stale (só down/stale com streak > 0 — no-key nunca conta):
  // «há quantas horas a onda observada está degradada», do pipeline-meta.
  const buoyDowntime = deriveBuoyLayerDowntime(buoyLayer);

  return (
    <span
      role="status"
      aria-live="polite"
      data-visual-dynamic
      className={cn(
        'pill pill-ghost inline-flex items-center gap-1.5 px-2 py-1 min-h-0',
        size === 'sm' ? 'text-meta-sm' : 'text-meta',
      )}
      title={t.ui.freshnessTitle}
    >
      {buoyStatus ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 shrink-0',
            buoyStatus === 'no-key' ? 'text-score-fair' : 'text-score-poor',
          )}
          title={`${t.ui.buoyLayerTitle}${
            buoyDowntime ? ` · ${formatBuoyLayerDowntimeTitle(buoyDowntime, locale)}` : ''
          }`}
        >
          <AlertTriangle className="w-3 h-3" aria-hidden />
          <span className="font-medium" data-buoy-streak="true">
            {buoyLayerLabel(buoyStatus, t.ui)}
            {buoyDowntime ? formatBuoyLayerDowntimeSuffix(buoyDowntime) : ''}
          </span>
        </span>
      ) : null}
      {coastalWarningsLayer ? (
        coastalWarningsLayer.status !== 'ok' ? (
          <span
            className="inline-flex items-center gap-1 shrink-0 text-score-poor"
            title={
              (coastalWarningsLayer.status === 'down' ? t.ui.coastalDownTitle : t.ui.coastalStaleTitle) +
              (coastalWarningsLayer.fetchedAt
                ? t.ui.lastFetch.replace(
                    '{when}',
                    new Date(coastalWarningsLayer.fetchedAt).toLocaleString(dateLocale),
                  )
                : '')
            }
          >
            <AlertTriangle className="w-3 h-3" aria-hidden />
            <span className="font-medium">{coastalLayerLabel(coastalWarningsLayer.status, t.ui)}</span>
          </span>
        ) : coastalWarningsLayer.activeWarnings != null && coastalWarningsLayer.activeWarnings > 0 ? (
          <span
            className="inline-flex items-center gap-1 shrink-0 text-score-fair"
            title={
              t.ui.coastalActiveTitle
                .replace('{count}', String(coastalWarningsLayer.activeWarnings))
                .replace('{spots}', String(coastalWarningsLayer.coveredSpots ?? 0)) +
              (coastalWarningsLayer.fetchedAt
                ? t.ui.fetchedAt.replace(
                    '{when}',
                    new Date(coastalWarningsLayer.fetchedAt).toLocaleString(dateLocale),
                  )
                : '')
            }
          >
            <Anchor className="w-3 h-3" aria-hidden />
            <span className="font-medium">
              {t.ui.coastalActiveLabel
                .replace('{count}', String(coastalWarningsLayer.activeWarnings))
                .replace('{spots}', String(coastalWarningsLayer.coveredSpots ?? 0))}
            </span>
          </span>
        ) : null
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
