'use client';

import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import { loadForecastSkillForSpot, type ForecastSkillLeadBucket } from '@/lib/forecastSkill';
import { getInstrumentFmt } from './instruments/format';

interface WaveSkillByLeadProps {
  spotId: string;
  locale: string;
}

/**
 * «Skill por horizonte» no detalhe da Onda — ME/RMSE do modelo de onda vs
 * leituras de boia, repartidos pelo tempo de antecipação (lead time).
 *
 * Porquê: o ME/RMSE acumulado de uma boia mistura horas feitas 2 h antes com
 * horas feitas 4 dias antes, e a previsão de amanhã vale muito mais do que a
 * de depois de amanhã. O produtor (forecastSkill.js) publica a repartição por
 * faixas (`byLead`, n ≥ MIN_BUCKET_PAIRS) — aqui só se desenha o que existe:
 * a boia do spot é resolvida pelo mesmo caminho da BuoySkillLine (ih-buoys →
 * idEst, fallback wmo-buoys → code) e a linha inteira desaparece sem dados.
 */
export default function WaveSkillByLead({ spotId, locale }: WaveSkillByLeadProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const fmt = getInstrumentFmt(locale);
  const [buckets, setBuckets] = useState<ForecastSkillLeadBucket[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadForecastSkillForSpot(spotId, fetch, getAssetPath)
      .then((r) => {
        if (!cancelled) setBuckets(r.buoy?.byLead ?? []);
      })
      .catch(() => {
        if (!cancelled) setBuckets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (!buckets || buckets.length === 0) return null;

  return (
    <div data-skill-by-lead="true" className="grid gap-1.5">
      <h3 className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
        {ti.skillLeadTitle}
      </h3>
      <ul className="m-0 grid list-none gap-0.5 p-0 font-mono tabular-nums text-[12px] text-fg-muted">
        {buckets.map((b) => (
          <li key={`${b.from}-${b.to}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className="w-16 shrink-0 text-fg">
              {ti.skillLeadBucket.replace('{from}', String(b.from)).replace('{to}', String(b.to))}
            </span>
            <span>
              {typeof b.rmse === 'number'
                ? ti.skillLeadRow
                    .replace('{me}', fmt.fS(b.me))
                    .replace('{rmse}', fmt.f1(b.rmse))
                    .replace('{n}', String(b.n))
                : ti.skillLeadRowNoRmse
                    .replace('{me}', fmt.fS(b.me))
                    .replace('{n}', String(b.n))}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[11px] leading-snug text-fg-subtle">{ti.skillLeadHint}</p>
    </div>
  );
}
