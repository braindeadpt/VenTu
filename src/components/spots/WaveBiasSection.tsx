'use client';

import { DATE_LOCALE } from '@/lib/dataFreshness';
import { getTranslation } from '@/lib/i18n';
import RichText from '@/components/ui/RichText';
import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import {
  parseWaveBiasBuoys,
  type WaveBiasBuoy,
  type WaveBiasData,
  type WaveBiasSource,
} from '@/lib/waveBias';
import { parseForecastSkillBuoys, type ForecastSkillBuoy } from '@/lib/forecastSkill';
import {
  parseBuoyCoherenceRefs,
  type BuoyCoherenceRefsData,
} from '@/lib/calibrationRefs';

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
  locale,
}: {
  buoy: WaveBiasBuoy;
  skill: SkillForBuoy | null;
  locale: string;
}) {
  const t = getTranslation(locale).waveBias;
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
            title={t.gateTitle}
          >
            {t.gateLabel}
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
export default function WaveBiasSection({ locale }: { locale: string }) {
  const t = getTranslation(locale).waveBias;
  const [bias, setBias] = useState<WaveBiasData | null>(null);
  const [skillById, setSkillById] = useState<Record<string, ForecastSkillBuoy>>({});
  // Referência PT da calibração ES→PT por região (buoy-coherence.json) — o
  // merge regista qual boia PT recalibrou cada leitura ES; aqui, junto da
  // tabela de viés, o leitor vê a referência escolhida e o ME/n do par.
  const [coherenceRefs, setCoherenceRefs] = useState<BuoyCoherenceRefsData | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [biasRes, skillRes, coherenceRes] = await Promise.all([
          fetch(getAssetPath('/data/wave-bias.json')).then((r) =>
            r.ok ? r.json() : null,
          ),
          fetch(getAssetPath('/data/forecast-skill.json')).then((r) =>
            r.ok ? r.json() : null,
          ),
          fetch(getAssetPath('/data/buoy-coherence.json')).then((r) =>
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
        setCoherenceRefs(parseBuoyCoherenceRefs(coherenceRes));
      } catch {
        if (active) {
          setBias(parseWaveBiasBuoys(null));
          setSkillById({});
          setCoherenceRefs(parseBuoyCoherenceRefs(null));
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
        {t.title}
      </h2>
      <p className="text-sm text-fg-muted leading-relaxed">
        <RichText text={t.intro} />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-meta">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="py-1.5 pr-3 font-semibold">{t.colBuoy}</th>
              <th className="py-1.5 pr-3 font-semibold">{t.colOrigin}</th>
              <th className="py-1.5 pr-3 font-semibold">{t.colArea}</th>
              <th className="py-1.5 pr-3 text-right font-semibold">n</th>
              <th className="py-1.5 pr-3 text-right font-semibold">ME (m)</th>
              <th className="py-1.5 pr-3 text-right font-semibold">MAE (m)</th>
              <th className="py-1.5 pr-3 text-right font-semibold">RMSE (m)</th>
              <th className="py-1.5 text-right font-semibold">r</th>
              {/* Skill real do forecast (não ERA5) — ME/n por boia */}
              <th
                className="py-1.5 pl-3 pr-3 text-right font-semibold text-data-waves"
                title={t.skillMeTitle}
              >
                Skill ME (m)
              </th>
              <th
                className="py-1.5 text-right font-semibold text-data-waves"
                title={t.skillNTitle}
              >
                Skill n
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
                locale={locale}
              />
            ))}
          </tbody>
        </table>
      </div>
      {coherenceRefs?.hasData && (
        <div
          className="rounded-lg border border-divider p-4 space-y-3"
          data-coherence-refs="true"
        >
          <h3 className="text-sm font-bold text-fg">
            {t.refsTitle}
          </h3>
          <p className="text-xs text-fg-muted leading-relaxed">
            {t.refsBody}
          </p>
          <div className="space-y-2">
            {coherenceRefs.regions.map((r) => (
              <div key={r.region} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {r.region}
                </p>
                {r.refs.map((ref) => (
                  <p
                    key={ref.key}
                    className="text-sm text-fg-muted leading-snug"
                    title={t.pairTitle
                      .replace('{key}', ref.key)
                      .replace('{n}', String(ref.spots.length))
                      .replace('{spots}', ref.spots.join(', ') || '—')}
                  >
                    <span className="text-fg">
                      {ref.esName || ref.esCode}
                    </span>
                    {' → '}
                    <span className="text-fg">
                      {ref.ptRefName || ref.ptRefCode}
                    </span>
                    {ref.ptRefArea ? ` (${ref.ptRefArea})` : ''}
                    {' · '}
                    <span className="tabular-nums">
                      ME {sign(ref.me)} m · n={ref.n}
                    </span>
                  </p>
                ))}
              {r.suboptimal.length > 0 && (
                <div
                  className="space-y-1 rounded-md border border-data-period/30 bg-data-period/5 px-3 py-2"
                  data-coherence-suboptimal="true"
                >
                  <p className="text-xs font-semibold text-data-period">
                    {t.suboptimalTitle.replace('{n}', String(r.suboptimal.length))}
                  </p>
                  {r.suboptimal.map((s) => (
                    <p
                      key={`${s.spot}·${s.esCode}→${s.ptRefCode}`}
                      className="text-xs text-fg-muted leading-snug"
                      title={t.pairAuditTitle}
                    >
                      {s.spot}:
                      {' '}
                      <span className="tabular-nums">
                        {s.ptRefCode} {t.atWord}{' '}
                        {s.ptRefKm != null ? `${Math.round(s.ptRefKm)} km` : '—'}
                      </span>
                      {t.nearestArrow}
                      <span className="tabular-nums">
                        {s.nearestPtName || s.nearestPtCode} {t.atWord}{' '}
                        {s.nearestPtKm != null ? `${Math.round(s.nearestPtKm)} km` : '—'}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}
      <p className="text-xs text-fg-subtle">
        {t.updatedSample
          .replace('{date}', new Date(bias.fetchedAt ?? '').toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB'))
          .replace('{ih}', String(bias.buoys.filter((b) => b.source === 'ih').length))
          .replace('{es}', String(bias.buoys.filter((b) => b.source === 'wmo-es').length))}
        {bias.gatedCodes.length > 0 && (
          <>
            {' · '}
            {t.gateCodes
              .replace('{day}', bias.coherenceDay ?? '')
              .replace('{codes}', bias.gatedCodes.join(', '))}
          </>
        )}
      </p>
    </div>
  );
}