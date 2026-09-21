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
import styles from './instruments.module.css';
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
      className={styles.detail}
      role="region"
      aria-label={ti.detailAria.replace('{name}', name)}
      data-detail={open}
    >
      <p className={styles.detailTitle}>{ti.detailAria.replace('{name}', name)}</p>

      {open === 'wind' && (
        <div className={styles.detailGrid}>
          <div className={styles.detailBlock}>
            <h3 className={styles.detailHeading}>
              {ti.obsStation} <span className={styles.nowTag}>{ti.nowTag}</span>
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
              <p className={styles.prose}>{tv.staleObservation}</p>
            )}
            {!freshObserved && !conditions.observed && !obsWorkerEnabled && (
              <p className={styles.prose}>{tv.noStation}</p>
            )}
          </div>
          <div className={styles.detailBlock}>
            <h3 className={styles.detailHeading}>{copy.windContextTitle}</h3>
            {windRelationMeta && (
              <span
                className={`inline-flex items-center gap-2 rounded-pill border border-divider px-2.5 py-1 text-meta-sm font-medium ${windRelationMeta.className}`}
              >
                <Wind className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {windRelationMeta.label}
              </span>
            )}
            {windRelation && (
              <p className={styles.prose}>{copy.windRelationHints[windRelation]}</p>
            )}
            <ul className={styles.hintList}>
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
            <p className={styles.prose}>{copy.radarFootnote}</p>
            <p className={styles.monoRow} title={copy.gustHint}>
              <WindFlowGlyph
                directionDeg={windDir}
                speedKt={Math.round(windSpeedMs * MS_TO_KT)}
                size={18}
              />{' '}
              {copy.gustLabel} {fmt.f0(gustKt)} kt
            </p>
            <p className={styles.prose}>
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
        <div className={styles.detailGrid}>
          <div className={styles.detailBlock}>
            <SwellTrainsTable conditions={trainConditions} locale={locale} />
          </div>
          <div className={styles.detailBlock}>
            <h3 className={styles.detailHeading}>
              {ti.obsBuoy} <span className={styles.nowTag}>{ti.nowTag}</span>
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
              <p className={styles.prose}>{tv.staleBuoy}</p>
            )}
            {!freshObservedWave && !conditions.observedWave && (
              <BuoyLayerNotice locale={locale} />
            )}
            <IsobathsStrip spotId={spot.id} locale={locale} />
            {conditions.observedWaveCoherenceWarning && (
              <p
                className={styles.warnNote}
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
                className={styles.refuseNote}
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
        <div className={styles.detailGrid}>
          <div className={styles.detailBlock}>
            {tideSchedule ? (
              <TideScheduleStrip schedule={tideSchedule} locale={locale} />
            ) : (
              <p className={styles.prose}>{ti.tideNoExtremum}</p>
            )}
            {waterTemp !== undefined && (
              <p className={styles.monoRow}>
                {td.waterLabel}: {fmt.f1(waterTemp)} °C
              </p>
            )}
          </div>
          <div className={styles.detailBlock}>
            <MoonTideCard
              locale={locale}
              tideHourly={tideHourly}
              date={freshnessNowMs !== undefined ? new Date(freshnessNowMs) : undefined}
            />
          </div>
        </div>
      )}

      <a className={styles.howWeKnow} href="#como-sabemos">
        {ti.howWeKnow}
      </a>
    </div>
  );
}
