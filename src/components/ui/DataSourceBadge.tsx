import ProvenanceChip from '@/components/ui/ProvenanceChip';
import type { ProvenanceSize } from '@/lib/provenance';
import { getDataFreshness, formatStaleAge } from '@/lib/dataFreshness';

interface DataSourceBadgeProps {
  /** Baked build-time clock (React #418 guard) — see the spot page callers. */
  nowMs?: number;
  source?: 'real' | 'mock';
  updatedAt?: string | null;
  locale?: string;
  size?: ProvenanceSize;
  /** `false` inside link-cards, where a button would be invalid HTML. */
  interactive?: boolean;
  className?: string;
}

/**
 * Frescura dos dados — o eixo temporal da proveniência.
 *
 * Só aparece quando há algo a dizer: dados frescos não merecem um chip (a hora
 * de actualização já está ao lado). Um chip que está sempre lá deixa de ser
 * lido; um que aparece quando a idade importa é informação.
 */
export default function DataSourceBadge({
  source,
  updatedAt,
  nowMs,
  locale = 'pt',
  size = 'sm',
  interactive = true,
  className = '',
}: DataSourceBadgeProps) {
  const isPt = locale === 'pt';

  if (source === 'mock') {
    return (
      <ProvenanceChip
        axis="freshness"
        tier="adjusted"
        label="DEMO"
        detail={isPt ? 'Dados estimados — API indisponível' : 'Estimated data — API unavailable'}
        locale={locale}
        size={size}
        interactive={interactive}
        className={className}
      />
    );
  }

  const freshness = getDataFreshness(updatedAt, nowMs);
  if (!freshness || freshness === 'fresh') return null;

  const label = updatedAt
    ? formatStaleAge(updatedAt, isPt, nowMs)
    : isPt ? 'Desactualizado' : 'Outdated';

  return (
    <ProvenanceChip
      axis="freshness"
      tier={freshness === 'very-stale' ? 'degraded' : 'adjusted'}
      label={label}
      detail={
        isPt
          ? 'Condições via Open-Meteo (2h de dia, 4h de noite, hora Lisboa)'
          : 'Conditions via Open-Meteo (2h daytime, 4h night, Lisbon time)'
      }
      locale={locale}
      size={size}
      interactive={interactive}
      className={className}
    />
  );
}
