'use client';

import { useId, useState, type CSSProperties } from 'react';
import { getTranslation } from '@/lib/i18n';
import { getWindRelationToCoast, getWindRelationLabel } from '@/lib/wind';
import { cardinal16, idealSector } from '@/lib/instruments/sector';
import { unwrapAngle } from '@/lib/instruments/unwrapAngle';
import CompassDial, { BeamCone, BeamSource } from './CompassDial';
import InstrumentCard, { type InstrumentId } from './InstrumentCard';
import { getInstrumentFmt } from './format';
import { INST_BIG, INST_SUB } from './classes';
import type { InstrumentHour } from './types';

const MS_TO_KT = 1.94384;

interface WindCardProps {
  hour: InstrumentHour | null;
  coastOrientation?: number;
  /** «N, NNW» — sector ideal do spot. */
  bestWind?: string;
  locale: string;
  open: boolean;
  onToggle: (id: InstrumentId) => void;
  coherence?: { text: string; linkLabel: string } | null;
}

/**
 * Cartão Vento: rosa com sector ideal (bestWind), meia-lua de terra,
 * feixe na direcção de onde vem o vento. A oscilação cresce com a razão
 * rajada/vento — clamp((wg/ws − 1) × 4°, 1°, 8°) da spec.
 */
export default function WindCard({
  hour,
  coastOrientation,
  bestWind,
  locale,
  open,
  onToggle,
  coherence,
}: WindCardProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const fmt = getInstrumentFmt(locale);
  const hatchId = useId();

  const dir = hour?.windDirectionDeg;
  const speedKt = hour?.windSpeedMs !== undefined ? hour.windSpeedMs * MS_TO_KT : undefined;
  const gustMs = hour?.windGustMs ?? hour?.windSpeedMs;
  const gustKt = gustMs !== undefined ? gustMs * MS_TO_KT : undefined;

  const relation =
    dir !== undefined && coastOrientation !== undefined
      ? getWindRelationToCoast(dir, coastOrientation)
      : null;
  const relationMeta = relation
    ? getWindRelationLabel(relation, locale)
    : null;

  // Feixe por transform com ângulo unwrapped (359→1 roda +2, nunca −358).
  // O unwrapping é estado derivado — padrão «adjust state during render».
  const [beam, setBeam] = useState<{ dir: number | undefined; deg: number }>({
    dir: undefined,
    deg: 0,
  });
  if (beam.dir !== dir) {
    setBeam((prev) => ({
      dir,
      deg:
        dir === undefined ? 0 : prev.dir === undefined ? dir : unwrapAngle(prev.dir, dir),
    }));
  }
  const beamDeg = beam.deg;

  // Oscilação ∝ rajada/vento: clamp((wg/ws − 1) × 4°, 1°, 8°).
  const gustFactor =
    hour?.windSpeedMs && hour.windSpeedMs > 0 && hour.windGustMs !== undefined
      ? hour.windGustMs / hour.windSpeedMs
      : 1;
  const ampDeg = Math.max(1, Math.min(8, (gustFactor - 1) * 4));

  const sector = idealSector(bestWind);

  return (
    <InstrumentCard
      instrument="wind"
      label={ti.wind}
      chip={relationMeta?.label}
      open={open}
      onToggle={onToggle}
      coherence={coherence}
      fig={
        <CompassDial
          hatchId={`${hatchId}-hatch`}
          coastOrientation={coastOrientation}
          ideal={sector}
          labels={{ sea: ti.sea, land: ti.land }}
          beam={
            <>
              <BeamCone />
              <BeamSource />
            </>
          }
          rotationDeg={beamDeg}
          beamClassName="ventu-inst-wob"
          beamStyle={{ '--amp': `${ampDeg.toFixed(1)}deg` } as CSSProperties}
        />
      }
    >
      <span className={INST_BIG} data-role="big">
        {speedKt !== undefined ? `${fmt.f0(speedKt)} kt` : '—'}
      </span>
      <span className={INST_SUB}>
        {dir !== undefined && gustKt !== undefined
          ? ti.windSub.replace('{dir}', cardinal16(dir)).replace('{g}', fmt.f0(gustKt))
          : '—'}
      </span>
      <span className={INST_SUB}>
        {sector && bestWind ? ti.idealFoot.replace('{dirs}', bestWind.replace(/\s*,\s*/g, '–')) : ' '}
      </span>
    </InstrumentCard>
  );
}
