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

/**
 * Why the winner won, in plain language — freshness/distance tradeoff. The
 * side-by-side renders when BOTH sources have readings (winner = IH primary).
 */
function sourceReasonLine(
  meta: ObservedWaveMeta | null | undefined,
  isPt: boolean,
): string {
  if (!meta) {
    return isPt
      ? 'IH e WMO com leituras — a usar a fonte primária.'
      : 'Both IH and WMO have readings — using the primary source.';
  }
  const wmoFresher =
    meta.wmoAgeHours != null && meta.ihAgeHours != null && meta.wmoAgeHours < meta.ihAgeHours;
  const wmoCloser =
    meta.wmoDistanceKm != null && meta.ihDistanceKm != null && meta.wmoDistanceKm < meta.ihDistanceKm;
  if (meta.reason === 'wmo-only') {
    return isPt
      ? 'A usar WMO — IH sem leitura fresca (fallback da Copernicus).'
      : 'Using WMO — no fresh IH reading (Copernicus fallback).';
  }
  if (meta.reason === 'ih-only') {
    return isPt ? 'A usar IH — WMO sem leitura fresca.' : 'Using IH — no fresh WMO reading.';
  }
  // 'ih-fresh' — both sources present (the side-by-side case).
  if (wmoFresher && wmoCloser) {
    return isPt
      ? 'A usar IH — fonte primária fresca; WMO mais próxima e mais fresca, mas o IH é a fonte oficial.'
      : 'Using IH — fresh primary source; WMO is closer and fresher, but IH is the official source.';
  }
  if (wmoFresher) {
    return isPt
      ? 'A usar IH — fonte primária; WMO mais fresca, mas o IH é a fonte oficial.'
      : 'Using IH — primary source; WMO fresher, but IH is the official source.';
  }
  if (wmoCloser) {
    return isPt
      ? 'A usar IH — fonte primária fresca; WMO mais próxima, mas o IH é a fonte oficial.'
      : 'Using IH — fresh primary source; WMO closer, but IH is the official source.';
  }
  return isPt
    ? 'A usar IH — fonte primária com leitura fresca (≤3 h).'
    : 'Using IH — fresh primary source reading (≤3 h).';
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
}

export default function ObservedWaveCard({
  observedWave,
  altWave,
  meta,
  forecastWaveHeightM,
  locale,
}: ObservedWaveCardProps) {
  const isPt = locale === 'pt';

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
      aria-label={isPt ? 'Onda observada (boia)' : 'Observed wave (buoy)'}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h3 className="text-meta font-semibold text-fg">
          {isPt ? 'Onda observada (boia)' : 'Observed wave (buoy)'}
        </h3>
        <p className="text-meta-sm text-fg-subtle">
          {isPt ? `${label} · ${clock}` : `${clock} · ${label}`}
        </p>
      </div>

      {observedWave.calibration &&
        (() => {
          const cal = observedWave.calibration;
          const fmtMe = `${cal.me >= 0 ? '+' : ''}${cal.me.toFixed(1)}`;
          return (
            <p
              className="flex items-start gap-1.5 rounded-lg border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-meta-sm text-data-period leading-snug"
              data-wave-calibrated="true"
              title={
                isPt
                  ? `Calibração cross-border: ${cal.from ?? 'par ES×PT'} · ME ${fmtMe} m (n=${cal.n}) — leitura espanhola ajustada para a referência PT.`
                  : `Cross-border calibration: ${cal.from ?? 'ES×PT pair'} · ME ${fmtMe} m (n=${cal.n}) — Spanish reading adjusted to the PT reference.`
              }
            >
              <span aria-hidden>🔧</span>
              <span>
                {isPt ? (
                  <>
                    Altura recalibrada para a referência PT: medido{' '}
                    <strong className="font-semibold">
                      {cal.rawHeight.toFixed(1)} m
                    </strong>
                    {' → '}
                    <strong className="font-semibold">
                      {observedWave.waveHeight.toFixed(1)} m
                    </strong>
                    {' · viés '}
                    {fmtMe} m (n={cal.n})
                  </>
                ) : (
                  <>
                    Height recalibrated to the PT reference: measured{' '}
                    <strong className="font-semibold">
                      {cal.rawHeight.toFixed(1)} m
                    </strong>
                    {' → '}
                    <strong className="font-semibold">
                      {observedWave.waveHeight.toFixed(1)} m
                    </strong>
                    {' · bias '}
                    {fmtMe} m (n={cal.n})
                  </>
                )}
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
                      <span className="font-normal text-fg-subtle">
                        {isPt ? '· a usar' : '· in use'}
                      </span>
                    ) : null}
                  </p>
                  <p>{observedWaveLabel(w, locale)}</p>
                  <p className="font-mono tabular-nums text-fg-subtle">
                    {ageH != null && Number.isFinite(ageH)
                      ? isPt
                        ? `${Math.round(ageH * 10) / 10} h`
                        : `${Math.round(ageH * 10) / 10} h`
                      : isPt
                        ? 'idade n/d'
                        : 'age n/a'}
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
              <span>
                {isPt
                  ? 'IH a envelhecer — a WMO está mais fresca; a usar o IH enquanto continua a ser a fonte primária.'
                  : 'IH aging — the WMO reading is fresher; using IH while it remains the primary source.'}
              </span>
            </p>
          )}
          <p className="text-meta-sm text-fg-subtle leading-snug">{sourceReasonLine(meta, isPt)}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-meta">
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">
            {isPt ? 'Altura (medida)' : 'Height (measured)'}
          </p>
          <p className="font-mono tabular-nums font-semibold text-fg">
            {observedWave.waveHeight.toFixed(1)} m
          </p>
        </div>
        <div className="rounded-lg border border-divider/60 bg-bg-base/40 px-2.5 py-2">
          <p className="text-meta-sm text-fg-muted mb-0.5">
            {isPt ? 'Previsão modelo' : 'Model forecast'}
          </p>
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
            title={
              isPt
                ? `Diferença ${verification.deltaM >= 0 ? '+' : ''}${verification.deltaM} m`
                : `Delta ${verification.deltaM >= 0 ? '+' : ''}${verification.deltaM} m`
            }
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
          // Skill de boia ES (WMO/Copernicus — Silleiro/Villano no NW): destaque
          // honesto, surge mesmo sem IH_API_KEY (a cadeia ES acumula sem chave).
          const isEs = s.origin === 'wmo-es';
          const buoyName = s.buoyName || observedWave.stationName;
          return (
            <p
              className={cn(
                'flex items-start gap-1.5 text-meta-sm leading-snug',
                isEs
                  ? 'rounded-lg border border-data-period/30 bg-data-period/10 px-2 py-1.5 text-data-period'
                  : 'text-fg-subtle',
              )}
              data-wave-skill={isEs ? 'es' : 'true'}
              title={
                isPt
                  ? isEs
                    ? `Skill real do forecast nesta boia espanhola (${buoyName}) — forecast-skill.json via WMO/Copernicus (sem IH_API_KEY): best_match vs leitura da boia nas mesmas horas. ME = média(observado − previsão): positivo = modelo subestima.`
                    : 'Skill real do forecast nesta boia (forecast-skill.json): best_match vs leitura da boia nas mesmas horas, com lead time > 0. ME = média(observado − previsão) — positivo = modelo subestima.'
                  : isEs
                    ? `Real forecast skill at this Spanish buoy (${buoyName}) — forecast-skill.json via WMO/Copernicus (no IH_API_KEY): best_match vs buoy reading on the same hours. ME = mean(observed − forecast): positive = model underestimates.`
                    : 'Real forecast skill at this buoy (forecast-skill.json): best_match vs buoy reading on the same hours, with lead time > 0. ME = mean(observed − forecast) — positive = model underestimates.'
              }
            >
              {isEs && <span aria-hidden>🇪🇸</span>}
              <span>
                {isPt ? (
                  isEs ? (
                    <>
                      Skill da boia <strong className="font-semibold">espanhola</strong> ({buoyName})
                      · {parts.join(' · ')} (n={s.n}) — via WMO/Copernicus (sem IH_API_KEY)
                    </>
                  ) : (
                    <>Skill desta boia: {parts.join(' · ')} (n={s.n})</>
                  )
                ) : isEs ? (
                  <>
                    Skill from <strong className="font-semibold">Spanish</strong> buoy ({buoyName})
                    : {parts.join(' · ')} (n={s.n}) — via WMO/Copernicus (no IH_API_KEY)
                  </>
                ) : (
                  <>Buoy skill: {parts.join(' · ')} (n={s.n})</>
                )}
              </span>
            </p>
          );
        })()}

      {extras.length > 0 && (
        <p className="text-meta-sm text-fg-subtle font-mono tabular-nums leading-snug">
          {extras.join(' · ')}
        </p>
      )}

      <p className="text-meta-sm text-fg-subtle leading-snug">
        {observedWaveDisclaimer(locale, observedWave.source)}
      </p>
    </section>
  );
}
