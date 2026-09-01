'use client';

import { useEffect, useState } from 'react';
import { Anchor, ExternalLink, Map } from 'lucide-react';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
  type CoastalNavWarning,
} from '@/lib/ihCoastalWarnings';

interface CoastalNavWarningsProps {
  spotId: string;
  locale: string;
}

/** «Avisos à Navegação Costeiros (IH)» — camada de segurança marítima
 *  complementar ao IPMA/MeteoAlarm. Renderiza só quando o spot está coberto
 *  por um aviso em vigor (nunca mostra a secção vazia). */
export default function CoastalNavWarnings({ spotId, locale }: CoastalNavWarningsProps) {
  const isPt = locale === 'pt';
  const [warnings, setWarnings] = useState<CoastalNavWarning[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadCoastalNavWarnings()
      .then((file) => {
        if (cancelled) return;
        setWarnings(warningsForSpot(file, spotId));
      })
      .finally(() => {
        if (!cancelled) setWarnings((w) => w ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (!warnings || warnings.length === 0) return null;

  // Cross-border NW: os avisos espanhóis («Avisos a los navegantes») entram na
  // mesma secção com rótulo próprio, ao lado dos do IH — a secção nunca os
  // confunde nem os mistura nas fontes.
  const ih = warnings.filter((w) => w.source !== 'es');
  const es = warnings.filter((w) => w.source === 'es');

  return (
    <div
      className="rounded-card border border-score-poor/30 bg-score-poor/[0.06] px-3 py-2.5 mt-3"
      data-testid="coastal-nav-warnings"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-meta-sm font-semibold text-fg inline-flex items-center gap-1.5">
          <Anchor className="w-3.5 h-3.5 text-score-poor shrink-0" aria-hidden />
          {isPt ? 'Avisos à navegação costeira' : 'Coastal navigation warnings'}
        </p>
        {/* Navega para o /mapa fullscreen com a camada de avisos já ligada e
            centrada na área coberta (deep link ?spot=). */}
        <a
          href={`/${locale}/mapa/?spot=${spotId}`}
          className="inline-flex items-center gap-1 text-meta-sm font-medium text-data-waves hover:text-data-waves/80 transition-colors shrink-0"
          data-testid="coastal-nav-warnings-map-link"
        >
          <Map className="w-3.5 h-3.5" aria-hidden />
          {isPt ? 'Ver no mapa' : 'View on map'}
        </a>
      </div>
      {ih.length > 0 && (
        <ul className="space-y-1.5 list-none p-0 m-0">
          {ih.map((w) => (
            <li key={`ih-${w.id}`} className="text-meta-sm leading-snug">
              <span className="font-medium text-fg">{w.ref}</span>
              {w.category ? <span className="text-fg-muted"> — {w.category}</span> : null}
              {w.url ? (
                <a
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 ml-1.5 text-data-waves hover:text-data-waves/80 transition-colors"
                >
                  {isPt ? 'detalhe' : 'details'}
                  <ExternalLink className="w-3 h-3" aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {es.length > 0 && (
        <div className="mt-2 pt-2 border-t border-score-poor/20" data-testid="coastal-nav-warnings-es">
          <p className="text-meta-sm font-semibold text-fg inline-flex items-center gap-1.5 mb-1">
            <Anchor className="w-3.5 h-3.5 text-data-waves shrink-0" aria-hidden />
            {isPt ? 'Avisos a los navegantes (ES, cross-border)' : 'Avisos a los navegantes (ES, cross-border)'}
          </p>
          <ul className="space-y-1.5 list-none p-0 m-0">
            {es.map((w) => (
              <li key={`es-${w.id}`} className="text-meta-sm leading-snug">
                <span className="font-medium text-fg">{w.ref}</span>
                {w.category ? <span className="text-fg-muted"> — {w.category}</span> : null}
                {w.url ? (
                  <a
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 ml-1.5 text-data-waves hover:text-data-waves/80 transition-colors"
                  >
                    {isPt ? 'detalhe' : 'details'}
                    <ExternalLink className="w-3 h-3" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-meta-xs text-fg-subtle mt-1.5">
        {isPt
          ? 'Fontes: Instituto Hidrográfico · Avisos à Navegação Costeiros (CC-BY 4.0) e Instituto Hidrográfico de la Marina · Avisos a los navegantes (quando disponíveis)'
          : 'Sources: Instituto Hidrográfico · Coastal Navigation Warnings (CC-BY 4.0) and Instituto Hidrográfico de la Marina · Avisos a los navegantes (when available)'}
      </p>
    </div>
  );
}
