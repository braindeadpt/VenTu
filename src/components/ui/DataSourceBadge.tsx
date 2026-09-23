import ProvenanceChip from '@/components/ui/ProvenanceChip';
import type { ProvenanceSize } from '@/lib/provenance';
import { getDataFreshness, formatStaleAge } from '@/lib/dataFreshness';
import { getTranslation } from '@/lib/i18n';

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
  const t = getTranslation(locale).ui;

  if (source === 'mock') {
    return (
      <ProvenanceChip
        axis="freshness"
        tier="adjusted"
        label="DEMO"
        detail={t.estimatedData}
        locale={locale}
        size={size}
        interactive={interactive}
        className={className}
      />
    );
  }

  const freshness = getDataFreshness(updatedAt, nowMs);
  if (!freshness || freshness === 'fresh') return null;

  const label = updatedAt ? formatStaleAge(updatedAt, locale, nowMs) : t.outdated;

  return (
    <ProvenanceChip
      axis="freshness"
      tier={freshness === 'very-stale' ? 'degraded' : 'adjusted'}
      label={label}
      detail={t.openMeteoDetail}
      locale={locale}
      size={size}
      interactive={interactive}
      className={className}
    />
  );
}
