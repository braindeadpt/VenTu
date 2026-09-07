'use client';

import type { ScoreWindCorrection, ScoreWindSource } from '@/lib/scoreConditions';
import ProvenanceChip from '@/components/ui/ProvenanceChip';
import type { ProvenanceTier } from '@/lib/provenance';

interface ScoreWindSourceBadgeProps {
  source: ScoreWindSource;
  /** Station wind bias (ME/n from wind-bias.json) — tooltip when observed. */
  correction?: ScoreWindCorrection | null;
  locale: string;
  /** `false` inside link-cards, where a button would be invalid HTML. */
  interactive?: boolean;
  className?: string;
}

function fmtMe(me?: number): string | null {
  if (me == null || !Number.isFinite(me)) return null;
  return `${me >= 0 ? '+' : ''}${me.toFixed(1)} kt`;
}

/** Honest label: whether the score used measured wind, gust session proxy, or forecast (ICON-EU blend). */
export default function ScoreWindSourceBadge({
  source,
  correction,
  locale,
  interactive = true,
  className,
}: ScoreWindSourceBadgeProps) {
  const isPt = locale === 'pt';
  const me = fmtMe(correction?.me);
  const n = correction?.n;
  const biasSuffix =
    me && n != null && Number.isFinite(n)
      ? isPt
        ? ` Viés desta estação: ME ${me} (n=${n}).`
        : ` Station bias: ME ${me} (n=${n}).`
      : '';
  const copy: { label: string; title: string; tier: ProvenanceTier } =
    source === 'observed'
      ? {
          label: isPt ? 'Vento observado' : 'Observed wind',
          title: isPt
            ? `Score usa vento medido (IPMA / Ecowitt / METAR) fresco${biasSuffix}`
            : `Score uses fresh measured wind (IPMA / Ecowitt / METAR)${biasSuffix}`,
          tier: 'measured',
        }
      : source === 'session-gust'
        ? {
            label: isPt ? 'Vento de sessão' : 'Session wind',
            title: isPt
              ? 'Média modelo fraca; score usa proxy de rajada Open-Meteo (thermal)'
              : 'Weak model mean; score uses Open-Meteo gust proxy (thermal)',
            tier: 'adjusted',
          }
        : {
            label: isPt ? 'Só previsão' : 'Forecast only',
            title: isPt
              ? 'Sem observação fresca — score com previsão (ICON-EU / multi-modelo quando disponível)'
              : 'No fresh observation — forecast score (ICON-EU / multi-model when available)',
            tier: 'modeled',
          };

  return (
    <ProvenanceChip
      axis="wind"
      tier={copy.tier}
      label={copy.label}
      detail={copy.title}
      locale={locale}
      interactive={interactive}
      className={className}
    />
  );
}
