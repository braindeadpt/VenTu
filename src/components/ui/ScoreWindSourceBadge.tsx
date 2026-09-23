'use client';

import { getTranslation } from '@/lib/i18n';
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
  const t = getTranslation(locale).ui;
  const isPt = locale === 'pt';
  const me = fmtMe(correction?.me);
  const n = correction?.n;
  const biasSuffix =
    me && n != null && Number.isFinite(n)
      ? t.windStationBias.replace('{me}', me ?? '').replace('{n}', String(n))
      : '';
  const copy: { label: string; title: string; tier: ProvenanceTier } =
    source === 'observed'
      ? {
          label: t.windObservedLabel,
          title: `${t.windObservedTitle}${biasSuffix}`,
          tier: 'measured',
        }
      : source === 'session-gust'
        ? {
            label: t.windSessionLabel,
            title: t.windSessionTitle,
            tier: 'adjusted',
          }
        : {
            label: t.windForecastLabel,
            title: t.windForecastTitle,
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
