'use client';

import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import {
  parseWaveBiasBuoys,
  type WaveBiasBuoy,
  type WaveBiasData,
  type WaveBiasSource,
} from '@/lib/waveBias';
import { parseForecastSkillBuoys, type ForecastSkillBuoy } from '@/lib/forecastSkill';

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
const two = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
const sourceLabel = (s: WaveBiasSource | undefined) =>
  s === 'ih' ? 'IH' : s === 'wmo-es' ? 'WMO-ES' : '—';

/** N mín. de pares para reportar skill real — espelha o produtor (forecastSkill.js MIN_PAIRS). */
const MIN_SKILL_N = 10;

/** Skill real (forecast-skill.json) para uma dada boia — cruza por id. */
interface SkillForBuoy {
  me: number;
  n: number;
  mae?: number;
  rmse?: number;
  corr?: number | null;
}

function BiasTableRow({
  buoy,
  skill,
  isPt,
}: {
  buoy: WaveBiasBuoy;
  skill: SkillForBuoy | null;
  isPt: boolean;
}) {
  const gated = buoy.regionAttribution === false;
  return (
    <tr className="border-b border-divider last:border-0">
      <td className="py-1.5 pr-3 font-medium text-fg">{buoy.name}</td>
      <td className="py-1.5 pr-3 text-fg-muted">{sourceLabel(buoy.source)}</td>
      <td className="py-1.5 pr-3 text-fg-muted">{buoy.area ?? '—'}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{buoy.n}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{sign(buoy.me)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{two(buoy.mae)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{two(buoy.rmse)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-fg-muted">{two(buoy.corr)}</td>
      {/* Skill real (forecast-skill) — trajecto previsto×medido, n/ME do forecast_skill */}
      <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-data-waves">
        {skill && skill.n >= MIN_SKILL_N ? sign(skill.me) : '—'}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-fg-muted">
        {skill && skill.n >= MIN_SKILL_N ? skill.n : '—'}
      </td>
      {gated && (
        <td className="py-1.5 pl-3 text-right">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-data-period/15 text-data-period"
            title={isPt
              ? 'Par ES×PT incoherent no dia — bias calculado mas não atribuído a regiões'
              : 'Incoherent ES×PT pair that day — bias computed but not attributed to regions'}
          >
            {isPt ? 'gate' : 'gated'}
          </span>
        </td>
      )}
    </tr>
  );
}

/**
 * Secção «Calibração — viés por boia (ondas)» do About.
 *
 * Cliente (não SSG) de propósito: o ficheiro wave-bias.json é lido no browser
 * (fetch + getAssetPath, mesmo padrão do radar/conditions) para que o conteúdo
 * seja testável de forma determinística — o About é estático, logo o HTML
 * baked a build não pode ser alternado por page.route; ao buscar em runtime
 * o teste consegue forçar «boias ES presentes» vs «ficheiro em falta».
 *
 * Sem dados usáveis renderiza null (a secção simplesmente não aparece), por
 * isso o caso «ficheiro em falta» é coberto sem lógica especial.
 */
export default function WaveBiasSection({ isPt }: { isPt: boolean }) {
  const [bias, setBias] = useState<WaveBiasData | null>(null);
  const [skillById, setSkillById] = useState<Record<string, ForecastSkillBuoy>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [biasRes, skillRes] = await Promise.all([
          fetch(getAssetPath('/data/wave-bias.json')).then((r) =>
            r.ok ? r.json() : null,
          ),
          fetch(getAssetPath('/data/forecast-skill.json')).then((r) =>
            r.ok ? r.json() : null,
          ),
        ]);
        if (!active) return;
        setBias(parseWaveBiasBuoys(biasRes));
        // Skill real por boia — forecast-skill.json é keyed por id (idEst IH ou
        // código WMO), o mesmo id que o wave-bias usa no `code`. Mapa id→skill.
        const skill = parseForecastSkillBuoys(skillRes);
        const byId: Record<string, ForecastSkillBuoy> = {};
        for (const b of skill.buoys) byId[b.id] = b;
        setSkillById(byId);
      } catch {
        if (active) {
          setBias(parseWaveBiasBuoys(null));
          setSkillById({});
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!bias || !bias.hasData) return null;

  return (
    <div className="card-1 p-8 space-y-4" data-wave-bias-section="true">
      <h2 className="text-2xl font-bold text-fg">
        {isPt ? 'Calibração — viés por boia (ondas)' : 'Calibration — per-buoy wave bias'}
      </h2>
      <p className="text-sm text-fg-muted leading-relaxed">
        {isPt ? (
          <>Viés do modelo (ERA5, Open-Meteo Historical Marine) face às boias de onda: <strong className="text-fg">IH</strong> (Datawell, com chave) e <strong className="text-fg">ES</strong> (Puertos del Estado via Copernicus WMO, sem chave). <strong className="text-fg">ME = média(observado − previsão)</strong>: positivo significa que o modelo subestima a onda. Isto é <strong className="text-fg">viés do modelo</strong>, não skill. Ao lado, a coluna <strong className="text-fg">Skill ME</strong> mostra o <strong className="text-fg">skill real do forecast</strong> (forecast-skill, previsto×medido em horas sobrepostas) — o modelo ERA5 nunca prevê, logo o viés (colunas ME/MAE/RMSE da esquerda) e a skill real medem coisas diferentes. A correcção regional é opt-in e só é aplicada com amostra suficiente.</>
        ) : (
          <>Model bias (ERA5, Open-Meteo Historical Marine) vs wave buoys: <strong className="text-fg">IH</strong> (Datawell, keyed) e <strong className="text-fg">ES</strong> (Puertos del Estado via Copernicus WMO, keyless). <strong className="text-fg">ME = mean(observed − forecast)</strong>: positive means the model underestimates the wave. This is <strong className="text-fg">model bias</strong>, not skill. Beside it, the <strong className="text-fg">Skill ME</strong> column shows the <strong className="text-fg">real forecast skill</strong> (forecast-skill, forecast×observed on overlapping hours) — ERA5 never forecasts, so model bias (left ME/MAE/RMSE columns) and real skill measure different things. The regional correction is opt-in and only applied with a sufficient sample.</>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-meta">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Boia' : 'Buoy'}</th>
              <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Origem' : 'Origin'}</th>
              <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Zona' : 'Area'}</th>
              <th className="py-1.5 pr-3 text-right font-semibold">n</th>
              <th className="py-1.5 pr-3 text-right font-semibold">ME (m)</th>
              <th className="py-1.5 pr-3 text-right font-semibold">MAE (m)</th>
              <th className="py-1.5 pr-3 text-right font-semibold">RMSE (m)</th>
              <th className="py-1.5 text-right font-semibold">r</th>
              {/* Skill real do forecast (não ERA5) — ME/n por boia */}
              <th
                className="py-1.5 pl-3 pr-3 text-right font-semibold text-data-waves"
                title={isPt
                  ? 'Skill real do forecast — ME = média(medido − previsto best_match) em horas sobrepostas, não o viés ERA5'
                  : 'Real forecast skill — ME = mean(observed − best_match forecast) on overlapping hours, not ERA5 bias'}
              >
                {isPt ? 'Skill ME (m)' : 'Skill ME (m)'}
              </th>
              <th
                className="py-1.5 text-right font-semibold text-data-waves"
                title={isPt
                  ? 'Skill real — n.º de pares previsto×medido acumulados'
                  : 'Real skill — accumulated forecast×observed pairs'}
              >
                {isPt ? 'Skill n' : 'Skill n'}
              </th>
              {bias.gatedCodes.length > 0 && <th className="py-1.5 pl-3 text-right" />}
            </tr>
          </thead>
          <tbody>
            {bias.buoys.map((b) => (
              <BiasTableRow
                key={b.code}
                buoy={b}
                skill={skillById[String(b.code)] ?? null}
                isPt={isPt}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-subtle">
        {isPt
          ? `Actualizado ${new Date(bias.fetchedAt ?? '').toLocaleDateString('pt-PT')} · amostra acumulada por boia (IH ${bias.buoys.filter((b) => b.source === 'ih').length} · ES ${bias.buoys.filter((b) => b.source === 'wmo-es').length})`
          : `Updated ${new Date(bias.fetchedAt ?? '').toLocaleDateString('en-GB')} · accumulated sample per buoy (IH ${bias.buoys.filter((b) => b.source === 'ih').length} · ES ${bias.buoys.filter((b) => b.source === 'wmo-es').length})`}
        {bias.gatedCodes.length > 0 && (
          <>
            {' · '}
            {isPt
              ? `gate cross-border ${bias.coherenceDay ?? ''}: ${bias.gatedCodes.join(', ')}`
              : `cross-border gate ${bias.coherenceDay ?? ''}: ${bias.gatedCodes.join(', ')}`}
          </>
        )}
      </p>
    </div>
  );
}