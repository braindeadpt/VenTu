'use client';

import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { DATE_LOCALE } from '@/lib/dataFreshness';
import { getTranslation } from '@/lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { HomepageSpotData } from '@/lib/homepageSport';
import { getScoreForFilter, getSportLabel } from '@/lib/homepageSport';
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
 * Ordem determinística do ranking denso: score desc, depois nome localizado
 * asc, depois slug. sortSpotsBySport é estável mas resolve empates pela ordem
 * de entrada — que é a ordenação score-desc do BAKE (loadRows), calculada com
 * os dados de uma corrida da pipeline diferente da que o cliente depois
 * refresca via conditions.json. Entre builds/estados o mesmo empate a 76
 * caía em ordens diferentes (pixel gate: CI run 35880330375). Com este
 * desempate a ordem deixa de «saltar» entre visitas para o utilizador também.
 */
export function compareHomeRanked(
  a: HomepageSpotData,
  b: HomepageSpotData,
  sport: GridSportFilter,
  locale: string,
): number {
  const byScore = getScoreForFilter(b, sport) - getScoreForFilter(a, sport);
  if (byScore !== 0) return byScore;
  const byName = localizedSpotName(a.spot, locale).localeCompare(
    localizedSpotName(b.spot, locale),
    locale,
  );
  if (byName !== 0) return byName;
  return a.spot.slug.localeCompare(b.spot.slug);
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
  const t = getTranslation(locale).homepage;
  const isPt = locale === 'pt';
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const nowMs = mounted ? Date.now() : bakedAtMs;

  const liveSpotsData = useLiveGridSpotData(spotsData);

  // Sinal e2e «home estabilizada»: fica 'done' no primeiro render com os dados
  // do cliente (o refresh on-mount do hook devolve sempre um array novo). O
  // pixel gate espera por ele antes da captura — sem isto a screenshot corria
  // contra a chegada do fetch e apanha ora o bake (dados da build) ora a
  // fixture (CI run 35880330375: 17px de altura no «Top 8 · Surf»). Igual ao
  // padrão data-grid-live-deferred do hero, mas para esta secção.
  const liveReady = liveSpotsData !== spotsData;

  const top8 = useMemo(
    () =>
      [...liveSpotsData]
        .sort((a, b) => compareHomeRanked(a, b, sport, locale))
        .slice(0, TOP_N),
    [liveSpotsData, sport, locale],
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
        name: localizedSpotName(data.spot, locale),
        region: localizedSpotRegion(data.spot, locale),
        window: picked.window,
        sportLabel:
          sport === 'all' ? getSportLabel(picked.sport, locale) : null,
        href: spotDetailHref(locale, data.spot.slug, picked.sport),
      });
    }
    return out
      .filter((r) => new Date(r.window.endIso).getTime() > nowMs)
      .sort(
        (a, b) =>
          a.window.startIso.localeCompare(b.window.startIso) ||
          a.slug.localeCompare(b.slug),
      )
      .slice(0, MAX_WINDOW_ROWS);
  }, [liveSpotsData, sport, locale, nowMs]);

  const weekdayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? 'en-GB', {
        timeZone: 'Europe/Lisbon',
        weekday: 'short',
      }),
    [locale],
  );

  const dayLabel = (iso: string): string => {
    const diff = dayDiff(iso, nowMs);
    if (diff === 0) return t.today;
    if (diff === 1) return t.tomorrow;
    const w = weekdayFmt.format(new Date(iso)).replace('.', '');
    return w.charAt(0).toUpperCase() + w.slice(1);
  };

  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2"
      data-home-live={liveReady ? 'done' : 'pending'}
    >
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
          subtitle={t.bestScoresNow}
        />

        <aside
          aria-labelledby="home-windows-heading"
          className="min-w-0 self-start rounded-card border border-divider bg-surface-1/[0.03] p-3"
        >
          <h2 id="home-windows-heading" className="text-h3 text-fg mb-1">
            {t.upcomingWindows}
          </h2>
          <p className="text-meta text-fg-muted mb-2">
            {t.bestWindow48h}
          </p>

          {rows.length === 0 ? (
            <p className="text-meta text-fg-muted py-4">
              {t.noGoodWindows}
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
            {t.viewFullRanking} →
          </Link>
        </aside>
      </div>
    </div>
  );
}
