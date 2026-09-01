'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getCardinalLabel } from '@/lib/wind';
import { formatObservedClockTime } from '@/lib/observations';
import {
  observedWaveLabel,
  observedWaveDisclaimer,
  isObservedWaveFresh,
  verifyWave,
  waveVerificationBadge,
  type ObservedWave,
  type ObservedWaveMeta,
} from '@/lib/observedWave';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import {
  SEA_STATE_WARNING_TYPES,
  strongestSpotWarning,
  warningBadgeLabel,
} from '@/lib/ipmaWarnings';
import { ATTRIBUTIONS, waveSourceAttributionId } from '@/lib/dataSources';
import { getTranslation } from '@/lib/i18n';
import WarningPill from '@/components/ui/WarningPill';

/**
 * Why the winner won, in plain language — freshness/distance tradeoff. The
 * side-by-side renders when BOTH sources have readings (winner = IH primary).
 */
function sourceReasonLine(
  meta: ObservedWaveMeta | null | undefined,
  tv: ReturnType<typeof getTranslation>['spotVerify'],
): string {
  if (!meta) return tv.reasonNoMeta;
  const wmoFresher =
    meta.wmoAgeHours != null && meta.ihAgeHours != null && meta.wmoAgeHours < meta.ihAgeHours;
  const wmoCloser =
    meta.wmoDistanceKm != null && meta.ihDistanceKm != null && meta.wmoDistanceKm < meta.ihDistanceKm;
  if (meta.reason === 'wmo-only') return tv.reasonWmoOnly;
  if (meta.reason === 'ih-only') return tv.reasonIhOnly;
  // 'ih-fresh' — both sources present (the side-by-side case).
  if (wmoFresher && wmoCloser) return tv.reasonFresherCloser;
  if (wmoFresher) return tv.reasonFresher;
  if (wmoCloser) return tv.reasonCloser;
  return tv.reasonIhFresh;
}

/**
 * Soft aging hint: the WMO reading is FRESHER than the IH one, but IH still
 * wins because it is the primary source (reason 'ih-fresh'). The primary is
 * approaching its freshness gate — worth telling the user.
 */
function isIhAging(meta: ObservedWaveMeta | null | undefined): boolean {
  if (!meta || meta.reason !== 'ih-fresh') return false;
  if (meta.wmoAgeHours == null || meta.ihAgeHours == null) return false;
  return meta.wmoAgeHours < meta.ihAgeHours;
}

interface ObservedWaveCardProps {
  observedWave: ObservedWave | null | undefined;
  /** Runner-up source (WMO when IH won, IH when WMO won) — same shape. */
  altWave?: ObservedWave | null;
  /** Why the winner was chosen (freshness/distance) — attached by the merge. */
  meta?: ObservedWaveMeta | null;
  /** Model wave height (m) for this spot — shown next to the buoy reading. */
  forecastWaveHeightM: number;
  locale: string;
  /** Spot id — resolves the active IPMA warning badge («Mar perigoso»). */
  spotId: string;
}

export default function ObservedWaveCard({
  observedWave,
  altWave,
  meta,
  forecastWaveHeightM,
  locale,
  spotId,
}: ObservedWaveCardProps) {
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotVerify;
  const warningsData = useIpmaWarnings();
  const warning = strongestSpotWarning(warningsData, spotId);
  const sourceAttributionId = waveSourceAttributionId(observedWave?.source ?? 'ih-buoy');

  // Source-aware honesty gate (IH 3h, WMO/Copernicus 6h): stale → not rendered.
  if (!observedWave || !isObservedWaveFresh(observedWave)) return null;

  const clock = formatObservedClockTime(observedWave.observedAt, locale);
  const label = observedWaveLabel(observedWave, locale);
  const verification = verifyWave(forecastWaveHeightM, observedWave.waveHeight);
  const badge = waveVerificationBadge(verification.agreement, locale);
  const waveCardinal =
    observedWave.waveDirection != null ? getCardinalLabel(observedWave.waveDirection) : null;

  const extras = [
    observedWave.wavePeriod != null ? `${Math.round(observedWave.wavePeriod)} s` : null,
    waveCardinal
      ? `${waveCardinal} ${observedWave.waveDirection != null ? `${Math.round(observedWave.waveDirection)}°` : ''}`.trim()
      : null,
    observedWave.waterTemp != null ? `${observedWave.waterTemp.toFixed(1)}°C` : null,
    observedWave.maxWaveHeight != null ? `Hmax ${observedWave.maxWaveHeight.toFixed(1)} m` : null,
  ].filter(Boolean) as string[];

  return (
    <section
      className="rounded-card border p-3 space-y-3 border-divider bg-surface-1/[0.04]"
      aria-label={tv.observedWaveTitle}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h3 className="text-meta font-semibold text-fg">{tv.observedWaveTitle}</h3>
        <p className="text-meta-sm text-fg-subtle">
          {locale === 'en' ? `${clock} · ${label}` : `${label} · ${clock}`}
        </p>
      </div>

      {warning && (
        <WarningPill
          warning={{
            level: warning.level,
            label: warningBadgeLabel(warning, isPt),
            seaState: SEA_STATE_WARNING_TYPES.has(warning.type),
            areaLabel: warning.areaLabel,
            type: warning.type,
          }}
          locale={locale}
          variant="default"
          dataAttr="true"
        />
      )}

      {observedWave.bridge && (
        <p
          className="flex items-start gap-1.5 rounded-lg border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-meta-sm text-data-period leading-snug"
          data-wave-bridge="true"
          title={tv.bridgeTitle}
        >
          <span aria-hidden>🌉</span>
          <span>
            {tv.bridgeLead}
            <strong className="font-semibold">Cabo Silleiro (ES)</strong>
            {tv.bridgeTail.replace('{label}', observedWaveLabel(observedWave, locale))}
          </span>
        </p>
      )}

      {observedWave.calibration &&
        (() => {
          const cal = observedWave.calibration;
          const fmtMe = `${cal.me >= 0 ? '+' : ''}${cal.me.toFixed(1)}`;
          return (
            <p
              className="flex items-start gap-1.5 rounded-lg border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-meta-sm text-data-period leading-snug"
              data-wave-calibrated="true"
              title={tv.calibrationTitle
                .replace('{from}', cal.from ?? tv.calibrationDefaultFrom)
                .replace('{me}', fmtMe)
                .replace('{n}', String(cal.n))}
            >
              <span aria-hidden>🔧</span>
              <span>
                {tv.calibrationLead}{' '}
                <strong className="font-semibold">{cal.rawHeight.toFixed(1)} m</strong>
                {' → '}
                <strong className="font-semibold">
                  {observedWave.waveHeight.toFixed(1)} m
                </strong>
                {tv.calibrationTail.replace('{me}', fmtMe).replace('{n}', String(cal.n))}
              </span>
            </p>
          );
        })()}

      {altWave && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2 text-meta-sm">
            {[observedWave, altWave].map((w, i) => {
              const isWinner = i === 0;
              const isIh = w.source === 'ih-buoy';
              const ageH =
                (isIh ? meta?.ihAgeHours : meta?.wmoAgeHours) ??
                (new Date().getTime() - new Date(w.observedAt).getTime()) / 3_600_000;
              return (
                <div
                  key={w.source}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5',
                    isWinner
                      ? 'border-score-good/40 bg-score-good/10 text-score-good'
                      : 'border-divider/60 bg-bg-base/40 text-fg-muted',
                  )}
                >
                  <p className="flex items-center gap-1 font-semibold">
                    <span aria-hidden>{isWinner ? '✓ ' : ''}</span>
                    {isIh ? 'IH' : 'WMO'}
                    {isWinner ? (
                      <span className="font-normal text-fg-subtle">{tv.inUse}</span>
                    ) : null}
                  </p>
                  <p>{observedWaveLabel(w, locale)}</p>
                  <p className="font-mono tabular-nums text-fg-subtle">
                    {ageH != null && Number.isFinite(ageH)
                      ? `${Math.round(ageH * 10) / 10} h`
                      : tv.ageNa}
                  </p>
                </div>
              );
            })}
          </div>
          {isIhAging(meta) && (
            <p
              className="flex items-start gap-1.5 rounded-lg border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-meta-sm text-data-period leading-snug"
              data-ih-aging="true"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>{tv.ihAging}</span>
            </p>
          )}
          <p className="text-meta-sm text-fg-subtle leading-snug">{sourceReasonLine(meta, tv)}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-meta">
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">{tv.measuredHeight}</p>
          <p className="font-mono tabular-nums font-semibold text-fg">
            {observedWave.waveHeight.toFixed(1)} m
          </p>
        </div>
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">{tv.modelForecast}</p>
          <p className="font-mono tabular-nums font-semibold text-fg">
            {forecastWaveHeightM.toFixed(1)} m
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 flex flex-col justify-center">
          <span
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-pill border px-2.5 py-1.5 text-meta-sm font-medium w-full sm:w-auto',
              badge.className,
            )}
            title={tv.deltaMTitle.replace(
              '{delta}',
              `${verification.deltaM >= 0 ? '+' : ''}${verification.deltaM}`,
            )}
          >
            <span aria-hidden>{badge.symbol}</span>
            {badge.label}
          </span>
        </div>
      </div>

      {observedWave.skill &&
        Number.isFinite(observedWave.skill.me) &&
        (() => {
          const s = observedWave.skill;
          const parts = [`ME ${s.me >= 0 ? '+' : ''}${s.me.toFixed(1)} m`];
          const mae = typeof s.mae === 'number' ? s.mae : undefined;
          const rmse = typeof s.rmse === 'number' ? s.rmse : undefined;
          if (mae !== undefined) parts.push(`MAE ${mae.toFixed(1)} m`);
          if (rmse !== undefined) parts.push(`RMSE ${rmse.toFixed(1)} m`);
          if (typeof s.corr === 'number') parts.push(`r ${s.corr.toFixed(2)}`);
          if (typeof s.meanLeadHours === 'number') {
            parts.push(`lead ${Math.round(s.meanLeadHours)}h`);
          }
          // Skill keyless WMO/Copernicus (ES Silleiro/Villano cross-border ou PT
          // Nazaré Costeira) — destaque honesto, surge mesmo sem IH_API_KEY
          // (ambas as cadeias acumulam sem chave).
          const isEs = s.origin === 'wmo-es';
          const isWmoPt = s.origin === 'wmo-pt';
          const isKeyless = isEs || isWmoPt;
          const keylessEmoji = isEs ? '🇪🇸' : isWmoPt ? '🇵🇹' : null;
          const buoyName = s.buoyName || observedWave.stationName;
          return (
            <p
              className={cn(
                'flex items-start gap-1.5 text-meta-sm leading-snug',
                isKeyless
                  ? 'rounded-lg border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-data-period'
                  : 'text-fg-subtle',
              )}
              data-wave-skill={isEs ? 'es' : isWmoPt ? 'pt' : 'true'}
              title={
                isEs
                  ? tv.skillTitleEs.replace('{name}', buoyName)
                  : isWmoPt
                    ? tv.skillTitleWmoPt.replace('{name}', buoyName)
                    : tv.skillTitleIh
              }
            >
              {keylessEmoji && <span aria-hidden>{keylessEmoji}</span>}
              <span>
                {isEs
                  ? tv.skillBodyEs
                      .replace('{name}', buoyName)
                      .replace('{parts}', parts.join(' · '))
                      .replace('{n}', String(s.n))
                  : isWmoPt
                    ? tv.skillBodyWmoPt
                        .replace('{name}', buoyName)
                        .replace('{parts}', parts.join(' · '))
                        .replace('{n}', String(s.n))
                    : tv.skillBodyIh
                        .replace('{parts}', parts.join(' · '))
                        .replace('{n}', String(s.n))}
              </span>
            </p>
          );
        })()}

      {extras.length > 0 && (
        <p className="text-meta-sm text-fg-subtle font-mono tabular-nums leading-snug">
          {extras.join(' · ')}
        </p>
      )}

      <footer className="space-y-1 pt-0.5">
        <p
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta-sm text-fg-subtle leading-snug"
          data-data-source={sourceAttributionId}
        >
          <span className="font-medium text-fg-muted">{tv.measurementSource}</span>
          {isPt
            ? ATTRIBUTIONS[sourceAttributionId].notePt
            : ATTRIBUTIONS[sourceAttributionId].noteEn}
        </p>
        <p className="text-meta-sm text-fg-subtle leading-snug">
          {observedWaveDisclaimer(locale, observedWave.source)}
        </p>
      </footer>
    </section>
  );
}
