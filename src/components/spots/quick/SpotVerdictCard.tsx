'use client';

import { useMemo } from 'react';
import type { Spot } from '@/types';
import type { SportScore, WindSportDirection } from '@/lib/sportScore';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { spotWindows } from '@/lib/spotWindows';
import { sunTimes } from '@/lib/verdict/sunTimes';
import { dayNight } from '@/lib/spotMiniBeach';
import { formatWindowLabel } from '@/lib/verdict/formatWindowLabel';
import { formatHourLabel } from '@/lib/verdict/formatHourLabel';
import { getConfidenceLabel, getConfidenceTier } from '@/lib/forecastConfidence';
import { windSportDirectionSafety } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import { useCountUp } from '@/components/spots/verdict/useCountUp';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import { cn } from '@/lib/cn';
import type { BeachForecastHour } from '@/components/spots/quick/SpotMiniBeach';

interface VerdictConditions {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  updatedAt?: string;
  confidence?: import('@/lib/forecastConfidence').ConfidenceTier;
  confidenceDetail?: import('@/lib/forecastConfidence').ConfidenceDetail;
  source?: 'real' | 'mock';
  tideLabel?: string;
}

type QuickKeys = keyof ReturnType<typeof getTranslation>['spotPageQuick'];

const DIRECTION_KEY: Record<WindSportDirection, QuickKeys> = {
  onshore: 'dirOnshore',
  'side-onshore': 'dirSideOnshore',
  'cross-shore': 'dirCrossShore',
  'side-offshore': 'dirSideOffshore',
  offshore: 'dirOffshore',
};

const numFmt = (locale: string) =>
  new Intl.NumberFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/**
 * Cartão de veredicto (#184): a palavra do tier em tamanho de decisão
 * (≥64 px), «Melhor janela», o score da hora escolhida com badge de
 * confiança, chips da hora escolhida (onda · período · vento), a linha
 * «Agora» observada e o botão que salta para a melhor janela. Todos os
 * números vêm do eixo partilhado — o mesmo score, direcção e hora que a
 * régua, a mini-praia e os instrumentos.
 */
export default function SpotVerdictCard({
  spot,
  locale,
  conditions,
  forecast,
  score,
}: {
  spot: Spot;
  locale: string;
  conditions: VerdictConditions;
  forecast: readonly BeachForecastHour[];
  score: SportScore;
}) {
  const tq = getTranslation(locale).spotPageQuick;
  const tv = getTranslation(locale).spotPageVerdict;
  const { hours, scores, nowIndex, nowResolved, windowStart, windowEnd } =
    useSpotTimelineData();
  const { index, isNow, selectedScore, setIndex } = useSpotTimelineIndex();
  const reducedMotion = usePrefersReducedMotion();
  const nf = numFmt(locale);

  const target = selectedScore ?? score.score;
  const displayScore = useCountUp(target, reducedMotion);
  const band = scoreBand(target);
  const bandLabel = locale === 'pt' ? band.labelPt : band.labelEn;

  // Valores da hora escolhida: a linha do forecast quando é futuro, o
  // snapshot observado quando é «agora» — a mesma fonte dos instrumentos.
  const sel = isNow ? conditions : forecast[index];
  const windKt = sel ? Math.round(sel.windSpeed * MS_TO_KNOTS) : null;
  const dir =
    sel && Number.isFinite(sel.windDirection)
      ? windSportDirectionSafety(spot, sel.windDirection).direction
      : null;
  const dirLabel = dir ? tq[DIRECTION_KEY[dir]] : null;

  // Melhor janela: a primeira janela «Bom» (≥60) que ainda não acabou —
  // o botão salta para o pico (a mesma hora que a etiqueta anuncia).
  const best = useMemo(() => {
    const windows = spotWindows(scores).filter(
      (w) => w.endIdx >= Math.max(0, nowIndex),
    );
    return windows[0] ?? null;
  }, [scores, nowIndex]);
  const bestLabel = best
    ? formatWindowLabel(hours, scores, best, 0, hours.length, locale)
    : null;

  const confTier =
    conditions.confidence || conditions.confidenceDetail
      ? getConfidenceTier(
          conditions.confidenceDetail ?? null,
          conditions.confidence ?? null,
        )
      : null;
  const confLabel = confTier ? getConfidenceLabel(confTier, locale) : null;

  // Nota «noite» junto do score — a hora escolhida está fora do dia civil
  // (mesma lógica da régua e da mini-praia: sunTimes do dia seleccionado).
  const dayKey = (hours[index] ?? forecast[0]?.time)?.slice(0, 10);
  const isNight = useMemo(() => {
    if (!dayKey) return false;
    const sun = sunTimes(dayKey, spot.lat, spot.lon, 'Europe/Lisbon');
    if (!sun) return false;
    const tz = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const toMin = (d: Date) => {
      const s = tz.format(d);
      return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    };
    return dayNight({
      hourIso: hours[index],
      sunriseMin: toMin(sun.sunrise),
      sunsetMin: toMin(sun.sunset),
    }).isNight;
  }, [dayKey, hours, index, spot.lat, spot.lon]);

  // updatedAt é ISO UTC — a hora «atualizado» é wall-time de Lisboa, como
  // o resto da página (Open-Meteo já vem em hora local).
  const updatedTime = useMemo(() => {
    if (!conditions.updatedAt) return null;
    const d = new Date(conditions.updatedAt);
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }, [conditions.updatedAt]);

  return (
    <section
      aria-label={tv.sectionTitle}
      className="rounded-card border border-divider bg-surface-1/[0.04] p-4 lg:p-5"
      data-verdict-card
    >
      <p
        className="font-display font-semibold leading-[0.95] tracking-tight text-[64px] lg:text-[80px]"
        style={{ color: 'var(--verdict)' }}
        data-visual-dynamic
      >
        {bandLabel}
      </p>

      <p className="mt-3 text-meta-sm text-fg-muted">
        <span className="text-fg">{tq.bestWindow}:</span>{' '}
        {bestLabel ?? tq.noBestWindow}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={target}
          aria-valuetext={`${target} / 100 — ${bandLabel}`}
          className="font-mono text-num-xl tabular-nums text-fg"
          data-visual-dynamic
        >
          {displayScore}
          <span className="text-num-lg text-fg-subtle"> /100</span>
        </span>
        {conditions.source === 'mock' && (
          <DataSourceBadge source="mock" locale={locale} size="sm" />
        )}
        {confLabel && (
          <span
            className={cn(
              'rounded-pill border px-2 py-0.5 text-meta-sm',
              confTier === 'baixa'
                ? 'border-score-fair/40 text-score-fair'
                : 'border-divider text-fg-muted',
            )}
          >
            {confLabel}
          </span>
        )}
        {isNow === false && nowResolved && (
          <span className="rounded-pill border border-divider px-2 py-0.5 text-meta-sm text-fg-muted">
            {hours[index] ? formatHourLabel(hours[index], locale) : ''}
          </span>
        )}
        {isNight && (
          <span
            className="rounded-pill border border-divider px-2 py-0.5 text-meta-sm text-fg-subtle"
            data-night-tag
          >
            {tq.nightTag}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-pill border border-divider px-2.5 py-1 font-mono text-meta-sm tabular-nums text-fg">
          {tq.waveChip.replace(
            '{h}',
            sel ? nf.format(sel.waveHeight) : '—',
          )}
        </span>
        <span className="rounded-pill border border-divider px-2.5 py-1 font-mono text-meta-sm tabular-nums text-fg">
          {tq.periodChip.replace('{p}', sel ? nf.format(sel.wavePeriod) : '—')}
        </span>
        {dirLabel && (
          <span className="rounded-pill border border-divider px-2.5 py-1 text-meta-sm text-fg">
            {tq.windChip.replace('{rel}', dirLabel)}
          </span>
        )}
      </div>

      <p className="mt-3 font-mono text-meta-sm tabular-nums text-fg-subtle">
        {tq.nowLine
          .replace('{wave}', nf.format(conditions.waveHeight))
          .replace('{wind}', String(Math.round(conditions.windSpeed * MS_TO_KNOTS)))
          .replace('{time}', updatedTime ?? '—')}
      </p>

      {best && (
        <button
          type="button"
          onClick={() => setIndex(best.peakIdx)}
          className={cn(
            'mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-input',
            'w-full px-4 text-sm font-medium sm:w-auto',
            'bg-accent text-bg-base hover:bg-accent-hover transition-opacity duration-150',
          )}
        >
          {tq.goToWindow}
        </button>
      )}
      {windKt === null && (
        <p className="mt-3 text-meta-sm text-fg-muted">{tq.beachNoData}</p>
      )}
    </section>
  );
}
