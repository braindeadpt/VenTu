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
    <div className="w-full min-w-0 space-y-2">
      <div>
        <h3 className="text-meta font-semibold text-fg uppercase tracking-wide">
          {isPt ? 'Feixes de ondulação' : 'Swell trains'}
        </h3>
        <p className="text-meta-sm text-fg-muted mt-0.5">
          {isPt
            ? 'Primário e secundário — altura, período, direcção e energia (kW/m).'
            : 'Primary and secondary — height, period, direction and energy (kW/m).'}
        </p>
      </div>
      <div className="overflow-x-auto -mx-1 px-1 rounded-card border border-divider">
        <table className="w-full min-w-[280px] border-collapse text-meta bg-bg-base">
          <thead>
            <tr className="text-fg-muted text-meta-sm bg-surface-1/[0.04]">
              <th scope="col" className="text-left font-medium py-1 pr-2">
                {isPt ? 'Feixe' : 'Train'}
              </th>
              <th scope="col" className="text-left font-medium py-1 pr-2">
                {isPt ? 'Dir.' : 'Dir.'}
              </th>
              <th scope="col" className="text-right font-medium py-1 pr-2">
                H
              </th>
              <th scope="col" className="text-right font-medium py-1 pr-2">
                T
              </th>
              <th scope="col" className="text-right font-medium py-1">
                kW/m
              </th>
            </tr>
          </thead>
          <tbody>
            {trains.map((train) => (
              <tr
                key={train.key}
                className={cn(
                  'border-t border-divider',
                  train.isDominant
                    ? 'bg-data-waves/[0.06]'
                    : 'bg-bg-base',
                )}
              >
                <td
                  className={cn(
                    'py-2.5 pr-2 whitespace-nowrap',
                    train.isDominant
                      ? 'border-l-2 border-l-data-waves pl-2 text-fg'
                      : 'pl-2.5 text-fg-muted',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        train.key === 'primary' ? 'bg-data-waves' : 'bg-data-waves/50',
                      )}
                      aria-hidden
                    />
                    <span className={train.isDominant ? 'font-medium text-fg' : undefined}>
                      {trainLabel(train.key)}
                    </span>
                    {train.isDominant && (
                      <span className="text-meta-sm text-data-waves font-medium" aria-hidden>
                        ★
                      </span>
                    )}
                  </span>
                </td>
                <td
                  className={cn(
                    'py-2.5 pr-2 font-mono tabular-nums whitespace-nowrap',
                    train.isDominant ? 'text-fg font-semibold' : 'text-fg',
                  )}
                >
                  {getCardinalLabel(train.direction)}
                </td>
                <td
                  className={cn(
                    'py-2.5 pr-2 font-mono tabular-nums text-right whitespace-nowrap',
                    train.isDominant ? 'text-fg font-semibold' : 'text-fg',
                  )}
                >
                  {train.height.toFixed(1)} m
                </td>
                <td
                  className={cn(
                    'py-2.5 pr-2 font-mono tabular-nums text-right whitespace-nowrap',
                    train.isDominant ? 'text-fg font-semibold' : 'text-fg',
                  )}
                >
                  {train.period.toFixed(1)} s
                </td>
                <td
                  className={cn(
                    'py-2.5 pr-2 font-mono tabular-nums text-right whitespace-nowrap',
                    train.isDominant ? 'text-fg font-semibold' : 'text-fg-muted',
                  )}
                >
                  {train.powerKw.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trains.length === 1 && (
        <p className="text-meta-sm text-fg-subtle font-mono tabular-nums">
          {isPt ? 'Energia' : 'Energy'}:{' '}
          <span className="text-fg font-medium">{total.toFixed(1)} kW/m</span>
        </p>
      )}
    </div>
  );
}
