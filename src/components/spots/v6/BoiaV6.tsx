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
 * O aviso «Mar perigoso» também não: já está na régua (AvisoRegua). Cada
 * número uma vez também dentro do cartão: a distância da boia vive na linha
 * de cima (e, para a de reserva, no par), a altura corrigida só no valor
 * grande, o viés só na frase do skill (em cm).
 *
 * Linguagem de surfista (follow-up do #227): o selo «agora» só aparece com a
 * leitura fresca; antiga, mostra a idade verdadeira no tom névoa. O skill é
 * uma frase; ME, MAE, RMSE, r, n e o acerto ES→PT ficam numa linha
 * «detalhes» fechada (letra pequena) e no tooltip. Copy em
 * `spotMedeSabe` (5 línguas).
 */
import { AlertTriangle } from 'lucide-react';
import { getCardinalLabel } from '@/lib/wind';
import { formatObservedClockTime } from '@/lib/observations';
import {
  isObservedWaveFresh,
  observedWaveDisclaimer,
  observedWaveLabel,
  verifyWave,
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
import DetalhesV6 from './DetalhesV6';
import { decimalV6, fmtAgeHours, fmtDistanceKm, idadeLeitura, ihAEnvelhecer, razaoDaFonte, skillSimples } from './boiaFmt';

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
}

/** Selo de frescura: «agora» no tom activo só com leitura fresca; antiga, a idade no tom névoa. */
function SeloIdade({ idade, title }: { idade: { txt: string; fresca: boolean } | null; title?: string }) {
  if (!idade) return null;
  return (
    <span className={`ec-tag ${idade.fresca ? 'viva' : 'idade'}`} data-boia-idade={idade.fresca ? 'fresca' : 'antiga'} title={title}>
      {idade.txt}
    </span>
  );
}

export default function BoiaV6({ spotId, locale, c, agoraMs }: BoiaV6Props) {
  const t = getTranslation(locale);
  const tv = t.spotVerify;
  const tsu = t.spotsUi;
  const ms = t.spotMedeSabe;
  const isPt = locale === 'pt';
  const agora = agoraMs ?? Date.now();
  const d = (s: string) => decimalV6(s, locale);
  const m1 = (x: number) => `${fmtNum(x, locale)} m`;

  const w = c.observedWave && isObservedWaveFresh(c.observedWave, agoraMs) ? c.observedWave : null;
  const alt = w && c.observedWaveAlt && isObservedWaveFresh(c.observedWaveAlt, agoraMs) ? c.observedWaveAlt : null;
  const meta = c.observedWaveMeta;
  const aviso = c.observedWaveCoherenceWarning;
  const recusa = c.observedWaveCoherenceRefused;
  const leitura = c.observedWave;
  const idade = leitura ? idadeLeitura(leitura.observedAt, agora, !!w, locale, ms) : null;
  const idadeTitle = leitura && idade
    ? ms.idadeTitle.replace('{quando}', `${formatObservedClockTime(leitura.observedAt, locale)} (${idade.txt})`)
    : undefined;

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
          <span>{ms.coerAviso.replace('{days}', String(aviso.days))}</span>
        </p>
      ) : null}
      {recusa ? (
        <p className="ec-alerta" data-coherence-refused="true" title={tv.coerRefusedTitle.replace('{esCode}', recusa.esCode)}>
          <AlertTriangle aria-hidden="true" />
          <span>{ms.coerRecusa}</span>
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
          {spotV6Copy(locale).boia} <SeloIdade idade={idade} title={idadeTitle} />
        </h3>
        {c.observedWave ? <p className="ec-nota">{ms.velhaNota}</p> : null}
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
  const card = w.waveDirection != null ? getCardinalLabel(w.waveDirection) : null;
  // Em palavras: «de 10 em 10 s · de NW · água 17 °C · maior onda 2,9 m» (sem siglas nem graus).
  const extras = [
    w.wavePeriod != null ? ms.periodo.replace(/\{s\}/g, String(Math.round(w.wavePeriod))) : null,
    card ? ms.de.replace('{dir}', card) : null,
    w.waterTemp != null ? ms.agua.replace('{t}', `${fmtNum(w.waterTemp, locale)} °C`) : null,
    w.maxWaveHeight != null ? ms.maiorOnda.replace('{h}', m1(w.maxWaveHeight)) : null,
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
        const idadeTxt = d(`(${fmtAgeHours(idade)}${km ? tsu.kmAway.replace('{km}', km) : ''})`);
        const estacao = x.stationName?.trim() || x.stationArea?.trim() || '';
        return {
          k: x.source,
          vence,
          src,
          idadeTxt,
          // Sem a distância: a da vencedora está na linha de cima, a da reserva já vai na idade.
          rotulo: estacao ? ms.boiaDe.replace('{name}', estacao) : observedWaveLabel(x, locale),
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
    const simples = skillSimples({ me: skill.me, mae: skill.mae }, ms);
    if (!simples) return null;
    const sg = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
    const es = skill.origin === 'wmo-es';
    const pt = skill.origin === 'wmo-pt';
    const nome = skill.buoyName || w.stationName;
    const titulo = es ? tv.skillTitleEs : pt ? tv.skillTitleWmoPt : tv.skillTitleIh;
    // Tooltip: os números técnicos todos (ME incluído) + a definição.
    const tec = [`ME ${sg(skill.me)} m`];
    if (typeof skill.mae === 'number') tec.push(`MAE ${skill.mae.toFixed(1)} m`);
    if (typeof skill.rmse === 'number') tec.push(`RMSE ${skill.rmse.toFixed(1)} m`);
    if (typeof skill.corr === 'number') tec.push(`r ${skill.corr.toFixed(2)}`);
    // «detalhes»: só o que a frase não diz (o viés vai sempre na frase; o erro médio às vezes).
    const det: string[] = [];
    if (typeof skill.mae === 'number' && !simples.disseErro) det.push(ms.detMae.replace('{v}', skill.mae.toFixed(1)));
    if (typeof skill.rmse === 'number') det.push(ms.detRmse.replace('{v}', skill.rmse.toFixed(1)));
    if (typeof skill.corr === 'number') det.push(ms.detR.replace('{v}', skill.corr.toFixed(2)));
    if (typeof skill.meanLeadHours === 'number') det.push(ms.detLead.replace('{h}', String(Math.round(skill.meanLeadHours))));
    det.push(ms.detN.replace('{n}', String(skill.n)));
    const quem = es ? ms.skillBoiaEs.replace('{name}', nome) : pt ? ms.skillBoiaWmoPt.replace('{name}', nome) : '';
    return {
      tipo: es ? 'es' : pt ? 'pt' : 'true',
      txt: quem ? `${quem} ${simples.frase}` : simples.frase,
      det,
      title: d(`${tec.join(' · ')} (n=${skill.n}) — ${titulo.replace('{name}', nome)}`),
    };
  })();

  // A razão da fonte em linguagem simples (mesma lógica de razaoDaFonte, outras palavras).
  const razoes = {
    reasonNoMeta: ms.razaoSemMeta,
    reasonWmoOnly: ms.razaoSoWmo,
    reasonIhOnly: ms.razaoSoIh,
    reasonFresherCloser: ms.razaoPertoFresca,
    reasonFresher: ms.razaoFresca,
    reasonCloser: ms.razaoPerto,
    reasonIhFresh: ms.razaoIh,
  } as unknown as Parameters<typeof razaoDaFonte>[1];

  // Linha «detalhes» do cartão: os números técnicos do skill e do acerto ES→PT.
  const detalhes: string[] = skillTxt?.det.length ? [skillTxt.det.join(' · ')] : [];
  if (w.calibration && Number.isFinite(w.calibration.me)) {
    const cal = w.calibration;
    detalhes.push(
      ms.detCal
        .replace('{me}', `${cal.me >= 0 ? '+' : ''}${cal.me.toFixed(1)}`)
        .replace('{n}', String(cal.n))
        .replace('{from}', cal.from ?? ms.detCalDe),
    );
  }

  return (
    <section className="ec ec-boia" aria-label={tv.observedWaveTitle} data-ec="boia" data-boia="leitura">
      <h3 className="ec-t">
        {tv.observedWaveTitle} <SeloIdade idade={idade} title={idadeTitle} />
      </h3>
      <p className="ec-meta">{locale === 'en' ? `${clock} · ${label}` : `${label} · ${clock}`}</p>

      <div className="boia-med">
        <div>
          <p className="ec-rot">{tv.measuredHeight}</p>
          <p className="boia-val num">{m1(w.waveHeight)}</p>
        </div>
        <span className={`ec-chip ag-${verif.agreement}`} title={d(tv.deltaMTitle.replace('{delta}', `${verif.deltaM >= 0 ? '+' : ''}${verif.deltaM}`))}>
          {ms.concorda[verif.agreement] ?? badge.label}
        </span>
      </div>
      {extras.length ? <p className="ec-num">{d(extras.join(' · '))}</p> : null}

      {w.bridge ? (
        <p className="ec-destaque" data-wave-bridge="true" title={tv.bridgeTitle}>
          <span>
            {ms.ponteA}
            <strong>Cabo Silleiro (ES)</strong>
            {ms.ponteB}
          </span>
        </p>
      ) : null}

      {w.calibration ? (
        <p
          className="ec-destaque"
          data-wave-calibrated="true"
          title={d(
            tv.calibrationTitle
              .replace('{from}', w.calibration.from ?? tv.calibrationDefaultFrom)
              .replace('{me}', `${w.calibration.me >= 0 ? '+' : ''}${w.calibration.me.toFixed(1)}`)
              .replace('{n}', String(w.calibration.n)),
          )}
        >
          {/* o chip compacto «ref. PT (ME · n)» saiu: repetia o viés, que fica nos detalhes e neste título */}
          <span>{d(ms.calibrada.replace('{raw}', m1(w.calibration.rawHeight)))}</span>
        </p>
      ) : null}

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
              <span>{ms.ihVelho}</span>
            </p>
          ) : null}
          <p className="ec-nota">{razaoDaFonte(meta, razoes)}</p>
        </div>
      ) : null}

      {skillTxt ? (
        <p className={skillTxt.tipo === 'true' ? 'ec-frase' : 'ec-destaque'} data-wave-skill={skillTxt.tipo} title={skillTxt.title}>
          {skillTxt.txt}
        </p>
      ) : null}

      {detalhes.length ? (
        <DetalhesV6 rotulo={ms.detalhes} data-boia-det="true">
          {detalhes.map((x) => (
            <p key={x}>{d(x)}</p>
          ))}
        </DetalhesV6>
      ) : null}

      {avisos}

      <footer className="ec-fonte">
        <p data-data-source={fonteId}>
          <b>{tv.measurementSource}</b>
          {isPt ? ATTRIBUTIONS[fonteId].notePt : ATTRIBUTIONS[fonteId].noteEn}
        </p>
        <p title={observedWaveDisclaimer(locale, w.source)}>{w.source === 'wmo-buoy' ? ms.discWmo : ms.discIh}</p>
      </footer>
    </section>
  );
}
