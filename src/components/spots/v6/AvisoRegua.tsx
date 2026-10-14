'use client';

/**
 * Chip compacto do aviso IPMA mais forte do spot, na régua de 48 h (#184).
 * A régua acompanha o scroll (fixa em baixo no telemóvel, sticky no topo no
 * desktop): um «Mar perigoso» não pode desaparecer quando se desce na página.
 * Mesma resolução e o mesmo rótulo da antiga barra unificada.
 */
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import { SEA_STATE_WARNING_TYPES, strongestSpotWarning, warningBadgeLabel } from '@/lib/ipmaWarnings';
import WarningPill from '@/components/ui/WarningPill';

export default function AvisoRegua({ spotId, locale }: { spotId: string; locale: string }) {
  const warning = strongestSpotWarning(useIpmaWarnings(), spotId);
  if (!warning) return null;
  return (
    <span className="r-aviso">
      <WarningPill
        warning={{
          level: warning.level,
          label: warningBadgeLabel(warning, locale),
          seaState: SEA_STATE_WARNING_TYPES.has(warning.type),
          areaLabel: warning.areaLabel,
          type: warning.type,
        }}
        locale={locale}
        variant="compact"
        dataAttr="compact"
      />
    </span>
  );
}
