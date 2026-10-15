'use client';

/**
 * «O que se mede e o que se sabe» — o fim do «Estudar o spot» v6 (#184,
 * decisão do Pedro de 2026-10-15): a boia agora (com as calibrações), maré e
 * lua, sol e ar (UV e qualidade do ar), o fundo perto da praia (isóbatas IH, num perfil
 * desenhado), o clima do spot (NASA POWER) e a ligação ao Windguru. Tudo em
 * markup e tokens v6 (`.ec*` em v6-atlantico.css), nada do estilo antigo.
 *
 * Regra de ouro: cada número uma vez na página. A altura e a hora da maré
 * que o Porquê já cita (a próxima preia/baixa-mar da hora escolhida) não se
 * repetem na tabela de marés; vento, onda e altura de maré da hora vivem no
 * Porquê e na tabela hora a hora. Aqui só o que lá não está.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { getMoonPhase } from '@/lib/moonPhase';
import { dailyTideAmplitudeMetres } from '@/lib/tideAmplitude';
import type { TideHourPoint } from '@/lib/tideSchedule';
import type { MareExtremo } from '@/lib/horaSpot';
import { europeanAqiLevel } from '@/lib/airQuality';
import { loadSpotIsobaths, isobathDistancesForSpot, ISOBATH_DEPTHS } from '@/lib/spotIsobaths';
import { loadClimatology, spotClimatology, monthlyMax, type SpotClimatology } from '@/lib/climatology';
import { getWindguruUrl } from '@/lib/windguru';
import { getCardinalLabel } from '@/lib/wind';
import { diaCurto, fmtNum, hmTxt, horaDe, horaTxt } from '@/lib/spotVeredicto';
import { fmtCopy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';
import BoiaV6, { type BoiaV6Condicoes } from './BoiaV6';
import { decimalV6 } from './boiaFmt';
import { useColunasEquilibradas } from './colunasEquilibradas';

const MS_KT = 1.94384;
/** |anomalia| a partir da qual a maré meteorológica é assinalada (scripts/lib/tideAnomaly). */
const SURGE_M = 0.3;

export interface MedeSabeCondicoes extends BoiaV6Condicoes {
  uvIndex?: number;
  uvIndexMax?: number;
  airQualityIndex?: number;
  tideObservedHeight?: number;
  tideStation?: string;
  tideAnomalyM?: number;
  currentMeasuredSpeed?: number;
  currentMeasuredDir?: number;
  currentMeasuredAt?: string;
}

export interface MedeSabeV6Props {
  spot: { id: string; slug: string; name: string; nameEn: string; lat: number; lon: number };
  locale: string;
  copy: SpotPageV6Copy;
  /** Hora escolhida na régua (ISO local) e se é «agora». */
  t: string;
  ehAgora: boolean;
  /** Extremos de maré da janela (os mesmos do Porquê) e o que o Porquê cita. */
  mares: readonly MareExtremo[];
  citada?: MareExtremo;
  /** Curva da maré (forecast cru) para a amplitude do dia. */
  mareCurva: readonly TideHourPoint[];
  /** UV por hora (ISO local `YYYY-MM-DDTHH:MM` → índice). */
  uvPorHora: Readonly<Record<string, number>>;
  c: MedeSabeCondicoes;
  /** Relógio: o do build até montar (guarda React #418), depois `undefined` = relógio real. */
  agoraMs?: number;
}

/**
 * Parte iluminada do disco: o semicírculo do lado aceso (direita a crescer,
 * esquerda a minguar, visto de Portugal) fechado pelo terminador, uma
 * semi-elipse de raio horizontal r·|1−2k| (k = fracção iluminada).
 */
export function luaAcesa(cx: number, cy: number, r: number, k: number, cresce: boolean): string {
  const f = Math.max(0, Math.min(1, k));
  if (f <= 0.002) return '';
  if (f >= 0.998) return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
  const rx = Math.round(r * Math.abs(1 - 2 * f) * 100) / 100;
  const fora = cresce ? 1 : 0;
  const dentro = cresce ? (f < 0.5 ? 0 : 1) : f < 0.5 ? 1 : 0;
  return `M${cx} ${cy - r}A${r} ${r} 0 0 ${fora} ${cx} ${cy + r}A${rx} ${r} 0 0 ${dentro} ${cx} ${cy - r}Z`;
}

function Lua({ ilum, cresce, titulo }: { ilum: number; cresce: boolean; titulo: string }) {
  const d = luaAcesa(24, 24, 21, ilum, cresce);
  return (
    <svg className="ec-lua" viewBox="0 0 48 48" role="img" aria-label={titulo}>
      <circle cx="24" cy="24" r="21" fill="#0C2A42" stroke="#1E4361" strokeWidth="1.5" />
      {d ? <path d={d} fill="#F3F8FB" /> : null}
    </svg>
  );
}

function MareLua({ locale, copy: c, t, mares, citada, mareCurva, dataMs, cond }: {
  locale: string;
  t: string;
  copy: SpotPageV6Copy;
  mares: readonly MareExtremo[];
  citada?: MareExtremo;
  mareCurva: readonly TideHourPoint[];
  dataMs: number;
  cond: MedeSabeCondicoes;
}) {
  const tr = getTranslation(locale);
  const mt = tr.moonTide;
  const ti = tr.spotPageInstruments;
  const ms = tr.spotMedeSabe;
  const data = new Date(dataMs);
  const lua = getMoonPhase(data);
  const amp = mareCurva.length ? dailyTideAmplitudeMetres([...mareCurva], data) : null;
  // Só as marés DEPOIS da hora escolhida e sem a que o Porquê já cita. Só o tipo
  // e a hora ao minuto: a altura já está na coluna «Maré» da tabela hora a hora,
  // logo acima (cada número uma vez).
  const tabela = mares.filter((m) => m.t > t && !(citada && m.t === citada.t)).slice(0, 6);
  const nf = (x: number) => fmtNum(x, locale);
  return (
    <div className="ec ec-mare" data-ec="mare-lua">
      <h3 className="ec-t">{c.mareLua}</h3>
      <div className="ec-lua-l">
        <Lua ilum={lua.illumination} cresce={lua.waxing} titulo={mt.phase[lua.name]} />
        <div>
          <p className="ec-forte">{mt.phase[lua.name]}</p>
          <p className="ec-chips">
            <span className={`ec-chip reg-${lua.tideRegime === 'transição' ? 'transicao' : lua.tideRegime}`}>{mt.regime[lua.tideRegime]}</span>
          </p>
        </div>
      </div>
      <p className="ec-nota">{mt.meaning[lua.tideRegime]}</p>
      {amp != null ? <p className="ec-num" data-amplitude>{decimalV6(ms.amplitude.replace('{v}', amp.toFixed(1)), locale)}</p> : null}
      {mares.length ? (
        <>
          <p className="ec-rot">{c.maresSeguintes}</p>
          {tabela.length ? (
            <table className="ec-tab" data-ec="mares">
              <tbody>
                {tabela.map((m) => (
                  <tr key={m.t} data-mare={m.tipo}>
                    <th scope="row">{m.tipo === 'PM' ? c.pm : c.bm}</th>
                    <td>
                      {diaCurto(c, m.t)}, {hmTxt(c, m.t, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ec-nota">{c.maresSemMais}</p>
          )}
        </>
      ) : null}
      {cond.tideObservedHeight != null ? (
        <p className="ec-num" data-tide-observed>
          {ms.mareMedida.replace('{obs}', nf(cond.tideObservedHeight)).replace('{station}', cond.tideStation ?? '')}
        </p>
      ) : null}
      {cond.tideAnomalyM != null ? (
        <p className={`ec-num${Math.abs(cond.tideAnomalyM) >= SURGE_M ? ' alerta' : ''}`} data-tide-anomaly>
          {(cond.tideAnomalyM >= 0 ? ms.mareAcima : ms.mareAbaixo).replace('{v}', nf(Math.abs(cond.tideAnomalyM)))}
          {Math.abs(cond.tideAnomalyM) >= SURGE_M ? ` · ${ms.mareVento}` : ''}
        </p>
      ) : null}
      {cond.currentMeasuredSpeed != null ? (
        <p
          className="ec-num"
          data-current-measured
          title={
            cond.currentMeasuredAt
              ? `${ms.correnteTitle} ${cond.currentMeasuredAt.replace('T', ' ').replace(':00Z', ' UTC')}`
              : ti.currentMeasuredTitle
          }
        >
          {ms.corrente
            .replace('{spd}', nf(cond.currentMeasuredSpeed))
            .replace('{dir}', cond.currentMeasuredDir != null ? getCardinalLabel(cond.currentMeasuredDir) : '')}
        </p>
      ) : null}
    </div>
  );
}

function SolAr({ locale, copy: c, t, ehAgora, uvPorHora, cond }: {
  locale: string;
  copy: SpotPageV6Copy;
  t: string;
  ehAgora: boolean;
  uvPorHora: Readonly<Record<string, number>>;
  cond: MedeSabeCondicoes;
}) {
  const tr = getTranslation(locale);
  const td = tr.spotDetail;
  const ms = tr.spotMedeSabe;
  const uv = uvPorHora[t] ?? (ehAgora ? cond.uvIndex : undefined);
  const dia = t.slice(0, 10);
  const doDia = Object.entries(uvPorHora)
    .filter(([k]) => k.startsWith(dia))
    .map(([, v]) => v);
  const uvMax = doDia.length ? Math.max(...doDia) : ehAgora ? cond.uvIndexMax : undefined;
  const aqi = cond.airQualityIndex != null && Number.isFinite(cond.airQualityIndex) ? cond.airQualityIndex : null;
  if (uv == null && aqi == null) return null;
  const q = ehAgora ? c.agora : `${diaCurto(c, t)}, ${horaTxt(c, horaDe(t))}`;
  const niveis: Record<string, string> = {
    good: td.aqiLevelGood,
    fair: td.aqiLevelFair,
    moderate: td.aqiLevelModerate,
    poor: td.aqiLevelPoor,
    veryPoor: td.aqiLevelVeryPoor,
    extreme: td.aqiLevelExtreme,
  };
  const nivelUv = uv == null ? '' : uv >= 8 ? 'alto' : uv >= 6 ? 'medio' : 'baixo';
  // Escala da OMS em palavras: 0–2 baixo · 3–5 moderado · 6–7 alto · 8–10 muito alto · 11+ extremo.
  const uvR = uv == null ? 0 : Math.round(uv);
  const uvPalavra = uv == null ? '' : ms.uvNivel[uvR >= 11 ? 'extremo' : uvR >= 8 ? 'muitoAlto' : uvR >= 6 ? 'alto' : uvR >= 3 ? 'moderado' : 'baixo'];
  return (
    <div className="ec ec-solar" data-ec="sol-ar">
      <h3 className="ec-t">{c.solAr}</h3>
      {uv != null ? (
        <div className="ec-par" title={td.uvHint} data-uv>
          <p className="ec-rot">{fmtCopy(c.uvHora, { q })}</p>
          <p className={`ec-grande num uv-${nivelUv}`}>
            {uvR}
            <small data-uv-nivel>{uvPalavra}</small>
          </p>
          {uvMax != null ? <p className="ec-nota">{fmtCopy(c.uvMax, { v: Math.round(uvMax) })}</p> : null}
        </div>
      ) : null}
      {aqi != null ? (
        <div className="ec-par" title={ms.arTitle} data-aqi>
          {/* sem «agora»: o índice vem do build (previsão CAMS), não de uma leitura com hora */}
          <p className="ec-rot">{ms.ar}</p>
          <p className="ec-grande ec-palavra">{maiuscula(niveis[europeanAqiLevel(aqi)])}</p>
          <p className="ec-nota">{ms.arIndice.replace('{v}', String(Math.round(aqi)))}</p>
        </div>
      ) : null}
    </div>
  );
}

function maiuscula(x: string): string {
  return x ? x.charAt(0).toLocaleUpperCase() + x.slice(1) : x;
}

function kmTxt(km: number, locale: string): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${fmtNum(km, locale)} km`;
}

/** Perfil do fundo: a praia à esquerda, a linha do fundo a descer pelas isóbatas 8/16/30 m. */
function Fundo({ spotId, locale, copy: c }: { spotId: string; locale: string; copy: SpotPageV6Copy }) {
  const tsu = getTranslation(locale).spotsUi;
  const ms = getTranslation(locale).spotMedeSabe;
  const [dist, setDist] = useState<Record<number, number> | null>(null);
  useEffect(() => {
    let cancelado = false;
    loadSpotIsobaths()
      .then((f) => {
        if (!cancelado) setDist(isobathDistancesForSpot(f, spotId));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [spotId]);
  if (!dist) return null;
  const pts = ISOBATH_DEPTHS.filter((p) => typeof dist[p] === 'number').map((p) => ({ p, km: dist[p] as number }));
  if (!pts.length) return null;
  const W = 320;
  const H = 132;
  const x0 = 34;
  const y0 = 26;
  const maxKm = Math.max(...pts.map((q) => q.km)) * 1.12 || 1;
  const X = (km: number) => x0 + (km / maxKm) * (W - x0 - 12);
  const Y = (p: number) => y0 + (p / 30) * (H - y0 - 18);
  const linha = [`M${x0} ${y0}`, ...pts.map((q) => `L${X(q.km).toFixed(1)} ${Y(q.p).toFixed(1)}`)].join(' ');
  const ultimo = pts[pts.length - 1];
  const fundo = `${linha} L${(W - 4).toFixed(1)} ${Y(ultimo.p).toFixed(1)} L${W - 4} ${H} L${x0} ${H} Z`;
  const lista = pts.map((q) => fmtCopy(c.fundoA, { p: q.p, d: kmTxt(q.km, locale) })).join(' · ');
  const rapido = typeof dist[30] === 'number' && (dist[30] as number) < 1;
  return (
    <div className="ec ec-fundo" data-ec="fundo" data-testid="isobaths-strip">
      <h3 className="ec-t">{tsu.seabedNearBeach}</h3>
      <svg className="ec-perfil" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fmtCopy(c.fundoAria, { lista })}>
        <rect x={x0} y={y0} width={W - x0 - 4} height={H - y0} fill="#0C2A42" />
        <path d={fundo} fill="#04131F" />
        <path d={linha} fill="none" stroke="#7FE7FF" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={`M0 ${y0} L${x0} ${y0} L${x0} ${H} L0 ${H} Z`} fill="#C9B07A" opacity=".85" />
        <line x1={x0} y1={y0} x2={W - 4} y2={y0} stroke="#A9C2D4" strokeWidth="1" strokeDasharray="3 4" />
        {pts.map((q) => (
          <g key={q.p}>
            <circle cx={X(q.km)} cy={Y(q.p)} r="4" fill="#7FE7FF" />
            <text x={X(q.km)} y={Y(q.p) - 9} textAnchor="middle" className="ec-perfil-p">
              {q.p} m
            </text>
          </g>
        ))}
      </svg>
      <ul className="ec-isob">
        {pts.map((q) => (
          <li key={q.p}>
            <span>{q.p} m</span>
            <b className="num">{kmTxt(q.km, locale)}</b>
          </li>
        ))}
      </ul>
      <p className="ec-nota">{rapido ? c.fundoRapido : c.fundoLento}</p>
      <p className="ec-fonte" title={tsu.isobathTitle}>
        {ms.fundoFonte}
      </p>
    </div>
  );
}

function Clima({ spotId, locale, copy: c, mes }: { spotId: string; locale: string; copy: SpotPageV6Copy; mes: number }) {
  const tc = getTranslation(locale).spotPageContext;
  const [clima, setClima] = useState<SpotClimatology | null>(null);
  useEffect(() => {
    let cancelado = false;
    loadClimatology()
      .then((f) => {
        if (!cancelado) setClima(spotClimatology(f, spotId));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [spotId]);
  if (!clima?.wind) return null;
  const max = monthlyMax(clima.wind) || 1;
  const fmtMes = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', { month: 'short' });
  const nomes = Array.from({ length: 12 }, (_, m) => fmtMes.format(new Date(2024, m, 1)).replace('.', ''));
  const kt = (v: number | null) => (v == null ? '–' : String(Math.round(v * MS_KT)));
  const tp = clima.temp?.[mes];
  const pp = clima.precip?.[mes];
  return (
    <div className="ec ec-clima" data-ec="clima" data-spot-climate>
      <h3 className="ec-t">{tc.climate}</h3>
      <div className="ec-barras" role="img" aria-label={c.climaBarras}>
        {clima.wind.map((v, i) => (
          <div key={i} className={i === mes ? 'agora' : undefined} title={`${nomes[i]}: ${kt(v)} ${c.nos}`}>
            <i style={{ height: `${v == null ? 2 : Math.max(3, (v / max) * 56)}px` }} />
            <span>{nomes[i].slice(0, 1).toUpperCase()}</span>
          </div>
        ))}
      </div>
      <p className="ec-num">
        {fmtCopy(c.climaMes, {
          mes: nomes[mes],
          w: kt(clima.wind[mes]),
          t: tp == null ? '–' : fmtNum(tp, locale),
          p: pp == null ? '–' : fmtNum(pp, locale),
        })}
      </p>
      <p className="ec-fonte" title={tc.climateSource}>
        {getTranslation(locale).spotMedeSabe.climaFonte}
      </p>
    </div>
  );
}

export default function MedeSabeV6({ spot, locale, copy: c, t, ehAgora, mares, citada, mareCurva, uvPorHora, c: cond, agoraMs }: MedeSabeV6Props) {
  const [dataMs, setDataMs] = useState(agoraMs ?? 0);
  useEffect(() => {
    setDataMs(agoraMs ?? Date.now());
  }, [agoraMs]);
  const mes = useMemo(() => new Date(dataMs).getMonth(), [dataMs]);
  const grelha = useRef<HTMLDivElement>(null);
  useColunasEquilibradas(grelha);
  const windguru = getWindguruUrl(spot.slug, locale === 'pt' ? spot.name : spot.nameEn, spot.lat, spot.lon);
  return (
    <section className="medesabe" aria-labelledby="medesabe-t" data-testid="spot-mede-sabe">
      <h3 className="ec-sec" id="medesabe-t">
        {c.medeSabe}
      </h3>
      <div className="ec-grelha" ref={grelha} data-testid="spot-mede-sabe-grelha">
        <BoiaV6 spotId={spot.id} locale={locale} c={cond} agoraMs={agoraMs} />
        {/* o que se lê agora (boia, sol e ar) antes do que se calcula (maré, fundo, clima);
            em colunas (≥760 px) a distribuição sai das alturas reais (colunasEquilibradas) */}
        <SolAr locale={locale} copy={c} t={t} ehAgora={ehAgora} uvPorHora={uvPorHora} cond={cond} />
        <MareLua locale={locale} copy={c} t={t} mares={mares} citada={citada} mareCurva={mareCurva} dataMs={dataMs} cond={cond} />
        <Fundo spotId={spot.id} locale={locale} copy={c} />
        <Clima spotId={spot.id} locale={locale} copy={c} mes={mes} />
      </div>
      <p className="ec-ext">
        <a className="acao" href={windguru} target="_blank" rel="noopener noreferrer" data-windguru>
          {c.windguru}
          <ExternalLink aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}
