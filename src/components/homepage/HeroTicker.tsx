import { getTranslation } from '@/lib/i18n';
import { AlertTriangle } from 'lucide-react';
import {
  DATE_LOCALE,
  formatForecastUpdatedParts,
  getAgeHours,
} from '@/lib/dataFreshness';
import {
  HERO_FORECAST_LAYERS,
  getHeroFreshnessTitle,
} from '@/lib/heroDataProvenance';
import type { BuoyLayerMeta, CoastalWarningsLayerMeta } from '@/lib/pipelineMeta';
import {
  deriveBuoyLayerDowntime,
  formatBuoyLayerDowntimeSuffix,
  formatBuoyLayerDowntimeTitle,
} from '@/lib/buoyLayerDowntime';

interface HeroTickerProps {
  updatedAtTs?: number | null;
  locale: string;
  /** e.g. "6 spots firing" — live count for current sport filter */
  statusLine?: string;
  /** IH buoy layer state from pipeline-meta.json — warning when not ok. */
  buoyLayer?: BuoyLayerMeta | null;
  /** Coastal warnings (IH) layer — fetch/em vigor/cobertura. */
  coastalWarningsLayer?: CoastalWarningsLayerMeta | null;
}

const SEP = <span aria-hidden className="text-fg-subtle/40">·</span>;

function freshnessDotClass(ageHours: number | null): string {
  if (ageHours === null) return 'bg-fg-subtle';
  if (ageHours < 3) return 'bg-score-good';
  if (ageHours < 12) return 'bg-score-fair';
  return 'bg-score-poor';
}

type UiLabels = ReturnType<typeof getTranslation>['ui'];

/** Etiquetas curtas por estado não-ok (mesmas do FreshnessIndicator). */
function buoyLayerLabel(status: NonNullable<BuoyLayerMeta>['status'], t: UiLabels): string {
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

export default function HeroTicker({
  updatedAtTs,
  locale,
  statusLine,
  buoyLayer,
  coastalWarningsLayer,
}: HeroTickerProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const ageHours = updatedAtTs != null ? getAgeHours(updatedAtTs) : null;
  const layerCopy = {
    waves: {
      label: t.homepage.layerWaves,
      detail: 'Marine API · DWD EWAM, ECMWF WAM, GFS Wave, GWAM',
    },
    wind: {
      label: t.homepage.layerWind,
      detail: 'Weather API · ICON-EU, ECMWF IFS, GFS, Météo-France',
    },
    tides: { label: t.homepage.layerTides, detail: t.homepage.layerTidesDetail },
  } as const;
  const updated =
    updatedAtTs != null ? formatForecastUpdatedParts(updatedAtTs, locale) : null;
  const buoyStatus = buoyLayer && buoyLayer.status !== 'ok' ? buoyLayer.status : null;
  // Streak down/stale (só down/stale com streak > 0 — no-key nunca conta):
  // «há quantas horas a onda observada está degradada», do pipeline-meta.
  const buoyDowntime = deriveBuoyLayerDowntime(buoyLayer);
  const coastalStatus =
    coastalWarningsLayer && coastalWarningsLayer.status !== 'ok'
      ? coastalWarningsLayer.status
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={statusLine ? `${statusLine}. ${t.homepage.tickerAria}` : t.homepage.tickerAria}
      className="pointer-events-auto w-full px-0 sm:px-1 py-0"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
        {statusLine ? (
          <>
            <span className="font-medium text-fg shrink-0" suppressHydrationWarning>
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
              className="inline-flex items-baseline gap-1"
            >
              <span className="text-fg-muted font-medium">{updated.prefix}</span>
              <span className="font-mono tabular-nums text-fg">{updated.datePart}</span>
              <span className="font-mono tabular-nums text-fg">{updated.timePart}</span>
            </time>
          ) : (
            <span className="text-fg-muted">
              {t.homepage.updateTimeUnavailable}
            </span>
          )}
        </span>

        {buoyStatus ? (
          <span
            className="inline-flex items-center gap-1 shrink-0"
            title={`${t.ui.buoyLayerTitle}${
              buoyDowntime ? ` · ${formatBuoyLayerDowntimeTitle(buoyDowntime, locale)}` : ''
            }`}
          >
            {SEP}
            <AlertTriangle
              className={`w-3.5 h-3.5 ${buoyStatus === 'no-key' ? 'text-score-fair' : 'text-score-poor'}`}
              aria-hidden
            />
            <span
              className={`font-medium ${buoyStatus === 'no-key' ? 'text-score-fair' : 'text-score-poor'}`}
              data-buoy-streak="true"
            >
              {buoyLayerLabel(buoyStatus, t.ui)}
              {buoyDowntime ? formatBuoyLayerDowntimeSuffix(buoyDowntime) : ''}
            </span>
          </span>
        ) : null}

        {coastalStatus ? (
          <span
            className="inline-flex items-center gap-1 shrink-0"
            title={
              (coastalStatus === 'down' ? t.ui.coastalDownTitle : t.ui.coastalStaleTitle) +
              (coastalWarningsLayer?.fetchedAt
                ? t.ui.lastFetch.replace(
                    '{when}',
                    new Date(coastalWarningsLayer.fetchedAt).toLocaleString(
                      DATE_LOCALE[locale] ?? 'en-GB',
                    ),
                  )
                : '')
            }
          >
            {SEP}
            <AlertTriangle
              className="w-3.5 h-3.5 text-score-poor"
              aria-hidden
            />
            <span className="font-medium text-score-poor">
              {coastalLayerLabel(coastalStatus, t.ui)}
            </span>
          </span>
        ) : null}
        {/* «N avisos em vigor» não se mostra: são avisos À NAVEGAÇÃO do IH
            (luzes apagadas, obras, requisitos) — com ~180 em vigor permanente
            a métrica é ruído, não aviso meteorológico. Só o estado da camada
            (down/stale) interessa ao utilizador. */}

        {HERO_FORECAST_LAYERS.map((layer) => (
          <span key={layer.key} className="inline-flex items-center gap-1 shrink-0">
            {SEP}
            <span className="inline-flex items-center gap-1" title={layerCopy[layer.key].detail}>
              <span className="text-fg-muted">{layerCopy[layer.key].label}</span>
              <span className="font-medium text-fg">{layer.source}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
