'use client';

import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import ProvenanceChip from '@/components/ui/ProvenanceChip';
import {
  PROVENANCE_ICON_CLASS,
  type ProvenanceSize,
  type ProvenanceTier,
} from '@/lib/provenance';
import {
  type ConfidenceDetail,
  type ConfidenceTier,
  getConfidenceExplain,
  getConfidenceLabel,
  getConfidenceTier,
  getConfidenceTooltip,
} from '@/lib/forecastConfidence';

const CONFIDENCE_ICONS = {
  alta: ShieldCheck,
  média: Shield,
  baixa: ShieldAlert,
} as const satisfies Record<ConfidenceTier, typeof Shield>;

/**
 * Confiança → tier de proveniência.
 *
 * Alta = os modelos concordam, o número é tão sólido como uma medição.
 * Média = concordam a meio, como uma previsão corrigida.
 * Baixa = divergem — ÂMBAR, não vermelho (CORRECCOES-24SET §4 / spec §0.4:
 * vermelho é só para perigo real; uma confiança divergente é cautela, não
 * alarme — em todo o site, não só no hero). O estado `degraded` (fonte em
 * baixo) continua a anotar-se via `detail.degraded` → `t.degradedNote`.
 */
const CONFIDENCE_TIER: Record<ConfidenceTier, ProvenanceTier> = {
  alta: 'measured',
  média: 'adjusted',
  baixa: 'adjusted',
};

export interface ConfidenceBadgeProps {
  confidence?: ConfidenceTier | null;
  detail?: ConfidenceDetail | null;
  locale?: string;
  size?: ProvenanceSize;
  withTooltip?: boolean;
  /** `false` inside link-cards, where a button would be invalid HTML. */
  interactive?: boolean;
  /**
   * Detalhe extra do domínio, acrescentado AO DETALHE do chip (tooltip +
   * popover) — p.ex. a banda ensemble da hora escolhida. Nunca entra no
   * rótulo: o chip tem a largura do texto dele e alargá-lo reflui a
   * `ProvenanceRow` (e com ela a secção) sem nada ter mudado para o leitor.
   */
  extraDetail?: string | null;
  className?: string;
}

export default function ConfidenceBadge({
  confidence,
  detail,
  locale = 'pt',
  size = 'md',
  withTooltip = true,
  interactive = true,
  extraDetail,
  className,
}: ConfidenceBadgeProps) {
  const t = getTranslation(locale).confidence;
  const tier = getConfidenceTier(detail, confidence ?? undefined);
  const Icon = CONFIDENCE_ICONS[tier];
  const label = getConfidenceLabel(tier, locale);
  const explain = getConfidenceExplain(tier, locale);
  const tooltip = withTooltip
    ? `${getConfidenceTooltip(locale)} ${explain}${detail?.degraded ? t.degradedNote : ''}${
        extraDetail ? ` ${extraDetail}` : ''
      }`
    : undefined;

  return (
    <ProvenanceChip
      axis="confidence"
      tier={CONFIDENCE_TIER[tier]}
      label={label}
      detail={tooltip}
      locale={locale}
      size={size}
      interactive={interactive}
      // O badge de confiança é uma LIVE REGION: `role="status"` faz o leitor de
      // ecrã anunciar quando a confiança muda. É o papel que o badge expunha
      // antes da unificação — o chip não pode fixar `note` por cima dele.
      role="status"
      // O escudo muda com o nível — é o único eixo cujo glifo é gradativo.
      icon={<Icon className={PROVENANCE_ICON_CLASS[size]} aria-hidden />}
      ariaLabel={t.ariaLabel.replace('{label}', label).replace('{explain}', explain)}
      className={className}
    />
  );
}
