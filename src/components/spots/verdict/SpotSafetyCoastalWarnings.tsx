'use client';

import { useEffect, useState } from 'react';
import { Anchor, ExternalLink, Map } from 'lucide-react';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
  type CoastalNavWarning,
} from '@/lib/ihCoastalWarnings';

/**
 * Avisos à navegação costeira na faixa de segurança (secção 0) — versão
 * compacta de uma linha por aviso, da mesma fonte que SpotWarningsSection
 * usa (loadCoastalNavWarnings → /data/ih-coastal-warnings.json +
 * warningsForSpot por point-in-polygon).
 *
 * NÃO reutiliza o bloco CoastalNavWarnings: esse componente leva
 * data-testid="coastal-nav-warnings", que os specs assumem único na página —
 * renderizá-lo aqui duplicava o testid (strict mode) e um card completo não
 * é uma «faixa». O bloco detalhado continua na secção legada «No local».
 */
export default function SpotSafetyCoastalWarnings({
  spotId,
  locale,
}: {
  spotId: string;
  locale: string;
}) {
  const isPt = locale === 'pt';
  const [warnings, setWarnings] = useState<CoastalNavWarning[] | null | undefined>(
    undefined,
  );

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

  const label = isPt ? 'Avisos à navegação costeira' : 'Coastal navigation warnings';

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="spot-safety-coastal"
      className="border-b border-score-poor/25 bg-score-poor/[0.06]"
    >
      <div className="max-w-6xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-meta-sm font-semibold text-fg inline-flex items-center gap-1.5">
            <Anchor className="w-3.5 h-3.5 text-score-poor shrink-0" aria-hidden />
            {label}
          </p>
          <a
            href={`/${locale}/mapa/?spot=${spotId}`}
            className="inline-flex items-center gap-1 text-meta-sm font-medium text-data-waves hover:text-data-waves/80 transition-colors shrink-0"
          >
            <Map className="w-3.5 h-3.5" aria-hidden />
            {isPt ? 'Ver no mapa' : 'View on map'}
          </a>
        </div>
        <ul className="mt-1 space-y-0.5 list-none p-0 m-0">
          {warnings.map((w) => (
            <li key={`${w.source ?? 'ih'}-${w.id}`} className="text-meta-sm leading-snug">
              <span className="font-medium text-fg">{w.ref}</span>
              {w.source === 'es' ? (
                <span className="text-fg-muted"> (ES)</span>
              ) : null}
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
        <p className="text-meta-xs text-fg-subtle mt-1">
          {isPt ? 'IH · IHM (CC-BY 4.0)' : 'IH · IHM (CC-BY 4.0)'}
        </p>
      </div>
    </div>
  );
}
