import { AlertTriangle } from 'lucide-react';
import {
  formatForecastUpdatedParts,
  getAgeHours,
} from '@/lib/dataFreshness';
import {
  HERO_FORECAST_LAYERS,
  getHeroFreshnessTitle,
} from '@/lib/heroDataProvenance';
import type { BuoyLayerMeta } from '@/lib/pipelineMeta';

interface HeroTickerProps {
  updatedAtTs?: number | null;
  locale: string;
  /** e.g. "6 spots firing" — live count for current sport filter */
  statusLine?: string;
  /** IH buoy layer state from pipeline-meta.json — warning when not ok. */
  buoyLayer?: BuoyLayerMeta | null;
}

const SEP = <span aria-hidden className="text-fg-subtle/40">·</span>;

function freshnessDotClass(ageHours: number | null): string {
  if (ageHours === null) return 'bg-fg-subtle';
  if (ageHours < 3) return 'bg-score-good';
  if (ageHours < 12) return 'bg-score-fair';
  return 'bg-score-poor';
}

/** Short pt/en labels for each non-ok buoy state. */
function buoyLayerLabel(status: NonNullable<BuoyLayerMeta>['status'], isPt: boolean): string {
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

export default function HeroTicker({ updatedAtTs, locale, statusLine, buoyLayer }: HeroTickerProps) {
  const isPt = locale === 'pt';
  const ageHours = updatedAtTs != null ? getAgeHours(updatedAtTs) : null;
  const updated =
    updatedAtTs != null ? formatForecastUpdatedParts(updatedAtTs, locale) : null;
  const buoyStatus = buoyLayer && buoyLayer.status !== 'ok' ? buoyLayer.status : null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={
        statusLine
          ? isPt
            ? `${statusLine}. Actualização das previsões e fontes de dados`
            : `${statusLine}. Forecast update time and data sources`
          : isPt
            ? 'Actualização das previsões e fontes de dados'
            : 'Forecast update time and data sources'
      }
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
              {isPt ? 'Hora de actualização indisponível' : 'Update time unavailable'}
            </span>
          )}
        </span>

        {buoyStatus ? (
          <span
            className="inline-flex items-center gap-1 shrink-0"
            title={
              isPt
                ? 'Camada de onda observada (boias IH) indisponível — alturas de onda são previsão do modelo'
                : 'Observed-wave layer (IH buoys) unavailable — wave heights are model forecasts'
            }
          >
            {SEP}
            <AlertTriangle
              className={`w-3.5 h-3.5 ${buoyStatus === 'no-key' ? 'text-score-fair' : 'text-score-poor'}`}
              aria-hidden
            />
            <span
              className={`font-medium ${buoyStatus === 'no-key' ? 'text-score-fair' : 'text-score-poor'}`}
            >
              {buoyLayerLabel(buoyStatus, isPt)}
            </span>
          </span>
        ) : null}

        {HERO_FORECAST_LAYERS.map((layer) => (
          <span key={layer.key} className="inline-flex items-center gap-1 shrink-0">
            {SEP}
            <span
              className="inline-flex items-center gap-1"
              title={isPt ? layer.detailPt : layer.detailEn}
            >
              <span className="text-fg-muted">{isPt ? layer.labelPt : layer.labelEn}</span>
              <span className="font-medium text-fg">{isPt ? layer.sourcePt : layer.sourceEn}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
