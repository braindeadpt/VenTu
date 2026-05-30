'use client';

import type { ObservedConditions } from '@/lib/observations';
import {
  formatObservedAge,
  forecastWindKtFromMs,
  verificationBadge,
  verifyWind,
} from '@/lib/observations';
import { cn } from '@/lib/cn';

interface ObservedNowProps {
  observed: ObservedConditions;
  forecastWindSpeedMs: number;
  locale: string;
}

export default function ObservedNow({
  observed,
  forecastWindSpeedMs,
  locale,
}: ObservedNowProps) {
  const isPt = locale === 'pt';
  const forecastKt = forecastWindKtFromMs(forecastWindSpeedMs);
  const verification = verifyWind(forecastKt, observed.windSpeedKt);
  const badge = verificationBadge(verification.agreement, locale);
  const cardinal =
    isPt ? observed.windCardinal : (observed.windCardinalEn ?? observed.windCardinal);
  const age = formatObservedAge(observed.observedAt, locale);

  return (
    <section
      className="rounded-card border border-divider bg-surface-1/[0.04] p-3 space-y-3"
      aria-label={isPt ? 'Observado agora' : 'Observed now'}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h3 className="text-meta font-semibold text-fg">
          {isPt ? 'Observado agora' : 'Observed now'}
        </h3>
        <p className="text-meta-sm text-fg-subtle">
          {observed.stationName} · {observed.distanceKm.toFixed(1)} km · {age}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-meta">
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">
            {isPt ? 'Vento (IPMA)' : 'Wind (IPMA)'}
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
        {isPt
          ? 'Estação terrestre IPMA — pode diferir do vento no line-up.'
          : 'Land IPMA station — may differ from wind on the water.'}
      </p>
    </section>
  );
}
