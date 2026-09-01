'use client';

import { ATTRIBUTIONS, windSourceAttributionId, type DataSourceId } from '@/lib/dataSources';
import { cn } from '@/lib/cn';

interface WindSourceAttributionNoteProps {
  /**
   * Estação da observação de vento exibida ('ipma' | 'ecowitt' | 'metar'). O
   * attributionId deriva do metadata source — a cadeia é sempre a da estação
   * mostrada. 'forecast' → nota Open-Meteo (o vento do score veio do modelo).
   */
  source: 'ipma' | 'ecowitt' | 'metar' | 'forecast';
  locale: 'pt' | 'en';
  className?: string;
}

/**
 * Nota de atribuição do vento observado, nas superfícies onde o score explica
 * de onde veio o vento (badge do hero, secção observado). Reutiliza a MESMA
 * fonte da tabela (src/lib/dataSources.tsx): ATTRIBUTIONS[id].notePt/En, por
 * isso a cadeia mostrada ao lado da estação é exactamente a da página /fontes.
 * Ex.: METAR → «METAR via aviationweather.gov»; Ecowitt → «Ecowitt»; IPMA →
 * «Dados IPMA»; só previsão → a cadeia Open-Meteo (CC BY 4.0).
 */
export default function WindSourceAttributionNote({
  source,
  locale,
  className,
}: WindSourceAttributionNoteProps) {
  const id: DataSourceId =
    source === 'forecast' ? 'open-meteo' : windSourceAttributionId(source);
  return (
    <span
      className={cn('text-meta-xs text-fg-subtle leading-snug', className)}
      data-wind-attribution={id}
    >
      {locale === 'pt' ? ATTRIBUTIONS[id].notePt : ATTRIBUTIONS[id].noteEn}
    </span>
  );
}