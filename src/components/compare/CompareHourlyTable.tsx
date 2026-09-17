'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getHourlyScores, getScoreTokens, type Conditions } from '@/lib/sportScore';
import { loadForecastForSpot } from '@/lib/spotDataCache';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { getTranslation, validateLocale } from '@/lib/i18n';
import Skeleton from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

export interface CompareHourlyEntry {
  spot: Spot;
  /** Score input já corrigido (boia/viés) — fallback de getHourlyScores. */
  conditions: Conditions;
}

interface CompareHourlyTableProps {
  entries: CompareHourlyEntry[];
  sport: SportType;
  locale: string;
}

interface HourRow {
  time: string;
  hour: string;
  dayKey: string;
  isNewDay: boolean;
}

const MAX_HOURS = 24;

function weekdayShort(iso: string, locale: string): string {
  const w = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    timeZone: 'Europe/Lisbon',
    weekday: 'short',
  }).format(new Date(iso));
  return w.replace('.', '');
}

/**
 * Auditoria C2 — a resposta «quando» do comparador: uma só tabela horária
 * partilhada (horas × spots) com o score canónico por hora, a mesma leitura
 * da página de spot. As previsões por spot vêm de /data/forecasts/{id}.json
 * (~50KB cada) em vez do ficheiro de 8 MB.
 */
export default function CompareHourlyTable({
  entries,
  sport,
  locale,
}: CompareHourlyTableProps) {
  const isPt = locale === 'pt';
  const cmp = getTranslation(validateLocale(locale)).compare;
  const [forecasts, setForecasts] = useState<Record<string, Record<string, unknown>[]> | null>(null);

  const slugsKey = entries.map((e) => e.spot.slug).join(',');

  useEffect(() => {
    let cancelled = false;
    setForecasts(null);
    Promise.all(
      entries.map((e) =>
        loadForecastForSpot(getConditionsDataId(e.spot)).then(
          (rows) => [getConditionsDataId(e.spot), rows] as const,
        ),
      ),
    )
      .then((pairs) => {
        if (!cancelled) setForecasts(Object.fromEntries(pairs));
      })
      .catch(() => {
        if (!cancelled) setForecasts({});
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugsKey]);

  const prepared = useMemo(() => {
    if (!forecasts) return null;
    const nowMs = Date.now();
    const cutoff = nowMs + MAX_HOURS * 3_600_000;

    // Eixo partilhado: horas futuras (≤24h) da primeira previsão com dados.
    let axis: HourRow[] = [];
    for (const e of entries) {
      const rows = forecasts[getConditionsDataId(e.spot)] ?? [];
      const times = rows
        .map((r) => String(r.time ?? ''))
        .filter((t) => {
          const ms = new Date(t).getTime();
          return Number.isFinite(ms) && ms >= nowMs && ms < cutoff;
        })
        .slice(0, MAX_HOURS);
      if (times.length > axis.length) {
        axis = times.map((t, i) => ({
          time: t,
          hour: t.slice(11, 13),
          dayKey: t.slice(0, 10),
          isNewDay: i === 0 || t.slice(0, 10) !== times[i - 1]?.slice(0, 10),
        }));
      }
    }
    if (!axis.length) return { axis, columns: [] };

    const columns = entries.map((e) => {
      const rows = forecasts[getConditionsDataId(e.spot)] ?? [];
      const byTime = new Map(rows.map((r) => [String(r.time ?? ''), r]));
      const hourly = axis.map((h) => {
        const r = byTime.get(h.time) as
          | { waveHeight?: number; wavePeriod?: number; windSpeed?: number; windDirection?: number; windGust?: number; waterTemp?: number }
          | undefined;
        return {
          time: h.time,
          waveHeight: r?.waveHeight ?? 0,
          wavePeriod: r?.wavePeriod ?? 0,
          windSpeed: r?.windSpeed ?? 0,
          windDirection: r?.windDirection ?? 0,
          windGust: r?.windGust ?? e.conditions.windGust,
          waterTemp: r?.waterTemp ?? e.conditions.waterTemp,
          present: Boolean(r),
        };
      });
      const scores = getHourlyScores(
        e.spot,
        sport,
        hourly.map(({ present: _present, ...rest }) => rest),
        e.conditions,
      );
      return {
        spot: e.spot,
        cells: hourly.map((h, i) => ({
          present: h.present,
          score: scores[i] ?? 0,
          waveHeight: h.waveHeight,
          windKt: Math.round(h.windSpeed * 1.94384),
        })),
      };
    });

    return { axis, columns };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecasts, slugsKey, sport, entries]);

  if (prepared === null) {
    return <Skeleton className="h-48 rounded-card" />;
  }
  if (!prepared.axis.length) return null;

  return (
    <section aria-labelledby="compare-hourly-heading">
      <h2 id="compare-hourly-heading" className="text-h3 text-fg mb-1">
        {cmp.hourlyTitle}
      </h2>
      <p className="text-meta text-fg-muted mb-3">{cmp.hourlySub}</p>

      <div
        role="region"
        aria-label={cmp.hourlyTitle}
        tabIndex={0}
        className="overflow-x-auto rounded-card border border-divider bg-surface-1/[0.03] edge-fade-x"
      >
        <table className="w-full border-collapse text-meta">
          <caption className="sr-only">{cmp.hourlySub}</caption>
          <thead>
            <tr className="border-b border-divider text-left text-meta-sm text-fg-subtle">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-bg-base py-2 pl-3 pr-2 font-medium whitespace-nowrap"
              >
                {cmp.hourlyTime}
              </th>
              {prepared.columns.map((col) => (
                <th key={col.spot.id} scope="col" className="py-2 px-3 font-medium">
                  <Link
                    href={`/${locale}/spots/${col.spot.slug}/?sport=${sport}`}
                    className="text-fg hover:text-accent transition-colors duration-150"
                  >
                    {isPt ? col.spot.name : col.spot.nameEn}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prepared.axis.map((h, hi) => (
              <tr key={h.time} className="border-b border-divider/60 last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-bg-base py-1.5 pl-3 pr-2 text-left font-mono tabular-nums text-fg whitespace-nowrap"
                >
                  {h.isNewDay && (
                    <span className="text-fg-subtle mr-1">{weekdayShort(h.time, locale)}</span>
                  )}
                  {h.hour}h
                </th>
                {prepared.columns.map((col) => {
                  const cell = col.cells[hi];
                  if (!cell?.present) {
                    return (
                      <td key={col.spot.id} className="py-1.5 px-3 text-fg-subtle">
                        —
                      </td>
                    );
                  }
                  const tokens = getScoreTokens(cell.score);
                  return (
                    <td key={col.spot.id} className="py-1.5 px-3 whitespace-nowrap">
                      <span className={cn('font-mono font-semibold tabular-nums', tokens.text)}>
                        {cell.score}
                      </span>
                      <span className="ml-2 font-mono tabular-nums text-meta-sm text-fg-muted">
                        {cell.waveHeight.toFixed(1)}m · {cell.windKt}kt
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
