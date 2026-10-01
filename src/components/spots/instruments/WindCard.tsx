'use client';

import { useId, useState, type CSSProperties } from 'react';
import { getTranslation } from '@/lib/i18n';
import { classifyWind, type WindCategory } from '@/lib/sportScore';
import type { Spot } from '@/types';
import { cardinal16, idealSector } from '@/lib/instruments/sector';
import { unwrapAngle } from '@/lib/instruments/unwrapAngle';
import CompassDial, { BeamCone, BeamSource } from './CompassDial';
import InstrumentCard, { type InstrumentId } from './InstrumentCard';
import { getInstrumentFmt } from './format';
import { INST_BIG, INST_SUB } from './classes';
import type { InstrumentHour } from './types';

const MS_TO_KT = 1.94384;

/** Categoria classifyWind → chave i18n do chip (4 rótulos da spec). */
const WIND_REL_KEY = {
  onshore: 'windRelOnshore',
  'side-onshore': 'windRelCrossOn',
  'side-offshore': 'windRelCrossOff',
  offshore: 'windRelOffshore',
} as const satisfies Record<WindCategory, string>;

interface WindCardProps {
  hour: InstrumentHour | null;
  spot: Spot;
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
  spot,
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

  // Chip vento↔costa — SP-B: classifyWind (sportScore), as mesmas 4
  // categorias do score (SPOT-UX-V3 §4): onshore / cross-on / cross-off /
  // offshore. src/lib/wind.ts (3 vias) fica intacto — usado noutros lados.
  const category: WindCategory | null =
    dir !== undefined && spot.coastOrientation !== undefined
      ? classifyWind(spot, dir)
      : null;
  const categoryLabel = category ? ti[WIND_REL_KEY[category]] : null;

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

  const sector = idealSector(spot.bestWind);

  return (
    <InstrumentCard
      instrument="wind"
      label={ti.wind}
      chip={categoryLabel}
      open={open}
      onToggle={onToggle}
      coherence={coherence}
      fig={
        <CompassDial
          hatchId={`${hatchId}-hatch`}
          coastOrientation={spot.coastOrientation}
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
        {sector && spot.bestWind ? ti.idealFoot.replace('{dirs}', spot.bestWind.replace(/\s*,\s*/g, '–')) : ' '}
      </span>
    </InstrumentCard>
  );
}
