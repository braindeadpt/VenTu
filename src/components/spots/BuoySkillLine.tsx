'use client';

import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import {
  loadForecastSkillForSpot,
  forecastSkillOriginLabel,
  type ForecastSkillBuoy,
} from '@/lib/forecastSkill';

interface BuoySkillLineProps {
  spotId: string;
  locale: string;
}

function skillLabel(b: ForecastSkillBuoy, isPt: boolean): string | null {
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
  const [buoy, setBuoy] = useState<ForecastSkillBuoy | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadForecastSkillForSpot(spotId, fetch, getAssetPath)
      .then((b) => {
        if (cancelled) return;
        setBuoy(b);
      })
      .finally(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (!done || !buoy) return null;

  const label = skillLabel(buoy, isPt);
  if (!label) return null;
  // País/fonte explícito (IH · Portugal vs Copernicus-ES · Espanha) — partilhado
  // com a tabela do About para nunca divergirem. Mostra que o skill do NW vem
  // da rota keyless da Copernicus, mesmo sem IH_API_KEY.
  const sourceLabel = forecastSkillOriginLabel(buoy.origin, isPt);
  const nameWithOrigin =
    buoy.origin === 'ih' || buoy.origin === 'wmo-pt' || buoy.origin === 'wmo-es'
      ? `${buoy.name} (${sourceLabel})`
      : buoy.name;

  return (
    <p
      className="text-meta-sm text-fg-subtle leading-snug"
      data-buoy-skill-line="true"
      title={
        isPt
          ? `Skill real do forecast nesta boia (${nameWithOrigin}, n=${buoy.n}) — forecast-skill.json: best_match vs leitura da boia nas mesmas horas, com lead time > 0. ME = média(observado − previsão): positivo = modelo subestima.`
          : `Real forecast skill at this buoy (${nameWithOrigin}, n=${buoy.n}) — forecast-skill.json: best_match vs buoy reading on the same hours, with lead time > 0. ME = mean(observed − forecast): positive = model underestimates.`
      }
    >
      {isPt ? (
        <>Skill desta boia ({nameWithOrigin}): {label} (n={buoy.n})</>
      ) : (
        <>Buoy skill ({nameWithOrigin}): {label} (n={buoy.n})</>
      )}
    </p>
  );
}
