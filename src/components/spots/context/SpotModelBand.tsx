'use client';

import { useEffect, useState } from 'react';
import type { Spot } from '@/types';
import { getTranslation } from '@/lib/i18n';
import { getAssetPath } from '@/lib/paths';
import { parseEnsemble } from '@/lib/ensembleBand';
import {
  loadForecastSkillForSpot,
  type ForecastSkillLeadBucket,
} from '@/lib/forecastSkill';
import { getInstrumentFmt } from '@/components/spots/instruments/format';
import { useInstrumentRows } from '@/components/spots/instruments/useInstrumentRows';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';

/**
 * «Como sabemos» — o detalhe técnico da banda ensemble e do erro por horizonte.
 *
 * A regra v3 (§8) põe a proveniência aqui, não nos cartões de instrumentos: o
 * cartão Onda mostra «modelos: 1,0–1,9 m» (uma frase, sem siglas) e é aqui que
 * se explica de onde vem o intervalo — P10/P50/P90 por família, quantos modelos
 * responderam, e o erro do modelo contra as leituras da boia por tempo de
 * antecipação (ME/RMSE/n). As siglas aparecem com o significado por extenso.
 *
 * Caixa estável: as duas linhas de família são SEMPRE desenhadas (com «—»
 * quando a hora escolhida não tem banda, o que acontece nas horas best_match).
 * Passar a régua não muda a altura da secção — o mesmo cuidado do cartão.
 */
const MS_TO_KT = 1.94384;
const EMPTY = '—';

interface SpotModelBandProps {
  spot: Spot;
  locale: string;
}

export default function SpotModelBand({ spot, locale }: SpotModelBandProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const fmt = getInstrumentFmt(locale);
  const rows = useInstrumentRows(spot);
  const { hours } = useSpotTimelineData();
  const { index } = useSpotTimelineIndex();
  const [buckets, setBuckets] = useState<ForecastSkillLeadBucket[]>([]);
  const [buoyName, setBuoyName] = useState<string | null>(null);

  // Banda da hora escolhida no eixo — a mesma que o cartão Onda mostra.
  const band = parseEnsemble(rows?.get(hours[index] ?? '')?.ens);

  useEffect(() => {
    let cancelled = false;
    loadForecastSkillForSpot(spot.id, fetch, getAssetPath)
      .then((r) => {
        if (cancelled) return;
        setBuckets(r.buoy?.byLead ?? []);
        setBuoyName(r.buoy?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setBuckets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [spot.id]);

  const familyRow = (
    family: { p10: number; p50: number; p90: number; n: number } | null | undefined,
    unit: 'm' | 'kt',
    convert: number,
  ): string => {
    if (!family) return EMPTY;
    const digits = unit === 'm' ? fmt.f1 : fmt.f0;
    return `${ti.bandQuantiles
      .replace('{p10}', digits(family.p10 * convert))
      .replace('{p50}', digits(family.p50 * convert))
      .replace('{p90}', digits(family.p90 * convert))
      .replace('{unit}', unit)} · ${ti.bandMembers.replace('{n}', String(family.n))}`;
  };

  return (
    <div className="space-y-2" data-model-band="true">
      <h3 className="text-meta-sm font-semibold text-fg-subtle uppercase tracking-wide">
        {ti.bandTitle}
      </h3>
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{ti.bandIntro}</p>

      <div>
        <h4 className="text-meta-sm font-semibold text-fg-subtle mb-1">
          {ti.bandHourLabel}
        </h4>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 list-none p-0 m-0">
          <li className="text-meta-sm text-fg-muted font-mono tabular-nums">
            <span className="text-fg">{ti.wave}</span>
            {' '}
            <span data-band-value>{familyRow(band?.wave, 'm', 1)}</span>
          </li>
          <li className="text-meta-sm text-fg-muted font-mono tabular-nums">
            <span className="text-fg">{ti.wind}</span>
            {' '}
            <span data-band-value>{familyRow(band?.wind, 'kt', MS_TO_KT)}</span>
          </li>
        </ul>
      </div>

      {buckets.length > 0 && (
        <div className="grid gap-0.5" data-skill-by-lead="true">
          <h4 className="text-meta-sm font-semibold text-fg-subtle">
            {ti.skillLeadTitle}
            {buoyName ? ` · ${ti.skillLeadBuoy.replace('{name}', buoyName)}` : ''}
          </h4>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 list-none p-0 m-0 font-mono tabular-nums text-meta-sm text-fg-muted">
            {buckets.map((b) => (
              <li key={`${b.from}-${b.to}`}>
                <span className="text-fg">
                  {ti.skillLeadBucket
                    .replace('{from}', String(b.from))
                    .replace('{to}', String(b.to))}
                </span>
                {' · '}
                {typeof b.rmse === 'number'
                  ? ti.skillLeadRow
                      .replace('{me}', fmt.fS(b.me))
                      .replace('{rmse}', fmt.f1(b.rmse))
                      .replace('{n}', String(b.n))
                  : ti.skillLeadRowNoRmse
                      .replace('{me}', fmt.fS(b.me))
                      .replace('{n}', String(b.n))}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] leading-[1.5] text-fg-subtle">{ti.skillLeadHint}</p>
        </div>
      )}
    </div>
  );
}
