'use client';

import type { ObservedConditions } from '@/lib/observations';
import {
  formatObservedClockTime,
  forecastWindKtFromMs,
  isObservedFresh,
  observedSectionTitle,
  observedSourceLabel,
  observedWindDisclaimer,
  verificationBadge,
  verifyWind,
} from '@/lib/observations';
import WindSourceAttributionNote from '@/components/ui/WindSourceAttributionNote';
import { getTranslation } from '@/lib/i18n';
import { useObservedNow } from '@/hooks/useObservedNow';
import { cn } from '@/lib/cn';

interface ObservedNowProps {
  /** Baked fallback from conditions.json (pipeline, ≤3 h when fresh). */
  observed?: ObservedConditions | null;
  forecastWindSpeedMs: number;
  locale: string;
  lat: number;
  lon: number;
}

export default function ObservedNow({
  observed: bakedObserved,
  forecastWindSpeedMs,
  locale,
  lat,
  lon,
}: ObservedNowProps) {
  const { observed: liveObserved, loading, error } = useObservedNow(lat, lon);

  const bakedFresh =
    bakedObserved && isObservedFresh(bakedObserved.observedAt) ? bakedObserved : null;

  const fromLive = Boolean(liveObserved && !error);
  const displayObserved = fromLive ? liveObserved : bakedFresh;
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotVerify;

  if (!displayObserved || !isObservedFresh(displayObserved.observedAt)) {
    if (loading) {
      return (
        <section
          className="rounded-card border border-divider bg-surface-1/[0.04] p-3"
          aria-busy
          aria-label={tv.checkingLiveAria}
        >
          <p className="text-meta text-fg-muted">
            {tv.checkingLive}
          </p>
        </section>
      );
    }
    if (error) {
      return (
        <section
          role="status"
          className="rounded-card border border-divider bg-surface-1/[0.04] p-3"
        >
          <p className="text-meta text-fg-muted">
            {tv.liveObsUnavailable}
          </p>
        </section>
      );
    }
    return null;
  }

  return (
    <ObservedNowContent
      observed={displayObserved}
      forecastWindSpeedMs={forecastWindSpeedMs}
      locale={locale}
      fromLive={fromLive}
      loadingLive={loading && !fromLive && Boolean(bakedFresh)}
    />
  );
}

function ObservedNowContent({
  observed,
  forecastWindSpeedMs,
  locale,
  fromLive,
  loadingLive,
}: {
  observed: ObservedConditions;
  forecastWindSpeedMs: number;
  locale: string;
  fromLive: boolean;
  loadingLive: boolean;
}) {
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotVerify;
  const fresh = isObservedFresh(observed.observedAt);
  const forecastKt = forecastWindKtFromMs(forecastWindSpeedMs);
  const verification = verifyWind(forecastKt, observed.windSpeedKt);
  const badge = verificationBadge(verification.agreement, locale);
  const cardinal =
    isPt ? observed.windCardinal : (observed.windCardinalEn ?? observed.windCardinal);
  const clock = formatObservedClockTime(observed.observedAt, locale);
  const sourceLabel = observedSourceLabel(observed.source, locale);
  const title = observedSectionTitle(observed.source, fresh, locale);

  const metaLine = tv.observedMeta
    .replace('{clock}', clock)
    .replace('{station}', observed.stationName)
    .replace('{dist}', observed.distanceKm.toFixed(1))
    .replace('{source}', sourceLabel);

  return (
    <section
      className={cn(
        'rounded-card border p-3 space-y-3',
        fresh
          ? 'border-divider bg-surface-1/[0.04]'
          : 'border-divider/60 bg-surface-1/[0.02] opacity-80',
        loadingLive && 'opacity-90',
      )}
      aria-label={title}
      aria-busy={loadingLive}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h3 className={cn('text-meta font-semibold', fresh ? 'text-fg' : 'text-fg-muted')}>
          {title}
          {fromLive && fresh && (
            <span className="ml-1.5 text-meta-sm font-normal text-fg-subtle">{tv.live}</span>
          )}
        </h3>
        <p className="text-meta-sm text-fg-subtle">{metaLine}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-meta">
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">
            {tv.windWithSource.replace('{source}', sourceLabel)}
          </p>
          <p className="font-mono tabular-nums font-semibold text-fg">
            {observed.windSpeedKt} kt {cardinal}
          </p>
          {observed.tempC != null && (
            <p className="text-meta-sm text-fg-subtle font-mono tabular-nums mt-0.5">
              {observed.tempC.toFixed(1)}°C
            </p>
          )}
        </div>
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">{tv.modelForecast}</p>
          <p className="font-mono tabular-nums font-semibold text-fg">
            {verification.forecastWindKt} kt
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 flex flex-col justify-center">
          <span
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-pill border px-2.5 py-1.5 text-meta-sm font-medium w-full sm:w-auto',
              badge.className,
            )}
            title={tv.deltaKtTitle.replace(
              '{delta}',
              `${verification.deltaKt >= 0 ? '+' : ''}${verification.deltaKt}`,
            )}
          >
            <span aria-hidden>{badge.symbol}</span>
            {badge.label}
          </span>
        </div>
      </div>

      <p className="text-meta-sm text-fg-subtle leading-snug">
        {observedWindDisclaimer(observed.source, locale)}
      </p>

      <span className="inline-flex">
        <WindSourceAttributionNote
          source={observed.source}
          locale={isPt ? 'pt' : 'en'}
        />
      </span>
    </section>
  );
}
