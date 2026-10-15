'use client';

/**
 * «Onda observada (boia)» na página de spot v6 (#184), dentro do «Estudar o
 * spot»: a leitura medida agora pela boia (IH ou WMO/Copernicus) com as suas
 * calibrações (cross-border ES→PT, skill acumulado, ponte keyless), o par IH
 * vs WMO com o vencedor e a razão, os avisos de coerência do par ES×PT e a
 * cadeia de atribuição da fonte. Markup e estilo v6 (v6-atlantico.css `.ec*`).
 *
 * Regra de ouro: a altura do MODELO não aparece aqui (está no Porquê e na
 * tabela); só o que a boia mede e a concordância com o modelo, sem número.
 * O aviso «Mar perigoso» também não: já está na régua (AvisoRegua).
 */
import { AlertTriangle } from 'lucide-react';
import { getCardinalLabel } from '@/lib/wind';
import { formatObservedClockTime } from '@/lib/observations';
import {
  isObservedWaveFresh,
  observedWaveDisclaimer,
  observedWaveLabel,
  verifyWave,
  waveCalibrationTag,
  waveVerificationBadge,
  type ObservedWave,
  type ObservedWaveMeta,
} from '@/lib/observedWave';
import { ATTRIBUTIONS, waveSourceAttributionId } from '@/lib/dataSources';
import { getTranslation } from '@/lib/i18n';
import { fmtNum } from '@/lib/spotVeredicto';
import { spotV6Copy } from '@/lib/translations/spotPage/v6';
import BoiaSkillV6 from './BoiaSkillV6';
import BoiaAvisoCamadaV6 from './BoiaAvisoCamadaV6';
import { decimalV6, fmtAgeHours, fmtDistanceKm, ihAEnvelhecer, razaoDaFonte } from './boiaFmt';

export interface BoiaV6Condicoes {
  waveHeight: number;
  observedWave?: ObservedWave;
  observedWaveAlt?: ObservedWave;
  observedWaveMeta?: ObservedWaveMeta;
  observedWaveCoherenceRefused?: { esCode: string; day?: string | null };
  observedWaveCoherenceWarning?: {
    esCode: string;
    ptRefCode?: string;
    days: number;
    firstDay?: string | null;
    lastDay?: string | null;
  };
}

export interface BoiaV6Props {
  spotId: string;
  locale: string;
  c: BoiaV6Condicoes;
  /** Relógio de frescura: o do build até montar (guarda React #418), depois o real. */
  agoraMs?: number;
  /** Rótulo «agora» (a leitura não acompanha a hora escolhida na régua). */
  agoraTag: string;
}

export default function BoiaV6({ spotId, locale, c, agoraMs, agoraTag }: BoiaV6Props) {
  const t = getTranslation(locale);
  const tv = t.spotVerify;
  const tsu = t.spotsUi;
  const isPt = locale === 'pt';
  const d = (s: string) => decimalV6(s, locale);
  const m1 = (x: number) => `${fmtNum(x, locale)} m`;

  const w = c.observedWave && isObservedWaveFresh(c.observedWave, agoraMs) ? c.observedWave : null;
  const alt = w && c.observedWaveAlt && isObservedWaveFresh(c.observedWaveAlt, agoraMs) ? c.observedWaveAlt : null;
  const meta = c.observedWaveMeta;
  const aviso = c.observedWaveCoherenceWarning;
  const recusa = c.observedWaveCoherenceRefused;

  const avisos = (
    <>
      {aviso ? (
        <p
          className="ec-alerta"
          data-coherence-warning="true"
          title={tv.coerWarnTitle
            .replace('{esCode}', aviso.esCode)
            .replace('{ref}', aviso.ptRefCode ? ` × ${aviso.ptRefCode}` : '')
            .replace('{days}', String(aviso.days))
            .replace('{first}', aviso.firstDay ?? '…')
            .replace('{last}', aviso.lastDay ?? '…')}
        >
          <AlertTriangle aria-hidden="true" />
          <span>{tv.coerWarnBody.replace('{days}', String(aviso.days))}</span>
        </p>
      ) : null}
      {recusa ? (
        <p className="ec-alerta" data-coherence-refused="true" title={tv.coerRefusedTitle.replace('{esCode}', recusa.esCode)}>
          <AlertTriangle aria-hidden="true" />
          <span>{tv.coerRefusedBody}</span>
        </p>
      ) : null}
    </>
  );

  // Sem leitura fresca: a linha do skill acumulado desta boia, a nota de
  // leitura antiga ou o porquê de não haver boia (camada IH/WMO em baixo).
  if (!w) {
    return (
      <div className="ec ec-boia" data-ec="boia" data-boia="sem-leitura">
        <h3 className="ec-t">
          {spotV6Copy(locale).boia} <span className="ec-tag">{agoraTag}</span>
        </h3>
        {c.observedWave ? <p className="ec-nota">{tv.staleBuoy}</p> : null}
        <BoiaSkillV6 spotId={spotId} locale={locale} />
        {!c.observedWave ? <BoiaAvisoCamadaV6 locale={locale} /> : null}
        {avisos}
      </div>
    );
  }

  const clock = formatObservedClockTime(w.observedAt, locale);
  const label = observedWaveLabel(w, locale);
  const fonteId = waveSourceAttributionId(w.source ?? 'ih-buoy');
  const verif = verifyWave(c.waveHeight, w.waveHeight);
  const badge = waveVerificationBadge(verif.agreement, locale);
  const calTag = waveCalibrationTag(w, locale);
  const card = w.waveDirection != null ? getCardinalLabel(w.waveDirection) : null;
  const extras = [
    w.wavePeriod != null ? `${Math.round(w.wavePeriod)} s` : null,
    card ? `${card} ${w.waveDirection != null ? `${Math.round(w.waveDirection)}°` : ''}`.trim() : null,
    w.waterTemp != null ? `${fmtNum(w.waterTemp, locale)} °C` : null,
    w.maxWaveHeight != null ? `Hmax ${m1(w.maxWaveHeight)}` : null,
  ].filter(Boolean) as string[];

  const fontes = alt
    ? [w, alt].map((x, i) => {
        const vence = i === 0;
        const ih = x.source === 'ih-buoy';
        const idade =
          (ih ? meta?.ihAgeHours : meta?.wmoAgeHours) ??
          ((agoraMs ?? Date.now()) - new Date(x.observedAt).getTime()) / 3_600_000;
        const km = vence ? null : fmtDistanceKm(x.distanceKm);
        const src = ih ? 'IH' : 'WMO';
        const idadeTxt = `(${fmtAgeHours(idade)}${km ? tsu.kmAway.replace('{km}', km) : ''})`;
        const estacao = x.stationName?.trim() || x.stationArea?.trim() || '';
        return {
          k: x.source,
          vence,
          src,
          idadeTxt,
          rotulo: observedWaveLabel(x, locale),
          title: tsu.waveSourcesTitle
            .replace('{src}', src)
            .replace('{winner}', vence ? ' ✓' : '')
            .replace('{age}', idadeTxt)
            .replace('{station}', estacao ? `${estacao} · ` : '')
            .replace('{clock}', formatObservedClockTime(x.observedAt, locale)),
        };
      })
    : null;

  const skill = w.skill && Number.isFinite(w.skill.me) ? w.skill : null;
  const skillTxt = (() => {
    if (!skill) return null;
    const sg = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
    const parts = [`ME ${sg(skill.me)} m`];
    if (typeof skill.mae === 'number') parts.push(`MAE ${skill.mae.toFixed(1)} m`);
    if (typeof skill.rmse === 'number') parts.push(`RMSE ${skill.rmse.toFixed(1)} m`);
    if (typeof skill.corr === 'number') parts.push(`r ${skill.corr.toFixed(2)}`);
    if (typeof skill.meanLeadHours === 'number') parts.push(`lead ${Math.round(skill.meanLeadHours)}h`);
    const es = skill.origin === 'wmo-es';
    const pt = skill.origin === 'wmo-pt';
    const nome = skill.buoyName || w.stationName;
    const corpo = es ? tv.skillBodyEs : pt ? tv.skillBodyWmoPt : tv.skillBodyIh;
    const titulo = es ? tv.skillTitleEs : pt ? tv.skillTitleWmoPt : tv.skillTitleIh;
    return {
      tipo: es ? 'es' : pt ? 'pt' : 'true',
      txt: d(corpo.replace('{name}', nome).replace('{parts}', parts.join(' · ')).replace('{n}', String(skill.n))),
      title: titulo.replace('{name}', nome),
    };
  })();

  return (
    <section className="ec ec-boia" aria-label={tv.observedWaveTitle} data-ec="boia" data-boia="leitura">
      <h3 className="ec-t">
        {tv.observedWaveTitle} <span className="ec-tag">{agoraTag}</span>
      </h3>
      <p className="ec-meta">{locale === 'en' ? `${clock} · ${label}` : `${label} · ${clock}`}</p>

      <div className="boia-med">
        <div>
          <p className="ec-rot">{tv.measuredHeight}</p>
          <p className="boia-val num">{m1(w.waveHeight)}</p>
        </div>
        <span className={`ec-chip ag-${verif.agreement}`} title={d(tv.deltaMTitle.replace('{delta}', `${verif.deltaM >= 0 ? '+' : ''}${verif.deltaM}`))}>
          {badge.label}
        </span>
      </div>
      {extras.length ? <p className="ec-num">{d(extras.join(' · '))}</p> : null}

      {calTag ? (
        <p className="ec-chips">
          <span className="ec-chip" data-wave-calibrated="compact" title={d(calTag.title)}>
            {d(calTag.label.replace(/^🔧\s*/, ''))}
          </span>
        </p>
      ) : null}

      {w.bridge ? (
        <p className="ec-destaque" data-wave-bridge="true" title={tv.bridgeTitle}>
          <span>
            {tv.bridgeLead}
            <strong>Cabo Silleiro (ES)</strong>
            {tv.bridgeTail.replace('{label}', label)}
          </span>
        </p>
      ) : null}

      {w.calibration
        ? (() => {
            const cal = w.calibration;
            const me = `${cal.me >= 0 ? '+' : ''}${cal.me.toFixed(1)}`;
            return (
              <p
                className="ec-destaque"
                data-wave-calibrated="true"
                title={d(
                  tv.calibrationTitle
                    .replace('{from}', cal.from ?? tv.calibrationDefaultFrom)
                    .replace('{me}', me)
                    .replace('{n}', String(cal.n)),
                )}
              >
                <span>
                  {tv.calibrationLead} <strong>{m1(cal.rawHeight)}</strong>
                  {' → '}
                  <strong>{m1(w.waveHeight)}</strong>
                  {d(tv.calibrationTail.replace('{me}', me).replace('{n}', String(cal.n)))}
                </span>
              </p>
            );
          })()
        : null}

      {fontes ? (
        <div className="boia-fontes">
          <div className="boia-par" role="group" aria-label={tsu.waveSourcesAria}>
            {fontes.map((f) => (
              <div key={f.k} className={`boia-fonte${f.vence ? ' vence' : ''}`} title={f.title}>
                <p className="ec-rot">
                  {f.vence ? '✓ ' : ''}
                  {f.src}
                  {f.vence ? <span className="boia-usa"> {tv.inUse}</span> : null}
                </p>
                <p>{f.rotulo}</p>
                <p className="ec-num">{f.idadeTxt}</p>
              </div>
            ))}
          </div>
          {ihAEnvelhecer(meta) ? (
            <p className="ec-alerta" data-ih-aging="true">
              <AlertTriangle aria-hidden="true" />
              <span>{tv.ihAging}</span>
            </p>
          ) : null}
          <p className="ec-nota">{razaoDaFonte(meta, tv)}</p>
        </div>
      ) : null}

      {skillTxt ? (
        <p className={skillTxt.tipo === 'true' ? 'ec-nota' : 'ec-destaque'} data-wave-skill={skillTxt.tipo} title={skillTxt.title}>
          {skillTxt.txt}
        </p>
      ) : null}

      {avisos}

      <footer className="ec-fonte">
        <p data-data-source={fonteId}>
          <b>{tv.measurementSource}</b>
          {isPt ? ATTRIBUTIONS[fonteId].notePt : ATTRIBUTIONS[fonteId].noteEn}
        </p>
        <p>{observedWaveDisclaimer(locale, w.source)}</p>
      </footer>
    </section>
  );
}
