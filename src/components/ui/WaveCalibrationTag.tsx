'use client';

import { waveCalibrationTag, type ObservedWave } from '@/lib/observedWave';
import ProvenanceChip from '@/components/ui/ProvenanceChip';

export interface WaveCalibrationTagProps {
  /**
   * Wave whose calibration should be exposed — only `calibration` + the
   * corrected `waveHeight` are read (the hero passes the full observedWave;
   * the TopNow/compare cards pass the row's calibration + corrected height).
   */
  wave: Pick<ObservedWave, 'calibration' | 'waveHeight'> | null | undefined;
  locale: string;
  className?: string;
}

/**
 * Calibração cross-border — «ref. PT (-0.9 m · n=4)».
 *
 * A leitura espanhola foi recalibrada para a referência PT: a altura mostrada
 * não é a medição em bruto, e o utilizador tem de o ver. A cadeia completa
 * (par, ME, raw → corrigida) vive no popover do ProvenanceChip.
 *
 * É proveniência do tipo `adjusted`: medimos, mas ajustámos.
 */
export default function WaveCalibrationTag({
  wave,
  locale,
  className,
}: WaveCalibrationTagProps) {
  const calTag = waveCalibrationTag(wave, locale);
  if (!calTag) return null;

  // O domínio ainda prefixa o rótulo com 🔧 (contrato pinado em
  // observedWaveSourcesChip.test.ts). O chip já traz o glifo do eixo, e dois
  // ícones no mesmo pill é exactamente o ruído que esta unificação remove.
  const label = calTag.label.replace(/^🔧\s*/, '');

  return (
    <ProvenanceChip
      axis="calibration"
      tier="adjusted"
      label={label}
      detail={calTag.title}
      locale={locale}
      className={className}
      chipAttrs={{ 'data-wave-calibrated': 'compact' }}
      popoverAttrs={{ 'data-wave-calibration-popover': 'true' }}
    />
  );
}
