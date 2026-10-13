'use client';

import { useMemo, useState } from 'react';
import type { Spot } from '@/types';
import { spotWindows, type SpotWindow } from '@/lib/spotWindows';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { sunTimes } from '@/lib/verdict/sunTimes';
import { formatHourLabel, formatDayShort } from '@/lib/verdict/formatHourLabel';
import { getCardinalLabel } from '@/lib/wind';
import { windSportDirectionSafety, type WindSportDirection } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import { cn } from '@/lib/cn';
import type { BeachForecastHour } from '@/components/spots/quick/SpotMiniBeach';

const SPOT_TZ = 'Europe/Lisbon';

type QuickKeys = keyof ReturnType<typeof getTranslation>['spotPageQuick'];

const DIR_KEY: Record<WindSportDirection, QuickKeys> = {
  onshore: 'dirOnshore',
  'side-onshore': 'dirSideOnshore',
  'cross-shore': 'dirCrossShore',
  'side-offshore': 'dirSideOffshore',
  offshore: 'dirOffshore',
};

/** 'Terça, 13 out' — weekday longo + dia + mês curto, wall-time do spot. */
function longDay(iso: string, locale: string): string {
  const d = Number(iso.slice(8, 10));
  const mo = Number(iso.slice(5, 7));
  const tag = locale === 'pt' ? 'pt-PT' : 'en-GB';
  const month = new Intl.DateTimeFormat(tag, { month: 'short' }).format(
    new Date(Date.UTC(2026, mo - 1, 1)),
  );
  const wdLong = new Intl.DateTimeFormat(tag, { weekday: 'long' }).format(
    new Date(Date.UTC(Number(iso.slice(0, 4)), mo - 1, d)),
  );
  return `${wdLong}, ${d} ${month}`;
}

/**
 * «Planear» (#184): as 3 melhores janelas «Bom» (≥60) que ainda não
 * acabaram, sobre o eixo canónico do forecast (o máximo que a previsão
 * cobre — 5 dias hoje, 7 quando a série crescer). Cada linha mostra o
 * dia, a faixa horária, o veredicto do pico e os números da hora de pico;
 * «Ver na régua» salta para o pico e «Ir {quando}» leva à melhor.
 */
export default function SpotPlanCard({
  spot,
  locale,
  forecast,
}: {
  spot: Spot;
  locale: string;
  forecast: readonly BeachForecastHour[];
}) {
  const tq = getTranslation(locale).spotPageQuick;
  const { hours, scores, nowIndex } = useSpotTimelineData();
  const { setIndex } = useSpotTimelineIndex();
  const [shared, setShared] = useState(false);
  const nf = new Intl.NumberFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    maximumFractionDigits: 1,
  });

  const windows = useMemo(
    () =>
      spotWindows(scores)
        .filter((w) => w.endIdx >= Math.max(0, nowIndex))
        .slice(0, 3),
    [scores, nowIndex],
  );

  const best = windows[0] ?? null;
  const bestWhen = best
    ? `${formatDayShort(hours[best.peakIdx], locale)} ${formatHourLabel(hours[best.peakIdx], locale)}`
    : null;

  const goTo = (w: SpotWindow) => {
    setIndex(w.peakIdx);
    document.getElementById('quando')?.scrollIntoView({ block: 'nearest' });
  };

  const share = async (w: SpotWindow) => {
    const text = `${spot.name} — ${longDay(hours[w.peakIdx], locale)} ${formatHourLabel(hours[w.startIdx], locale)}–${formatHourLabel(hours[w.endIdx], locale)} · ${w.peakScore}/100`;
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: spot.name, text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* partilha cancelada — sem ruído */
    }
  };

  return (
    <section
      aria-label={tq.planTitle}
      className="rounded-card border border-divider bg-surface-1/[0.04] p-4"
      data-plan-card
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-fg">
          {tq.planTitle}
        </h2>
        {best && bestWhen && (
          <button
            type="button"
            onClick={() => goTo(best)}
            className="min-h-[44px] rounded-pill border border-accent/50 px-3 text-meta-sm text-accent hover:bg-accent/10 transition-colors duration-150"
          >
            {tq.planGo.replace('{when}', bestWhen)}
          </button>
        )}
      </div>

      {windows.length === 0 ? (
        <p className="mt-3 text-meta-sm text-fg-muted">{tq.planEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-divider">
          {windows.map((w) => {
            const peakIso = hours[w.peakIdx];
            const row = forecast[w.peakIdx];
            const dayIso = peakIso?.slice(0, 10);
            const sun = dayIso
              ? sunTimes(dayIso, spot.lat, spot.lon, SPOT_TZ)
              : null;
            const band = scoreBand(w.peakScore);
            const dirLabel = row
              ? tq[
                  DIR_KEY[
                    windSportDirectionSafety(spot, row.windDirection).direction
                  ]
                ]
              : null;
            return (
              <li key={`${w.startIdx}-${w.endIdx}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => goTo(w)}
                    aria-label={tq.planWindowAria.replace(
                      '{when}',
                      `${longDay(peakIso, locale)} ${formatHourLabel(hours[w.startIdx], locale)}–${formatHourLabel(hours[w.endIdx], locale)}`,
                    )}
                    className="min-h-[44px] -my-1.5 text-left text-meta-sm text-fg-muted hover:text-fg transition-colors duration-150"
                  >
                    <span className="text-fg">{longDay(peakIso, locale)}</span>
                    {' · '}
                    <span className="font-mono tabular-nums">
                      {formatHourLabel(hours[w.startIdx], locale)}–
                      {formatHourLabel(hours[w.endIdx], locale)}
                    </span>
                  </button>
                  <span
                    className="font-mono text-meta-sm tabular-nums"
                    style={{ color: 'var(--verdict)' }}
                  >
                    {tq.peakWord} {nf.format(w.peakScore / 10)}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-meta-sm tabular-nums text-fg-subtle">
                  {row
                    ? `${nf.format(row.waveHeight)} m · ${nf.format(row.wavePeriod)} s${Number.isFinite(row.waveDirection) ? ` · ${getCardinalLabel(row.waveDirection ?? 0)}` : ''} · ${Math.round(row.windSpeed * MS_TO_KNOTS)} kn ${dirLabel ? `(${dirLabel})` : ''}`
                    : '—'}
                  {row?.tideHeight != null &&
                    ` · ${tq.tideWord} ${nf.format(row.tideHeight)} m`}
                </p>
                {sun && (
                  <p className="mt-0.5 text-meta-sm text-fg-subtle">
                    {tq.sunriseLabel}{' '}
                    {new Intl.DateTimeFormat('en-GB', {
                      timeZone: SPOT_TZ,
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    }).format(sun.sunrise)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => best && share(best)}
          disabled={!best}
          className={cn(
            'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-input px-4 text-sm font-medium',
            'border border-divider-strong text-fg transition-colors duration-150',
            best ? 'hover:border-fg-subtle' : 'opacity-40',
          )}
        >
          {shared ? tq.shareFallback : tq.planShare}
        </button>
        {best && (
          <button
            type="button"
            onClick={() => goTo(best)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-input border border-divider px-4 text-sm text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors duration-150"
          >
            {tq.planRail}
          </button>
        )}
      </div>
    </section>
  );
}
