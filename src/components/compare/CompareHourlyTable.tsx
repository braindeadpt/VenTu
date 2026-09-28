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
import { wallTimeToInstantMs } from '@/lib/openMeteoTime';
import { dateKeyInTz } from '@/lib/dataFreshness';
import { spotTimeZone } from '@/lib/spotTimeZone';
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
  /** Instante real (epoch ms) — o eixo é por instante, não por string:
   *  «14:00» na Nazaré e «14:00» nos Açores NÃO são o mesmo instante. */
  ms: number;
  hour: string;
  dayKey: string;
  isNewDay: boolean;
}

const MAX_HOURS = 24;

function weekdayShort(ms: number, locale: string, timeZone: string): string {
  const w = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    timeZone,
    weekday: 'short',
  }).format(new Date(ms));
  return w.replace('.', '');
}

function hourLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(ms));
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

    // Eixo partilhado = INSTANTES reais: cada spot resolve as suas horas
    // wall-time no SEU fuso (Açores = Atlantic/Azores) — casar strings
    // «14:00» entre fusos juntaria horas com 1 h de diferença real.
    // A etiqueta da linha usa o fuso do 1.º spot (ordem do utilizador).
    const axisTz = spotTimeZone(entries[0]?.spot);
    let axisMs: number[] = [];
    for (const e of entries) {
      const tz = spotTimeZone(e.spot);
      const rows = forecasts[getConditionsDataId(e.spot)] ?? [];
      const instants = rows
        .map((r) => wallTimeToInstantMs(String(r.time ?? ''), tz))
        .filter((ms) => Number.isFinite(ms) && ms >= nowMs && ms < cutoff)
        .slice(0, MAX_HOURS);
      if (instants.length > axisMs.length) axisMs = instants;
    }
    if (!axisMs.length) return { axis: [], columns: [], axisTz };

    const axis: HourRow[] = axisMs.map((ms, i) => {
      const dayKey = dateKeyInTz(new Date(ms), axisTz);
      return {
        ms,
        hour: hourLabel(ms, axisTz),
        dayKey,
        isNewDay: i === 0 || dayKey !== dateKeyInTz(new Date(axisMs[i - 1]), axisTz),
      };
    });

    const columns = entries.map((e) => {
      const tz = spotTimeZone(e.spot);
      const rows = forecasts[getConditionsDataId(e.spot)] ?? [];
      const byInstant = new Map(
        rows.map((r) => [wallTimeToInstantMs(String(r.time ?? ''), tz), r]),
      );
      const hourly = axis.map((h) => {
        const r = byInstant.get(h.ms) as
          | { waveHeight?: number; wavePeriod?: number; windSpeed?: number; windDirection?: number; windGust?: number; waterTemp?: number }
          | undefined;
        return {
          time: h.ms,
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

    return { axis, columns, axisTz };
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
              <tr key={h.ms} className="border-b border-divider/60 last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-bg-base py-1.5 pl-3 pr-2 text-left font-mono tabular-nums text-fg whitespace-nowrap"
                >
                  {h.isNewDay && (
                    <span className="text-fg-subtle mr-1">{weekdayShort(h.ms, locale, prepared.axisTz)}</span>
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
