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
      className="rounded-lg border border-divider bg-surface-2/80 p-3 space-y-2"
      aria-label={isPt ? 'Observado agora' : 'Observed now'}
    >
      <p className="text-meta-sm text-fg-muted leading-snug">
        <span className="font-semibold text-fg">{isPt ? 'Observado agora' : 'Observed now'}</span>
        {' · '}
        {observed.stationName}
        <span className="text-fg-subtle">
          {' '}
          ({observed.distanceKm.toFixed(1)} km) · {age}
        </span>
      </p>

      <p className="text-meta text-fg">
        <span className="text-fg-muted">{isPt ? 'Vento observado' : 'Observed wind'}:</span>{' '}
        <span className="font-mono tabular-nums font-semibold text-fg">
          {observed.windSpeedKt} kt {cardinal}
        </span>
        {observed.tempC != null && (
          <span className="text-fg-subtle font-mono tabular-nums">
            {' '}
            · {observed.tempC.toFixed(1)}°C
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <p className="text-meta-sm text-fg-muted font-mono tabular-nums">
          {isPt ? 'Previsão' : 'Forecast'}{' '}
          <span className="text-fg">{verification.forecastWindKt} kt</span>
          {' · '}
          {isPt ? 'Observado' : 'Observed'}{' '}
          <span className="text-fg">{verification.observedWindKt} kt</span>
        </p>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-meta-sm font-medium',
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

      <p className="text-meta-sm text-fg-subtle leading-snug">
        {isPt
          ? 'Estação meteorológica terrestre IPMA — pode diferir do line-up na praia.'
          : 'IPMA land weather station — may differ from conditions on the beach.'}
      </p>
    </section>
  );
}
