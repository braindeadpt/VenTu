'use client';

import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  type ConfidenceDetail,
  type ConfidenceTier,
  getConfidenceExplain,
  getConfidenceLabel,
  getConfidenceTier,
  getConfidenceTokenClass,
  getConfidenceTooltip,
} from '@/lib/forecastConfidence';

const CONFIDENCE_ICONS = {
  alta: ShieldCheck,
  média: Shield,
  baixa: ShieldAlert,
} as const satisfies Record<ConfidenceTier, typeof Shield>;

export interface ConfidenceBadgeProps {
  confidence?: ConfidenceTier | null;
  detail?: ConfidenceDetail | null;
  locale?: string;
  size?: 'sm' | 'md';
  withTooltip?: boolean;
  className?: string;
}

export default function ConfidenceBadge({
  confidence,
  detail,
  locale = 'pt',
  size = 'md',
  withTooltip = true,
  className,
}: ConfidenceBadgeProps) {
  const isPt = locale === 'pt' || locale.startsWith('pt');
  const tier = getConfidenceTier(detail, confidence ?? undefined);
  const Icon = CONFIDENCE_ICONS[tier];
  const label = getConfidenceLabel(tier, isPt);
  const explain = getConfidenceExplain(tier, isPt);
  const tooltip = withTooltip
    ? `${getConfidenceTooltip(isPt)} ${explain}${
        detail?.degraded
          ? isPt
            ? ' (menos modelos disponíveis.)'
            : ' (fewer models available.)'
          : ''
      }`
    : undefined;

  return (
    <span
      role="status"
      title={tooltip}
      aria-label={
        isPt
          ? `Confiança da previsão: ${label}. ${explain}`
          : `Forecast confidence: ${label}. ${explain}`
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border font-medium whitespace-nowrap',
        getConfidenceTokenClass(tier),
        size === 'sm' ? 'px-2 py-0.5 text-meta-sm' : 'px-2.5 py-1 text-meta',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
