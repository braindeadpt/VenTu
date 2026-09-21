'use client';

import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import {
  relevantWarningsForSpot,
  SEA_STATE_WARNING_TYPES,
  warningBadgeLabel,
} from '@/lib/ipmaWarnings';
import SeaStateSafetyBanner from '@/components/spots/SeaStateSafetyBanner';
import CoastalNavWarnings from '@/components/spots/CoastalNavWarnings';
import WarningPill from '@/components/ui/WarningPill';

/**
 * Secção 0 do contrato — faixa de segurança. Só aparece com aviso activo:
 * SeaStateSafetyBanner (Agitação Marítima) + pills dos restantes avisos IPMA
 * relevantes + avisos à navegação costeira do IH. A mesma fonte de avisos que
 * SpotWarningsSection usa (useIpmaWarnings → /data/warnings.json +
 * relevantWarningsForSpot). Nunca dentro de accordion — fora de qualquer
 * card, sempre visível no topo.
 */
export default function SpotSafetyStrip({
  spotId,
  locale,
  activeWarningsLabel,
}: {
  spotId: string;
  locale: string;
  activeWarningsLabel: string;
}) {
  const isPt = locale === 'pt';
  const warningsData = useIpmaWarnings();
  const warnings = relevantWarningsForSpot(warningsData, spotId);
  // Os avisos de agitação marítima já saem no banner próprio (tom + frase de
  // segurança) — as pills cobrem os restantes tipos (vento, chuva, …).
  const nonSea = warnings.filter((w) => !SEA_STATE_WARNING_TYPES.has(w.type));

  return (
    <>
      <SeaStateSafetyBanner spotId={spotId} locale={locale} />
      {nonSea.length > 0 && (
        <div
          role="group"
          aria-label={activeWarningsLabel}
          className="border-b border-divider bg-surface-1/[0.03]"
        >
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-1.5">
            {nonSea.map((w) => (
              <WarningPill
                key={`${w.areaCode}-${w.type}-${w.level}`}
                warning={{
                  level: w.level,
                  label: warningBadgeLabel(w, isPt),
                  areaLabel: w.areaLabel,
                  type: w.type,
                }}
                locale={locale}
                variant="default"
                showLevel
              />
            ))}
          </div>
        </div>
      )}
      <CoastalNavWarnings spotId={spotId} locale={locale} />
    </>
  );
}
