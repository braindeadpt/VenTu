'use client';

import { buildSwellTrains, totalSwellPowerKw, type SwellTrainConditions } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';
import { cn } from '@/lib/cn';

interface SwellTrainsTableProps {
  conditions: SwellTrainConditions;
  locale: string;
}

export default function SwellTrainsTable({ conditions, locale }: SwellTrainsTableProps) {
  const trains = buildSwellTrains(conditions);
  if (trains.length === 0) return null;

  const isPt = locale === 'pt';
  const total = totalSwellPowerKw(conditions);

  const trainLabel = (key: (typeof trains)[0]['key']) =>
    key === 'primary'
      ? isPt
        ? 'Primário'
        : 'Primary'
      : isPt
        ? 'Secundário'
        : 'Secondary';

  return (
    <div className="w-full space-y-2">
      <h3 className="text-meta font-semibold text-fg-muted uppercase tracking-wide">
        {isPt ? 'Ondulação' : 'Swell'}
      </h3>
      <ul className="space-y-1.5" role="list">
        {trains.map((train) => (
          <li
            key={train.key}
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-2 text-meta',
              train.isDominant
                ? 'bg-surface-2 border border-divider-strong'
                : 'bg-surface-1/[0.04] border border-divider/60',
            )}
          >
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                train.key === 'primary' ? 'bg-data-waves' : 'bg-data-waves/60',
              )}
              aria-hidden
            />
            {train.isDominant && (
              <span className="text-data-waves" aria-hidden>
                ★
              </span>
            )}
            <span className="text-fg-muted min-w-[4.5rem]">{trainLabel(train.key)}</span>
            <span className="font-mono tabular-nums text-fg font-medium">
              {getCardinalLabel(train.direction)}
            </span>
            <span className="text-fg-subtle" aria-hidden>
              ·
            </span>
            <span className="font-mono tabular-nums text-fg">
              {train.height.toFixed(1)}m
            </span>
            <span className="text-fg-subtle" aria-hidden>
              ·
            </span>
            <span className="font-mono tabular-nums text-fg">
              {train.period.toFixed(1)}s
            </span>
            <span className="text-fg-subtle" aria-hidden>
              ·
            </span>
            <span className="font-mono tabular-nums text-fg-muted">
              {train.powerKw.toFixed(1)} kW/m
            </span>
          </li>
        ))}
      </ul>
      {trains.length > 1 && (
        <p className="text-meta text-fg-muted font-mono tabular-nums">
          {isPt ? 'Total' : 'Total'}:{' '}
          <span className="text-fg font-medium">{total.toFixed(1)} kW/m</span>
        </p>
      )}
    </div>
  );
}
