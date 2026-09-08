'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Anchor } from 'lucide-react';
import {
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
  /**
   * Build-time clock from the server page (SSG). Freshness dot / age gates use
   * this until mount so the first client paint matches the baked HTML
   * (React #418); after mount the live clock takes over.
   */
  bakedAtMs?: number;
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

function coastalLayerLabel(status: NonNullable<CoastalWarningsLayerMeta>['status'], isPt: boolean): string {
  switch (status) {
    case 'down':
      return isPt ? 'Avisos costeiros: sem dados' : 'Coastal warnings: no data';
    case 'stale':
      return isPt ? 'Avisos costeiros: desactualizados' : 'Coastal warnings: stale';
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
  bakedAtMs,
}: HeroTickerProps) {
  const isPt = locale === 'pt';
  // Pin freshness to the bake clock until mount (same pattern as SpotDetailClient).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const freshnessNowMs = mounted ? undefined : bakedAtMs;

  const ageHours =
    updatedAtTs != null ? getAgeHours(updatedAtTs, freshnessNowMs) : null;
  const updated =
    updatedAtTs != null ? formatForecastUpdatedParts(updatedAtTs, locale) : null;
  const buoyStatus = buoyLayer && buoyLayer.status !== 'ok' ? buoyLayer.status : null;
  // Streak down/stale (só down/stale com streak > 0 — no-key nunca conta):
  // «há quantas horas a onda observada está degradada», do pipeline-meta.
  const buoyDowntime = deriveBuoyLayerDowntime(buoyLayer, freshnessNowMs);
  const coastalStatus =
    coastalWarningsLayer && coastalWarningsLayer.status !== 'ok'
      ? coastalWarningsLayer.status
      : null;
  const coastalActive =
    coastalWarningsLayer && coastalWarningsLayer.status === 'ok'
      ? coastalWarningsLayer.activeWarnings
      : 0;

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
            suppressHydrationWarning
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
                ? 'Camada de onda observada (boias IH) indisponível — alturas de onda são previsão do modelo' +
                  (buoyDowntime ? ` · ${formatBuoyLayerDowntimeTitle(buoyDowntime, true)}` : '')
                : 'Observed-wave layer (IH buoys) unavailable — wave heights are model forecasts' +
                  (buoyDowntime ? ` · ${formatBuoyLayerDowntimeTitle(buoyDowntime, false)}` : '')
            }
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
              {buoyLayerLabel(buoyStatus, isPt)}
              {buoyDowntime ? formatBuoyLayerDowntimeSuffix(buoyDowntime, isPt) : ''}
            </span>
          </span>
        ) : null}

        {coastalStatus ? (
          <span
            className="inline-flex items-center gap-1 shrink-0"
            title={
              isPt
                ? `Camada de avisos costeiros (IH) ${coastalStatus === 'down' ? 'sem dados' : 'desactualizada'}` +
                  (coastalWarningsLayer?.fetchedAt
                    ? ` — última fetch ${new Date(coastalWarningsLayer.fetchedAt).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}`
                    : '')
                : `Coastal warnings (IH) layer ${coastalStatus === 'down' ? 'down' : 'stale'}` +
                  (coastalWarningsLayer?.fetchedAt
                    ? ` — last fetch ${new Date(coastalWarningsLayer.fetchedAt).toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' })}`
                    : '')
            }
          >
            {SEP}
            <AlertTriangle
              className="w-3.5 h-3.5 text-score-poor"
              aria-hidden
            />
            <span className="font-medium text-score-poor">
              {coastalLayerLabel(coastalStatus, isPt)}
            </span>
          </span>
        ) : coastalActive != null && coastalActive > 0 ? (
          <span
            className="inline-flex items-center gap-1 shrink-0"
            title={
              isPt
                ? `${coastalActive} avisos à navegação costeiros (IH) em vigor · ` +
                  `${coastalWarningsLayer?.coveredSpots ?? 0} spots cobertos` +
                  (coastalWarningsLayer?.fetchedAt
                    ? ` · fetch ${new Date(coastalWarningsLayer.fetchedAt).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}`
                    : '')
                : `${coastalActive} coastal navigation warnings (IH) in force · ` +
                  `${coastalWarningsLayer?.coveredSpots ?? 0} spots covered` +
                  (coastalWarningsLayer?.fetchedAt
                    ? ` · fetched ${new Date(coastalWarningsLayer.fetchedAt).toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' })}`
                    : '')
            }
          >
            {SEP}
            <Anchor className="w-3.5 h-3.5 text-score-fair" aria-hidden />
            <span className="font-medium text-score-fair">
              {isPt
                ? `${coastalActive} avisos · ${coastalWarningsLayer?.coveredSpots ?? 0} spots`
                : `${coastalActive} warnings · ${coastalWarningsLayer?.coveredSpots ?? 0} spots`}
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
