'use client';

import { useEffect, useState } from 'react';
import { Anchor, ExternalLink } from 'lucide-react';
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

  return (
    <div
      className="rounded-card border border-score-poor/30 bg-score-poor/[0.06] px-3 py-2.5 mt-3"
      data-testid="coastal-nav-warnings"
    >
      <p className="text-meta-sm font-semibold text-fg inline-flex items-center gap-1.5 mb-1.5">
        <Anchor className="w-3.5 h-3.5 text-score-poor shrink-0" aria-hidden />
        {isPt ? 'Avisos à navegação costeira (IH)' : 'Coastal navigation warnings (IH)'}
      </p>
      <ul className="space-y-1.5 list-none p-0 m-0">
        {warnings.map((w) => (
          <li key={w.id} className="text-meta-sm leading-snug">
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
      <p className="text-meta-xs text-fg-subtle mt-1.5">
        {isPt
          ? 'Fonte: Instituto Hidrográfico · Avisos à Navegação Costeiros (CC-BY 4.0)'
          : 'Source: Instituto Hidrográfico · Coastal Navigation Warnings (CC-BY 4.0)'}
      </p>
    </div>
  );
}
