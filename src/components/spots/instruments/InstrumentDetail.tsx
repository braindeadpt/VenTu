'use client';

import { AlertTriangle, Wind } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import type { Spot } from '@/types';
import type { SpotDashboardConditions } from '@/components/spots/SpotConditionsDashboard';
import type { TideHourPoint, TideSchedule } from '@/lib/tideSchedule';
import { getWindRelationLabel, getWindRelationToCoast, type WindRelation } from '@/lib/wind';
import { isObservedFresh } from '@/lib/observations';
import { isObservedWaveFresh } from '@/lib/observedWave';
import type { ScoreWindCorrection, ScoreWindSource } from '@/lib/scoreConditions';
import ObservedNow from '@/components/spots/ObservedNow';
import ObservedWaveCard from '@/components/spots/ObservedWaveCard';
import BuoySkillLine from '@/components/spots/BuoySkillLine';
import BuoyLayerNotice from '@/components/spots/BuoyLayerNotice';
import IsobathsStrip from '@/components/spots/IsobathsStrip';
import TideScheduleStrip from '@/components/spots/TideScheduleStrip';
import MoonTideCard from '@/components/spots/MoonTideCard';
import SwellTrainsTable from '@/components/spots/SwellTrainsTable';
import WaveCalibrationTag from '@/components/ui/WaveCalibrationTag';
import WindFlowGlyph from '@/components/ui/WindFlowGlyph';
import ScoreWindSourceBadge from '@/components/ui/ScoreWindSourceBadge';
import { INSTRUMENT_DETAIL_ID, type InstrumentId } from './InstrumentCard';
import { getInstrumentFmt } from './format';
import type { InstrumentHour } from './types';

/**
 * Painel de detalhe único por baixo dos três cartões (spec §4).
 * Vento → ObservedNow, relação vento↔costa, WindFlowGlyph, fonte do vento.
 * Onda → SwellTrainsTable, ObservedWaveCard, BuoySkillLine,
 *        BuoyLayerNotice, IsobathsStrip, WaveCalibrationTag.
 * Maré → TideScheduleStrip, MoonTideCard, temperatura da água.
 *
 * Valores só observados (estação IPMA/Ecowitt, bóia IH/WMO) levam o
 * rótulo «agora» — não fingem acompanhar a hora escolhida no eixo.
 */

interface InstrumentDetailProps {
  open: InstrumentId;
  spot: Spot;
  locale: string;
  conditions: SpotDashboardConditions;
  /** Linha da hora escolhida (modelo) — os valores seguem o eixo de tempo. */
  hour: InstrumentHour | null;
  tideSchedule: TideSchedule | null;
  tideHourly?: TideHourPoint[];
  /** Relógio de frescura (bakedAtMs até montar — guarda React #418). */
  freshnessNowMs?: number;
  scoreWindSource: ScoreWindSource;
  scoreWindCorrection: ScoreWindCorrection | null;
  copy: {
    gustLabel: string;
    gustHint: string;
    windContextTitle: string;
    windRelationHints: Record<WindRelation, string>;
    radarFootnote: string;
  };
}

const MS_TO_KT = 1.94384;

export default function InstrumentDetail({
  open,
  spot,
  locale,
  conditions,
  hour,
  tideSchedule,
  tideHourly,
  freshnessNowMs,
  scoreWindSource,
  scoreWindCorrection,
  copy,
}: InstrumentDetailProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const tv = getTranslation(locale).spotVerify;
  const td = getTranslation(locale).spotDetail;
  const fmt = getInstrumentFmt(locale);
  const isPt = locale === 'pt';

  const name = open === 'wind' ? ti.wind : open === 'wave' ? ti.wave : ti.tide;

  const freshObserved =
    conditions.observed && isObservedFresh(conditions.observed.observedAt, undefined, freshnessNowMs)
      ? conditions.observed
      : null;
  const freshObservedWave =
    conditions.observedWave && isObservedWaveFresh(conditions.observedWave, freshnessNowMs)
      ? conditions.observedWave
      : null;
  const obsWorkerEnabled = Boolean(process.env.NEXT_PUBLIC_OBS_WORKER_URL?.trim());

  const windDir = hour?.windDirectionDeg ?? conditions.windDirection;
  const windSpeedMs = hour?.windSpeedMs ?? conditions.windSpeed;
  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(windDir, spot.coastOrientation)
      : null;
  const windRelationMeta = windRelation
    ? getWindRelationLabel(windRelation, isPt ? 'pt' : 'en')
    : null;
  const gustKt = (hour?.windGustMs ?? conditions.windGust ?? windSpeedMs) * MS_TO_KT;

  // Feixes de ondulação na hora escolhida (modelo) — com o snapshot
  // `conditions` como fallback enquanto as linhas não chegam. A 2.ª perna
  // é o mar de vento (windWaveHeight) da linha — a row não traz
  // período/direcção secundários, por isso caem fora quando há linha.
  const trainConditions = hour
    ? {
        swellHeight: hour.swellHeightM,
        swellPeriod: hour.swellPeriodS,
        swellDirection: hour.swellDirectionDeg,
        secondarySwellHeight: hour.windWaveHeightM,
        waveHeight: hour.waveHeightM,
        wavePeriod: hour.wavePeriodS,
      }
    : conditions;

  const waterTemp = hour?.waterTempC ?? conditions.waterTemp;

  return (
    <div
      id={INSTRUMENT_DETAIL_ID}
      className="ventu-inst-detail mt-4 rounded-lg border border-divider bg-surface-1/[0.03] p-4"
      role="region"
      aria-label={ti.detailAria.replace('{name}', name)}
      data-detail={open}
    >
      <p className="m-0 mb-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold tracking-[0.02em] text-fg">{ti.detailAria.replace('{name}', name)}</p>

      {open === 'wind' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-2.5">
            <h3 className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              {ti.obsStation} <span className="rounded-full border border-divider px-2 py-1 text-[11px] leading-none text-fg-subtle">{ti.nowTag}</span>
            </h3>
            <ObservedNow
              observed={conditions.observed}
              forecastWindSpeedMs={windSpeedMs}
              locale={locale}
              lat={spot.lat}
              lon={spot.lon}
              freshnessNowMs={freshnessNowMs}
            />
            {!freshObserved && conditions.observed && (
              <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{tv.staleObservation}</p>
            )}
            {!freshObserved && !conditions.observed && !obsWorkerEnabled && (
              <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{tv.noStation}</p>
            )}
          </div>
          <div className="grid min-w-0 content-start gap-2.5">
            <h3 className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{copy.windContextTitle}</h3>
            {windRelationMeta && (
              <span
                className={`inline-flex items-center gap-2 rounded-pill border border-divider px-2.5 py-1 text-meta-sm font-medium ${windRelationMeta.className}`}
              >
                <Wind className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {windRelationMeta.label}
              </span>
            )}
            {windRelation && (
              <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{copy.windRelationHints[windRelation]}</p>
            )}
            <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px] text-fg-muted">
              <li>
                <span>Offshore</span> — {copy.windRelationHints.offshore}
              </li>
              <li>
                <span>Onshore</span> — {copy.windRelationHints.onshore}
              </li>
              <li>
                <span>Cross-shore</span> — {copy.windRelationHints.cross}
              </li>
            </ul>
            <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{copy.radarFootnote}</p>
            <p className="font-mono tabular-nums text-[13px] text-fg" title={copy.gustHint}>
              <WindFlowGlyph
                directionDeg={windDir}
                speedKt={Math.round(windSpeedMs * MS_TO_KT)}
                size={18}
              />{' '}
              {copy.gustLabel} {fmt.f0(gustKt)} kt
            </p>
            <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
              <ScoreWindSourceBadge
                source={scoreWindSource}
                correction={scoreWindCorrection}
                locale={locale}
              />
            </p>
          </div>
        </div>
      )}

      {open === 'wave' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-2.5">
            <SwellTrainsTable conditions={trainConditions} locale={locale} />
          </div>
          <div className="grid min-w-0 content-start gap-2.5">
            <h3 className="m-0 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              {ti.obsBuoy} <span className="rounded-full border border-divider px-2 py-1 text-[11px] leading-none text-fg-subtle">{ti.nowTag}</span>
            </h3>
            {freshObservedWave ? (
              <>
                <ObservedWaveCard
                  observedWave={conditions.observedWave}
                  altWave={conditions.observedWaveAlt}
                  meta={conditions.observedWaveMeta}
                  forecastWaveHeightM={hour?.waveHeightM ?? conditions.waveHeight}
                  locale={locale}
                  spotId={spot.id}
                  freshnessNowMs={freshnessNowMs}
                />
                <WaveCalibrationTag wave={conditions.observedWave} locale={locale} />
              </>
            ) : (
              <BuoySkillLine spotId={spot.id} locale={locale} />
            )}
            {!freshObservedWave && conditions.observedWave && (
              <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{tv.staleBuoy}</p>
            )}
            {!freshObservedWave && !conditions.observedWave && (
              <BuoyLayerNotice locale={locale} />
            )}
            <IsobathsStrip spotId={spot.id} locale={locale} />
            {conditions.observedWaveCoherenceWarning && (
              <p
                className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-score-fair"
                data-coherence-warning="true"
                title={tv.coerWarnTitle
                  .replace('{esCode}', conditions.observedWaveCoherenceWarning.esCode)
                  .replace(
                    '{ref}',
                    conditions.observedWaveCoherenceWarning.ptRefCode
                      ? ` × ${conditions.observedWaveCoherenceWarning.ptRefCode}`
                      : '',
                  )
                  .replace('{days}', String(conditions.observedWaveCoherenceWarning.days))
                  .replace('{first}', conditions.observedWaveCoherenceWarning.firstDay ?? '…')
                  .replace('{last}', conditions.observedWaveCoherenceWarning.lastDay ?? '…')}
              >
                <AlertTriangle size={14} aria-hidden="true" />
                <span>
                  {tv.coerWarnBody.replace(
                    '{days}',
                    String(conditions.observedWaveCoherenceWarning.days),
                  )}
                </span>
              </p>
            )}
            {conditions.observedWaveCoherenceRefused && (
              <p
                className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-data-period"
                data-coherence-refused="true"
                title={tv.coerRefusedTitle.replace(
                  '{esCode}',
                  conditions.observedWaveCoherenceRefused.esCode,
                )}
              >
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{tv.coerRefusedBody}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {open === 'tide' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-2.5">
            {tideSchedule ? (
              <TideScheduleStrip schedule={tideSchedule} locale={locale} />
            ) : (
              <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">{ti.tideNoExtremum}</p>
            )}
            {waterTemp !== undefined && (
              <p className="font-mono tabular-nums text-[13px] text-fg">
                {td.waterLabel}: {fmt.f1(waterTemp)} °C
              </p>
            )}
          </div>
          <div className="grid min-w-0 content-start gap-2.5">
            <MoonTideCard
              locale={locale}
              tideHourly={tideHourly}
              date={freshnessNowMs !== undefined ? new Date(freshnessNowMs) : undefined}
            />
          </div>
        </div>
      )}

      <a className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[12px] text-fg-muted transition-colors duration-200 hover:text-fg hover:underline motion-reduce:transition-none" href="#como-sabemos">
        {ti.howWeKnow}
      </a>
    </div>
  );
}
