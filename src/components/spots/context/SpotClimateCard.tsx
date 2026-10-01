'use client';

import { useEffect, useState } from 'react';
import { getTranslation } from '@/lib/i18n';
import {
  loadClimatology,
  spotClimatology,
  monthlyMax,
  type SpotClimatology,
} from '@/lib/climatology';

/**
 * «Clima do spot» — médias mensais NASA POWER (MERRA-2, 2001–2020):
 * barras de vento ao longo do ano (mês corrente em acento) + linha mono
 * com vento/temperatura/chuva do mês. Sem dados → não renderiza (o card
 * nunca mostra esqueleto nem placeholders inventados).
 */
export default function SpotClimateCard({
  spotId,
  locale,
  /** Índice do mês (0–11) injectável em testes; default = mês corrente. */
  monthIndex,
  /** Classe do heading SUB_LABEL da secção-mãe (quando montada em contexto). */
  subLabelClass,
}: {
  spotId: string;
  locale: string;
  monthIndex?: number;
  subLabelClass?: string;
}) {
  const tc = getTranslation(locale).spotPageContext;
  const [clima, setClima] = useState<SpotClimatology | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadClimatology()
      .then((file) => {
        if (cancelled) return;
        setClima(spotClimatology(file, spotId));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (!ready || !clima || !clima.wind) return null;

  const month = monthIndex ?? new Date().getMonth();
  const max = monthlyMax(clima.wind) || 1;
  const monthNames = Array.from({ length: 12 }, (_, m) =>
    new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : locale, { month: 'narrow' }).format(
      new Date(2024, m, 1),
    ),
  );

  const w = clima.wind[month];
  const t = clima.temp?.[month];
  const p = clima.precip?.[month];

  return (
    <div data-spot-climate>
      <h3 className={subLabelClass}>{tc.climate}</h3>
      <div className="rounded-card border border-divider bg-surface-1/[0.03] px-3 py-3">
      <div className="flex items-end gap-1" role="img" aria-label={tc.climateWindBars}>
        {clima.wind.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className={
                i === month
                  ? 'w-full rounded-sm bg-data-wind'
                  : 'w-full rounded-sm bg-data-wind/45'
              }
              style={{ height: `${v === null ? 2 : Math.max(2, (v / max) * 28)}px` }}
              title={`${monthNames[i]}: ${v ?? '—'} m/s`}
            />
            <span
              className={
                i === month
                  ? 'text-[9px] font-mono font-semibold text-fg'
                  : 'text-[9px] font-mono text-fg-subtle'
              }
            >
              {monthNames[i]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-meta-sm font-mono tabular-nums text-fg-muted">
        <span className="text-fg font-medium">{monthNames[month]}</span>
        {' · '}
        {tc.climateWind} {w ?? '—'} m/s
        {t != null && (
          <>
            {' · '}
            {tc.climateTemp} {t.toFixed(1)}°
          </>
        )}
        {p != null && (
          <>
            {' · '}
            {tc.climatePrecip} {p.toFixed(1)} {tc.climatePrecipUnit}
          </>
        )}
      </p>
      <p className="mt-1 text-meta-sm text-fg-subtle">
        {tc.climateSource}
      </p>
      </div>
    </div>
  );
}
