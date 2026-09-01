'use client';

import { cn } from '@/lib/cn';
import {
  isObservedWaveFresh,
  waveCalibrationTag,
  type ObservedWave,
  type ObservedWaveMeta,
} from '@/lib/observedWave';
import { formatObservedClockTime } from '@/lib/observations';

/**
 * Compact side-by-side source chip — «IH ✓ (1h) · WMO (5h, a 56 km)».
 *
 * Renders only when BOTH sources have fresh readings (the winner + the
 * runner-up), so the hero and the mobile sticky bar show the honest tradeoff
 * at a glance without the full ObservedWaveCard. Single-source spots keep
 * their existing compact label in the callers.
 */

/** Age in hours, compact: 1 → "1h", 0.3 → "0.3h", 5.2 → "5.2h". */
export function fmtAgeHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h) || h < 0) return 'n/d';
  const v = Math.round(h * 10) / 10;
  return `${String(v).replace(/\.0$/, '')}h`;
}

/** Distance, compact: 56.4 → "56 km". */
export function fmtDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  return `${Math.round(km)} km`;
}

export interface ObservedWaveSourcesChipProps {
  /** Winner source (already chosen by the merge). */
  observedWave: ObservedWave | null | undefined;
  /** Runner-up source — must be present AND fresh for the side-by-side. */
  altWave?: ObservedWave | null;
  /** Why the winner won (freshness/distance) — attached by the merge. */
  meta?: ObservedWaveMeta | null;
  locale: string;
  className?: string;
}

export default function ObservedWaveSourcesChip({
  observedWave,
  altWave,
  meta,
  locale,
  className,
}: ObservedWaveSourcesChipProps) {
  const isPt = locale === 'pt';
  if (!observedWave || !altWave) return null;
  if (!isObservedWaveFresh(observedWave) || !isObservedWaveFresh(altWave)) return null;

  const calTag = waveCalibrationTag(observedWave, locale);

  const segments = [observedWave, altWave].map((w, i) => {
    const winner = i === 0;
    const isIh = w.source === 'ih-buoy';
    const ageH =
      (isIh ? meta?.ihAgeHours : meta?.wmoAgeHours) ??
      (new Date().getTime() - new Date(w.observedAt).getTime()) / 3_600_000;
    // Formato compacto: o vencedor mostra só a idade («IH ✓ (1h)»); o
    // runner-up acrescenta a distância («WMO (5h, a 56 km)»).
    const km = winner ? null : fmtDistanceKm(w.distanceKm);
    // Tooltip com a hora EXACTA da leitura (Europe/Lisbon, mesmo relógio do
    // hero) + nome da estação — além da idade relativa mostrada no chip.
    const srcLabel = isIh ? 'IH' : 'WMO';
    const agePart = `(${fmtAgeHours(ageH)}${km ? (isPt ? `, a ${km}` : `, ${km} away`) : ''})`;
    const station = w.stationName?.trim() || w.stationArea?.trim() || '';
    const clock = formatObservedClockTime(w.observedAt, locale);
    const title = isPt
      ? `${srcLabel}${winner ? ' ✓' : ''} ${agePart} · ${station ? `${station} · ` : ''}leitura ${clock}`
      : `${srcLabel}${winner ? ' ✓' : ''} ${agePart} · ${station ? `${station} · ` : ''}reading ${clock}`;
    return {
      key: w.source,
      winner,
      isIh,
      age: fmtAgeHours(ageH),
      km,
      title,
    };
  });

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-meta-sm',
        className,
      )}
      role="group"
      aria-label={isPt ? 'Fontes de onda observada (IH vs WMO)' : 'Observed wave sources (IH vs WMO)'}
    >
      {segments.map((s) => (
        <span
          key={s.key}
          className={cn(
            'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 font-medium whitespace-nowrap',
            s.winner
              ? 'border-score-good/40 bg-score-good/10 text-score-good'
              : 'border-divider/60 bg-bg-base/40 text-fg-muted',
          )}
          title={s.title}
        >
          <span>{s.isIh ? 'IH' : 'WMO'}</span>
          {s.winner ? <span aria-hidden>✓</span> : null}
          <span className="font-mono tabular-nums text-fg-subtle">
            ({s.age}
            {s.km
              ? isPt
                ? `, a ${s.km}`
                : `, ${s.km} away`
              : ''})
          </span>
        </span>
      ))}
      {calTag && (
        <span
          className="inline-flex items-center gap-1 rounded-pill border border-data-period/30 bg-data-period/10 px-2 py-0.5 font-medium whitespace-nowrap text-data-period"
          title={calTag.title}
          data-wave-calibrated="compact"
        >
          <span aria-hidden>🔧</span>
          {calTag.label}
        </span>
      )}
    </div>
  );
}
