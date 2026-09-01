'use client';

import { ATTRIBUTIONS, waveSourceAttributionId } from '@/lib/dataSources';
import { cn } from '@/lib/cn';

interface WaveSourceAttributionNoteProps {
  /** Tipo da leitura observada ('wmo-buoy' → nota Copernicus; 'ih-buoy' → IH). */
  source: 'ih-buoy' | 'wmo-buoy';
  locale: 'pt' | 'en';
  className?: string;
}

/**
 * Nota de atribuição da leitura observada, NAS superfícies compactas (grids da
 * homepage, mapa e comparador) — não só no card de onda observada. Reutiliza a
 * MESMA fonte da tabela (src/lib/dataSources.tsx): ATTRIBUTIONS[id].notePt/En,
 * por isso a cadeia mostrada ao lado da boia é exactamente a da página /fontes.
 * Ex.: leitura WMO/Copernicus → «Generated using E.U. Copernicus Marine
 * Service Information»; leitura IH → «Dados © Instituto Hidrográfico (CC BY 4.0)».
 */
export default function WaveSourceAttributionNote({
  source,
  locale,
  className,
}: WaveSourceAttributionNoteProps) {
  const id = waveSourceAttributionId(source);
  return (
    <span
      className={cn('text-meta-xs text-fg-subtle leading-snug', className)}
      data-wave-attribution={id}
    >
      {locale === 'pt' ? ATTRIBUTIONS[id].notePt : ATTRIBUTIONS[id].noteEn}
    </span>
  );
}