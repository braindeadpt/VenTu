'use client';

import { useId, useState, type CSSProperties } from 'react';
import { getTranslation } from '@/lib/i18n';
import { cardinal16, idealSector, inSector } from '@/lib/instruments/sector';
import { unwrapAngle } from '@/lib/instruments/unwrapAngle';
import CompassDial, { BeamCone, BeamSource, SwellPulses } from './CompassDial';
import InstrumentCard, { type InstrumentId } from './InstrumentCard';
import { getInstrumentFmt } from './format';
import { INST_BIG, INST_SUB } from './classes';
import type { InstrumentHour } from './types';

interface SwellCardProps {
  hour: InstrumentHour | null;
  coastOrientation?: number;
  /** «W, NW» — janela de ondulação do spot. */
  bestSwell?: string;
  locale: string;
  open: boolean;
  onToggle: (id: InstrumentId) => void;
  coherence?: { text: string; linkLabel: string } | null;
}

/**
 * Cartão Onda: a mesma rosa com a janela de ondulação (bestSwell), cone na
 * direcção de onde vem a onda e três anéis ao ritmo do período —
 * duração clamp(periodo × 0.4 s, 1.2 s, 6 s). Fora da janela o cone fica
 * tracejado.
 */
export default function SwellCard({
  hour,
  coastOrientation,
  bestSwell,
  locale,
  open,
  onToggle,
  coherence,
}: SwellCardProps) {
  const ti = getTranslation(locale).spotPageInstruments;
  const fmt = getInstrumentFmt(locale);
  const hatchId = useId();

  const dir = hour?.waveDirectionDeg;
  const sector = idealSector(bestSwell);
  const inWindow = dir !== undefined && inSector(dir, sector);

  // Ângulo unwrapped — estado derivado («adjust state during render»).
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

  const periodS = hour?.wavePeriodS;
  const pulseS = periodS !== undefined ? Math.max(1.2, Math.min(6, periodS * 0.4)) : 3;

  return (
    <InstrumentCard
      instrument="wave"
      label={ti.wave}
      chip={dir !== undefined ? (inWindow ? ti.chipInWindow : ti.chipOutWindow) : undefined}
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
              <SwellPulses />
              <BeamSource />
            </>
          }
          rotationDeg={beamDeg}
          beamClassName={inWindow ? undefined : 'ventu-inst-out'}
          beamStyle={{ '--per': `${pulseS.toFixed(2)}s` } as CSSProperties}
        />
      }
    >
      <span className={INST_BIG} data-role="big">
        {hour?.waveHeightM !== undefined ? `${fmt.f1(hour.waveHeightM)} m` : '—'}
      </span>
      <span className={INST_SUB}>
        {periodS !== undefined && dir !== undefined
          ? ti.swellSub
              .replace('{p}', fmt.f1(periodS))
              .replace('{dir}', cardinal16(dir))
              .replace('{dirs}', (bestSwell ?? '').replace(/\s*,\s*/g, '–'))
          : '—'}
      </span>
      <span className={INST_SUB}>
        {hour?.swellHeightM !== undefined && hour?.swellPeriodS !== undefined
          ? ti.swellFoot
              .replace('{h}', fmt.f1(hour.swellHeightM))
              .replace('{p}', fmt.f1(hour.swellPeriodS))
          : ' '}
      </span>
    </InstrumentCard>
  );
}
