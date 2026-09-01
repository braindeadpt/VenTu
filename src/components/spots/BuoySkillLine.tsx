'use client';

import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import {
  loadForecastSkillForSpot,
  forecastSkillOriginLabel,
  forecastSkillOriginTag,
  type ForecastSkillBuoy,
  type ForecastSkillSpotResult,
} from '@/lib/forecastSkill';

interface BuoySkillLineProps {
  spotId: string;
  locale: string;
}

function skillLabel(b: ForecastSkillBuoy): string | null {
  if (!Number.isFinite(b.me) || !Number.isFinite(b.n)) return null;
  const parts = [`ME ${b.me >= 0 ? '+' : ''}${b.me.toFixed(1)} m`];
  if (typeof b.rmse === 'number') parts.push(`RMSE ${b.rmse.toFixed(1)} m`);
  if (typeof b.corr === 'number') parts.push(`r ${b.corr.toFixed(2)}`);
  return parts.join(' · ');
}

/**
 * Discreet «skill desta boia» line on the spot page, next to the observed
 * wave card. Resolves the spot's buoy (IH idEst, WMO code fallback) against
 * forecast-skill.json byBuoy — the real accumulated forecast skill
 * (best_match vs buoy readings, lead > 0), independent of whether a fresh
 * reading is attached right now.
 */
export default function BuoySkillLine({ spotId, locale }: BuoySkillLineProps) {
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotVerify;
  const [result, setResult] = useState<ForecastSkillSpotResult | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadForecastSkillForSpot(spotId, fetch, getAssetPath)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
      })
      .finally(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (!done || !result || !result.buoy) return null;
  const buoy = result.buoy;

  const label = skillLabel(buoy);
  if (!label) return null;
  // País/fonte explícito (IH · Portugal vs Copernicus-ES · Espanha) — partilhado
  // com a tabela do About para nunca divergirem. Mostra que o skill do NW vem
  // da rota keyless da Copernicus, mesmo sem IH_API_KEY.
  const sourceLabel = forecastSkillOriginLabel(buoy.origin, isPt);
  const nameWithOrigin =
    buoy.origin === 'ih' || buoy.origin === 'wmo-pt' || buoy.origin === 'wmo-es'
      ? `${buoy.name} (${sourceLabel})`
      : buoy.name;

  // Repartição de pares por plataforma (IH vs WMO-PT vs WMO-ES) — a mesma
  // divisão que a linha do About mostra, aqui só com as origens com pares
  // (line) e em contraste com a origem da própria boia (o leitor vê se o
  // skill do spot vem da plataforma dominante ou da minoria).
  const counts = result.pairCountByOrigin ?? { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 };
  const originParts = (['ih', 'wmo-pt', 'wmo-es'] as const)
    .filter((o) => (counts[o] ?? 0) > 0)
    .map((o) => `${forecastSkillOriginTag(o)} ${counts[o] ?? 0}`);
  const totalPairs =
    (counts.ih ?? 0) + (counts['wmo-pt'] ?? 0) + (counts['wmo-es'] ?? 0);

  return (
    <>
      <p
        className="text-meta-sm text-fg-subtle leading-snug"
        data-buoy-skill-line="true"
        title={tv.buoySkillTitle
          .replace('{name}', nameWithOrigin)
          .replace('{n}', String(buoy.n))}
      >
        {tv.buoySkillBody
          .replace('{name}', nameWithOrigin)
          .replace('{label}', label)
          .replace('{n}', String(buoy.n))}
      </p>
      {totalPairs > 0 && (
        <p
          className="text-meta-sm text-fg-muted leading-snug"
          data-buoy-skill-origins="true"
          title={tv.buoySkillOriginsTitle
            .replace('{buoyOrigin}', forecastSkillOriginTag(buoy.origin))
            .replace('{total}', String(totalPairs))}
        >
          {tv.buoySkillOrigins
            .replace('{counts}', originParts.join(' · '))
            .replace('{total}', String(totalPairs))}
        </p>
      )}
    </>
  );
}
