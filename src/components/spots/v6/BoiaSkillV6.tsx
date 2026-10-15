'use client';

/**
 * Linha discreta «skill desta boia» (v6), quando não há leitura fresca: o
 * skill real acumulado do forecast na boia do spot (forecast-skill.json
 * byBuoy, best_match vs leitura, lead > 0) e a repartição dos pares por
 * plataforma (IH · Copernicus-PT · Copernicus-ES). Degrada em silêncio.
 */
import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import {
  forecastSkillOriginLabel,
  forecastSkillOriginTag,
  loadForecastSkillForSpot,
  type ForecastSkillBuoy,
  type ForecastSkillSpotResult,
} from '@/lib/forecastSkill';
import { decimalV6 } from './boiaFmt';

function skillTxt(b: ForecastSkillBuoy): string | null {
  if (!Number.isFinite(b.me) || !Number.isFinite(b.n)) return null;
  const parts = [`ME ${b.me >= 0 ? '+' : ''}${b.me.toFixed(1)} m`];
  if (typeof b.rmse === 'number') parts.push(`RMSE ${b.rmse.toFixed(1)} m`);
  if (typeof b.corr === 'number') parts.push(`r ${b.corr.toFixed(2)}`);
  return parts.join(' · ');
}

export default function BoiaSkillV6({ spotId, locale }: { spotId: string; locale: string }) {
  const tv = getTranslation(locale).spotVerify;
  const [r, setR] = useState<ForecastSkillSpotResult | null>(null);

  useEffect(() => {
    let cancelado = false;
    loadForecastSkillForSpot(spotId, fetch, getAssetPath)
      .then((x) => {
        if (!cancelado) setR(x);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [spotId]);

  const b = r?.buoy;
  if (!b) return null;
  const label = skillTxt(b);
  if (!label) return null;
  const origem = forecastSkillOriginLabel(b.origin, locale);
  const nome = b.origin === 'ih' || b.origin === 'wmo-pt' || b.origin === 'wmo-es' ? `${b.name} (${origem})` : b.name;
  const pct = typeof b.withinHalfM === 'number' && Number.isFinite(b.withinHalfM) ? Math.round(b.withinHalfM * 100) : null;
  const n = r?.pairCountByOrigin ?? { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 };
  const partes = (['ih', 'wmo-pt', 'wmo-es'] as const)
    .filter((o) => (n[o] ?? 0) > 0)
    .map((o) => `${forecastSkillOriginTag(o)} ${n[o] ?? 0}`);
  const total = (n.ih ?? 0) + (n['wmo-pt'] ?? 0) + (n['wmo-es'] ?? 0);
  const d = (s: string) => decimalV6(s, locale);

  return (
    <>
      <p className="ec-nota" data-buoy-skill-line="true" title={tv.buoySkillTitle.replace('{name}', nome).replace('{n}', String(b.n))}>
        {d(tv.buoySkillBody.replace('{name}', nome).replace('{label}', label).replace('{n}', String(b.n)))}
        {pct != null ? ` · ${tv.buoySkillHitRate.replace('{pct}', String(pct))}` : ''}
      </p>
      {total > 0 ? (
        <p
          className="ec-nota"
          data-buoy-skill-origins="true"
          title={tv.buoySkillOriginsTitle.replace('{buoyOrigin}', forecastSkillOriginTag(b.origin)).replace('{total}', String(total))}
        >
          {tv.buoySkillOrigins.replace('{counts}', partes.join(' · ')).replace('{total}', String(total))}
        </p>
      ) : null}
    </>
  );
}
