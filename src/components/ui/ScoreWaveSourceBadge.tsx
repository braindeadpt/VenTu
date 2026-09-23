'use client';

import { getTranslation } from '@/lib/i18n';
import type { ScoreWaveCorrection, ScoreWaveSource } from '@/lib/scoreConditions';
import ProvenanceChip from '@/components/ui/ProvenanceChip';
import type { ProvenanceTier } from '@/lib/provenance';

interface ScoreWaveSourceBadgeProps {
  source: ScoreWaveSource;
  /** Correction details (buoy name, ME/n) for the tooltip — see scoreConditions. */
  correction?: ScoreWaveCorrection | null;
  locale: string;
  /** `false` inside link-cards, where a button would be invalid HTML. */
  interactive?: boolean;
  className?: string;
}

function fmtMe(me?: number): string | null {
  if (me == null || !Number.isFinite(me)) return null;
  return `${me >= 0 ? '+' : ''}${me.toFixed(1)} m`;
}

/**
 * Honest label for the score's wave inputs: whether the wave height was
 * corrected by a buoy (real-time measured hm0 or regional ME bias) or came
 * straight from the model — with the calibration ME/n in the tooltip.
 */
export default function ScoreWaveSourceBadge({
  source,
  correction,
  locale,
  interactive = true,
  className,
}: ScoreWaveSourceBadgeProps) {
  const t = getTranslation(locale).ui;
  const isPt = locale === 'pt';
  const me = fmtMe(correction?.me);
  const n = correction?.n;
  const skillSuffix =
    me && n != null && Number.isFinite(n)
      ? t.waveSkillSuffix.replace('{me}', me ?? '').replace('{n}', String(n))
      : '';
  const cal = correction?.calibration;
  // fmtMe já inclui a unidade («-0.9 m») — não repetir o «m» aqui.
  const calSuffix =
    cal && Number.isFinite(cal.me) && Number.isFinite(cal.n)
      ? t.waveCalSuffix.replace('{me}', fmtMe(cal.me) ?? '').replace('{n}', String(cal.n))
      : '';

  let copy: { label: string; title: string; tier: ProvenanceTier };
  if (source === 'observed') {
    const name = correction?.buoyName;
    copy = {
      label: name ? t.waveByBuoyName.replace('{name}', name) : t.waveByBuoy,
      title: `${t.waveObservedTitle}${skillSuffix}${calSuffix}`,
      tier: 'measured',
    };
  } else if (source === 'bias-corrected') {
    // Δ = correcção efectivamente aplicada (deltaM) — nem sempre igual ao ME
    // (arredondamento round1); o tooltip distingue se veio do fallback
    // client-side (wave-bias.json em runtime) ou do meta baked pela pipeline.
    const delta = correction?.deltaM;
    const deltaSuffix =
      delta != null && Number.isFinite(delta)
        ? t.waveDeltaSuffix.replace('{delta}', fmtMe(delta) ?? '')
        : '';
    const originSuffix = correction?.fallback ? t.waveOriginFallback : t.waveOriginPipeline;
    const biasSuffix =
      me && n != null && Number.isFinite(n)
        ? t.waveBiasSkill.replace('{me}', me ?? '').replace('{n}', String(n))
        : t.waveBiasPlain;
    copy = {
      label: t.waveBiasLabel,
      title: `${t.waveBiasTitle}${deltaSuffix}${biasSuffix}${originSuffix}`,
      tier: 'adjusted',
    };
  } else {
    copy = {
      label: t.waveForecastLabel,
      title: t.waveForecastTitle,
      tier: 'modeled',
    };
  }

  return (
    <ProvenanceChip
      axis="wave"
      tier={copy.tier}
      label={copy.label}
      detail={copy.title}
      locale={locale}
      interactive={interactive}
      className={className}
    />
  );
}
