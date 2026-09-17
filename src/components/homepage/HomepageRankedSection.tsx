'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { HomepageSpotData } from '@/lib/homepageSport';
import { sortSpotsBySport, getSportLabel } from '@/lib/homepageSport';
import { SPORT_LABELS, type GridSportFilter, type SportType } from '@/lib/sportRatings';
import { spotDetailHref } from '@/lib/gridSpotScore';
import { getScoreTokens } from '@/lib/sportScore';
import type { UpcomingWindow } from '@/lib/bestWindowToday';
import { useLiveGridSpotData } from '@/hooks/useLiveGridSpotData';
import SpotRankedTable from '@/components/spots/SpotRankedTable';
import { cn } from '@/lib/cn';

interface HomepageRankedSectionProps {
  spotsData: HomepageSpotData[];
  sport: GridSportFilter;
  locale: string;
  /** Build-time clock (SSG) — first paint uses it; after mount the live
   *  clock drops windows that already ended (React #418 guard). */
  bakedAtMs: number;
}

const TOP_N = 8;
const MAX_WINDOW_ROWS = 8;

/** Window key for a grid filter — «big-wave» rides the surf windows. */
function windowSport(sport: GridSportFilter): SportType | 'all' {
  if (sport === 'big-wave') return 'surf';
  return sport;
}

interface WindowRow {
  slug: string;
  name: string;
  region: string;
  window: UpcomingWindow;
  /** Set when the «all» filter picked the spot's best cross-sport window. */
  sportLabel: string | null;
  href: string;
}

const lisbonDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function lisbonDayKey(iso: string): string {
  return lisbonDayFmt.format(new Date(iso));
}

function dayDiff(startIso: string, nowMs: number): number {
  const a = new Date(lisbonDayKey(startIso) + 'T00:00:00Z').getTime();
  const b = new Date(lisbonDayFmt.format(new Date(nowMs)) + 'T00:00:00Z').getTime();
  return Math.round((a - b) / 86_400_000);
}

function hourOf(iso: string): string {
  return iso.slice(11, 13);
}

/**
 * Auditoria C3 — a decisão densa da home: top-8 ranked pelo desporto
 * activo (a mesma tabela canónica de /spots) ao lado das melhores
 * janelas ≥Bom das próximas 48h em qualquer spot.
 */
export default function HomepageRankedSection({
  spotsData,
  sport,
  locale,
  bakedAtMs,
}: HomepageRankedSectionProps) {
  const isPt = locale === 'pt';
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const nowMs = mounted ? Date.now() : bakedAtMs;

  const liveSpotsData = useLiveGridSpotData(spotsData);

  const top8 = useMemo(
    () => sortSpotsBySport(liveSpotsData, sport).slice(0, TOP_N),
    [liveSpotsData, sport],
  );

  const rows = useMemo<WindowRow[]>(() => {
    const wSport = windowSport(sport);
    const out: WindowRow[] = [];
    for (const data of liveSpotsData) {
      if (sport === 'big-wave' && data.spot.type !== 'big-wave') continue;
      let picked: { sport: SportType; window: UpcomingWindow } | null = null;
      if (wSport === 'all') {
        for (const [s, w] of Object.entries(data.upcomingWindowsBySport ?? {})) {
          if (w && (!picked || w.score > picked.window.score)) {
            picked = { sport: s as SportType, window: w };
          }
        }
      } else {
        const w = data.upcomingWindowsBySport?.[wSport];
        if (w) picked = { sport: wSport, window: w };
      }
      if (!picked) continue;
      out.push({
        slug: data.spot.slug,
        name: isPt ? data.spot.name : data.spot.nameEn,
        region: isPt ? data.spot.region : data.spot.regionEn,
        window: picked.window,
        sportLabel:
          sport === 'all' ? SPORT_LABELS[picked.sport]?.[isPt ? 'pt' : 'en'] ?? null : null,
        href: spotDetailHref(locale, data.spot.slug, picked.sport),
      });
    }
    return out
      .filter((r) => new Date(r.window.endIso).getTime() > nowMs)
      .sort((a, b) => a.window.startIso.localeCompare(b.window.startIso))
      .slice(0, MAX_WINDOW_ROWS);
  }, [liveSpotsData, sport, isPt, locale, nowMs]);

  const weekdayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(isPt ? 'pt-PT' : 'en-GB', {
        timeZone: 'Europe/Lisbon',
        weekday: 'short',
      }),
    [isPt],
  );

  const dayLabel = (iso: string): string => {
    const diff = dayDiff(iso, nowMs);
    if (diff === 0) return isPt ? 'Hoje' : 'Today';
    if (diff === 1) return isPt ? 'Amanhã' : 'Tomorrow';
    const w = weekdayFmt.format(new Date(iso)).replace('.', '');
    return w.charAt(0).toUpperCase() + w.slice(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <SpotRankedTable
          sorted={top8}
          selectedSport={sport}
          locale={locale}
          title={
            sport === 'all'
              ? `Top ${TOP_N}`
              : `Top ${TOP_N} · ${getSportLabel(sport, locale)}`
          }
          subtitle={isPt ? 'Melhores scores agora' : 'Best scores right now'}
        />

        <aside
          aria-labelledby="home-windows-heading"
          className="min-w-0 self-start rounded-card border border-divider bg-surface-1/[0.03] p-3"
        >
          <h2 id="home-windows-heading" className="text-h3 text-fg mb-1">
            {isPt ? 'Próximas janelas' : 'Upcoming windows'}
          </h2>
          <p className="text-meta text-fg-muted mb-2">
            {isPt ? 'Melhor janela ≥ Bom · 48h' : 'Best ≥ Good window · 48h'}
          </p>

          {rows.length === 0 ? (
            <p className="text-meta text-fg-muted py-4">
              {isPt
                ? 'Sem janelas boas nas próximas 48h'
                : 'No good windows in the next 48h'}
            </p>
          ) : (
            <ul className="list-none m-0 p-0 divide-y divide-divider/60">
              {rows.map((r) => {
                const tokens = getScoreTokens(r.window.score);
                return (
                  <li key={r.slug}>
                    <Link
                      href={r.href}
                      className="flex min-h-[44px] items-center gap-2 py-1.5 rounded-sm transition-colors duration-150 hover:bg-surface-2/[0.06] -mx-1 px-1"
                    >
                      <span className="font-mono tabular-nums text-meta text-fg whitespace-nowrap">
                        {dayLabel(r.window.startIso)}{' '}
                        <span className="text-fg-muted">
                          {hourOf(r.window.startIso)}–{hourOf(r.window.endIso)}h
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-meta text-fg">
                        {r.name}
                        {r.sportLabel ? (
                          <span className="text-fg-muted"> · {r.sportLabel}</span>
                        ) : null}
                      </span>
                      <span
                        className={cn('font-mono font-semibold tabular-nums text-meta', tokens.text)}
                      >
                        {r.window.score}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href={`/${locale}/spots/`}
            className="mt-2 inline-flex min-h-[44px] items-center text-meta font-medium text-accent hover:underline"
          >
            {isPt ? 'Ver ranking completo' : 'View full ranking'} →
          </Link>
        </aside>
      </div>
    </div>
  );
}
