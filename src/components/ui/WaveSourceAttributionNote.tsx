'use client';

import { ATTRIBUTIONS, waveSourceAttributionId } from '@/lib/dataSources';
import { cn } from '@/lib/cn';

interface WaveSourceAttributionNoteProps {
  /** Tipo da leitura observada ('wmo-buoy' → nota Copernicus; 'ih-buoy' → IH). */
  source: 'ih-buoy' | 'wmo-buoy';
  locale: 'pt' | 'en';
  className?: string;
  /**
   * Render the attribution chain as plain text (no links). Use inside surfaces
   * that are themselves links (e.g. SpotListCard is one <a>): an <a> nested in
   * an <a> is invalid HTML, the browser parser restructures it (closing the
   * outer anchor early), and React's tree then mismatches -> hydration error.
   * Keeps the same single-source chain, just without the href.
   */
  bare?: boolean;
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
  bare = false,
}: WaveSourceAttributionNoteProps) {
  const id = waveSourceAttributionId(source);
  const note = locale === 'pt' ? ATTRIBUTIONS[id].notePt : ATTRIBUTIONS[id].noteEn;
  const title = locale === 'pt' ? ATTRIBUTIONS[id].titlePt : ATTRIBUTIONS[id].titleEn;
  return (
    <span
      className={cn('text-meta-xs text-fg-subtle leading-snug', className)}
      data-wave-attribution={id}
    >
      {bare ? title : note}
    </span>
  );
}