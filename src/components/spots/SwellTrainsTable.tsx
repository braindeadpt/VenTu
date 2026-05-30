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
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[280px] border-collapse text-meta">
          <thead>
            <tr className="text-fg-muted text-meta-sm">
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
                  'border-t border-divider/60',
                  train.isDominant && 'bg-surface-2/80',
                )}
              >
                <td className="py-2 pr-2 text-fg-muted whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        train.key === 'primary' ? 'bg-data-waves' : 'bg-data-waves/60',
                      )}
                      aria-hidden
                    />
                    {trainLabel(train.key)}
                    {train.isDominant && (
                      <span className="text-data-waves text-meta-sm" aria-hidden>
                        ★
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums text-fg whitespace-nowrap">
                  {getCardinalLabel(train.direction)}
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums text-fg text-right whitespace-nowrap">
                  {train.height.toFixed(1)}m
                </td>
                <td className="py-2 pr-2 font-mono tabular-nums text-fg text-right whitespace-nowrap">
                  {train.period.toFixed(1)}s
                </td>
                <td className="py-2 font-mono tabular-nums text-fg-muted text-right whitespace-nowrap">
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
