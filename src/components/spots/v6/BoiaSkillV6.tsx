'use client';

/**
 * «Quão bem a previsão bate nesta boia» (v6), quando não há leitura fresca:
 * o skill real acumulado do forecast na boia do spot (forecast-skill.json
 * byBuoy, best_match vs leitura, lead > 0) numa frase de surfista — a taxa de
 * acerto a ±0,5 m e a tendência em cm (ME = observado − previsto). Os números
 * técnicos (RMSE, r, n e a repartição dos pares por rede) ficam numa linha
 * «detalhes» fechada, em letra pequena; o ME e a taxa ficam só na frase (cada
 * número uma vez), com a definição técnica no tooltip. Degrada em silêncio.
 */
import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import {
  forecastSkillOriginLabel,
  forecastSkillOriginTag,
  loadForecastSkillForSpot,
  type ForecastSkillSpotResult,
} from '@/lib/forecastSkill';
import { decimalV6, skillSimples } from './boiaFmt';

export default function BoiaSkillV6({ spotId, locale }: { spotId: string; locale: string }) {
  const tr = getTranslation(locale);
  const tv = tr.spotVerify;
  const ms = tr.spotMedeSabe;
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
  if (!b || !Number.isFinite(b.n)) return null;
  const s = skillSimples({ me: b.me, dentro05: b.withinHalfM }, ms);
  if (!s) return null;
  const d = (x: string) => decimalV6(x, locale);
  const sg = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
  const origem = b.origin ? forecastSkillOriginLabel(b.origin, locale) : '';

  // Tooltip: a definição técnica completa (ME incluído), para quem a quiser.
  const tecnico = [`ME ${sg(b.me)} m`];
  if (typeof b.rmse === 'number') tecnico.push(`RMSE ${b.rmse.toFixed(1)} m`);
  if (typeof b.corr === 'number') tecnico.push(`r ${b.corr.toFixed(2)}`);
  const title = d(`${tecnico.join(' · ')} (n=${b.n}) — ${tv.buoySkillTitle.replace('{name}', b.name).replace('{n}', String(b.n))}`);

  // «detalhes»: o que a frase não diz.
  const det = [origem ? ms.detBoia.replace('{name}', b.name).replace('{origem}', origem) : ms.boiaDe.replace('{name}', b.name)];
  if (typeof b.rmse === 'number') det.push(ms.detRmse.replace('{v}', b.rmse.toFixed(1)));
  if (typeof b.corr === 'number') det.push(ms.detR.replace('{v}', b.corr.toFixed(2)));
  det.push(ms.detN.replace('{n}', String(b.n)));

  const n = r?.pairCountByOrigin ?? { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 };
  const redes = (['ih', 'wmo-pt', 'wmo-es'] as const)
    .filter((o) => (n[o] ?? 0) > 0)
    .map((o) => `${forecastSkillOriginTag(o)} ${n[o] ?? 0}`);
  const total = redes.length ? (n.ih ?? 0) + (n['wmo-pt'] ?? 0) + (n['wmo-es'] ?? 0) : 0;

  return (
    <>
      <p className="ec-frase" data-buoy-skill-line="true" title={title}>
        {s.frase}
      </p>
      <details className="ec-det" data-buoy-skill-det="true">
        <summary>{ms.detalhes}</summary>
        <p data-buoy-skill-stats="true">{d(det.join(' · '))}</p>
        {total > 0 ? (
          <p
            data-buoy-skill-origins="true"
            title={tv.buoySkillOriginsTitle.replace('{buoyOrigin}', forecastSkillOriginTag(b.origin)).replace('{total}', String(total))}
          >
            {ms.detRedes.replace('{counts}', redes.join(' · '))}
          </p>
        ) : null}
      </details>
    </>
  );
}
