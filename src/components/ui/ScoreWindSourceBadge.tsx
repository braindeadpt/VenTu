'use client';

import type { ScoreWindCorrection, ScoreWindSource } from '@/lib/scoreConditions';
import { cn } from '@/lib/cn';

interface ScoreWindSourceBadgeProps {
  source: ScoreWindSource;
  /** Station wind bias (ME/n from wind-bias.json) — tooltip when observed. */
  correction?: ScoreWindCorrection | null;
  locale: string;
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
  const copy =
    source === 'observed'
      ? {
          label: isPt ? 'Vento observado' : 'Observed wind',
          title: isPt
            ? `Score usa vento medido (IPMA / Ecowitt / METAR) fresco${biasSuffix}`
            : `Score uses fresh measured wind (IPMA / Ecowitt / METAR)${biasSuffix}`,
          className: 'border-score-good/40 bg-score-good/10 text-score-good',
        }
      : source === 'session-gust'
        ? {
            label: isPt ? 'Vento de sessão' : 'Session wind',
            title: isPt
              ? 'Média modelo fraca; score usa proxy de rajada Open-Meteo (thermal)'
              : 'Weak model mean; score uses Open-Meteo gust proxy (thermal)',
            className: 'border-score-fair/40 bg-score-fair/10 text-score-fair',
          }
        : {
            label: isPt ? 'Só previsão' : 'Forecast only',
            title: isPt
              ? 'Sem observação fresca — score com previsão (ICON-EU / multi-modelo quando disponível)'
              : 'No fresh observation — forecast score (ICON-EU / multi-model when available)',
            className: 'border-divider bg-surface-1/[0.04] text-fg-muted',
          };

  return (
    <span
      title={copy.title}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-meta-sm font-medium',
        copy.className,
        className,
      )}
    >
      {copy.label}
    </span>
  );
}
