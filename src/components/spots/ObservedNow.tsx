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

  if (!displayObserved || !isObservedFresh(displayObserved.observedAt)) {
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
  const fresh = isObservedFresh(observed.observedAt);
  const forecastKt = forecastWindKtFromMs(forecastWindSpeedMs);
  const verification = verifyWind(forecastKt, observed.windSpeedKt);
  const badge = verificationBadge(verification.agreement, locale);
  const cardinal =
    isPt ? observed.windCardinal : (observed.windCardinalEn ?? observed.windCardinal);
  const clock = formatObservedClockTime(observed.observedAt, locale);
  const sourceLabel = observedSourceLabel(observed.source, locale);
  const title = observedSectionTitle(observed.source, fresh, locale);

  const metaLine = isPt
    ? `Observado ${clock} · ${observed.stationName} · ${observed.distanceKm.toFixed(1)} km · ${sourceLabel}`
    : `Observed ${clock} · ${observed.stationName} · ${observed.distanceKm.toFixed(1)} km · ${sourceLabel}`;

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
            <span className="ml-1.5 text-meta-sm font-normal text-fg-subtle">
              {isPt ? '(ao vivo)' : '(live)'}
            </span>
          )}
        </h3>
        <p className="text-meta-sm text-fg-subtle">{metaLine}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-meta">
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">
            {isPt ? `Vento (${sourceLabel})` : `Wind (${sourceLabel})`}
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
          <p className="text-meta-sm text-fg-muted mb-0.5">
            {isPt ? 'Previsão modelo' : 'Model forecast'}
          </p>
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
            title={
              isPt
                ? `Diferença ${verification.deltaKt >= 0 ? '+' : ''}${verification.deltaKt} kt`
                : `Delta ${verification.deltaKt >= 0 ? '+' : ''}${verification.deltaKt} kt`
            }
          >
            <span aria-hidden>{badge.symbol}</span>
            {badge.label}
          </span>
        </div>
      </div>

      <p className="text-meta-sm text-fg-subtle leading-snug">
        {observedWindDisclaimer(observed.source, locale)}
      </p>
    </section>
  );
}
