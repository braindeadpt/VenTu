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
import { SAME_BOX_PLACEHOLDER, ensembleCardLine } from '@/lib/ensembleCardLine';

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
 *
 * A última linha é UM slot com caixa fixa (uma linha, sempre): banda ensemble
 * da hora, ou o mar de fundo, ou o placeholder NBSP. Nunca se acrescenta uma
 * linha — o cartão não pode mudar de altura com a hora escolhida.
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

  // Slot secundário: uma linha, uma decisão. «entre 1,0 e 1,9 m» é a leitura
  // humana; o «8 em cada 10 modelos» fica no title/leitor de ecrã.
  const foot = ensembleCardLine({
    band: hour?.ensemble?.wave,
    swellHeightM: hour?.swellHeightM,
    swellPeriodS: hour?.swellPeriodS,
  });
  const footText =
    foot.kind === 'band'
      ? ti.ensembleCard.replace('{lo}', fmt.f1(foot.p10)).replace('{hi}', fmt.f1(foot.p90))
      : foot.kind === 'swell'
        ? ti.swellFoot
            .replace('{h}', fmt.f1(foot.heightM))
            .replace('{p}', fmt.f1(foot.periodS))
        : SAME_BOX_PLACEHOLDER;

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
      <span
        className={INST_SUB}
        data-wave-band={foot.kind === 'band' ? 'card' : undefined}
        title={foot.kind === 'band' ? ti.ensembleCardHint : undefined}
      >
        {/* Texto visível num elemento próprio: o cartão tem UMA linha visível
            e a explicação vive no title + no span só-para-leitores-de-ecrã. */}
        <span>{footText}</span>
        {foot.kind === 'band' && (
          <span className="sr-only">{` — ${ti.ensembleCardHint}`}</span>
        )}
      </span>
    </InstrumentCard>
  );
}
