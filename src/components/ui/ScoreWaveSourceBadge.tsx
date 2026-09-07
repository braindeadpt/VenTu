'use client';

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
  const isPt = locale === 'pt';
  const me = fmtMe(correction?.me);
  const n = correction?.n;
  const skillSuffix =
    me && n != null && Number.isFinite(n)
      ? isPt
        ? ` Skill desta boia: ME ${me} (n=${n}).`
        : ` Buoy skill: ME ${me} (n=${n}).`
      : '';
  const cal = correction?.calibration;
  // fmtMe já inclui a unidade («-0.9 m») — não repetir o «m» aqui.
  const calSuffix =
    cal && Number.isFinite(cal.me) && Number.isFinite(cal.n)
      ? isPt
        ? ` Leitura de boia espanhola recalibrada para a referência PT (viés ME ${fmtMe(cal.me)}, n=${cal.n}).`
        : ` Spanish buoy reading recalibrated to the PT reference (bias ME ${fmtMe(cal.me)}, n=${cal.n}).`
      : '';

  let copy: { label: string; title: string; tier: ProvenanceTier };
  if (source === 'observed') {
    const name = correction?.buoyName;
    copy = {
      label: isPt
        ? name
          ? `Corrigido pela boia ${name}`
          : 'Corrigido pela boia'
        : name
          ? `Corrected by ${name} buoy`
          : 'Corrected by buoy',
      title: isPt
        ? `Score usa a altura de onda medida pela boia (fresca) — correcção em tempo real da previsão.${skillSuffix}${calSuffix}`
        : `Score uses the measured buoy wave height (fresh) — real-time forecast correction.${skillSuffix}${calSuffix}`,
      tier: 'measured',
    };
  } else if (source === 'bias-corrected') {
    // Δ = correcção efectivamente aplicada (deltaM) — nem sempre igual ao ME
    // (arredondamento round1); o tooltip distingue se veio do fallback
    // client-side (wave-bias.json em runtime) ou do meta baked pela pipeline.
    const delta = correction?.deltaM;
    const deltaSuffix =
      delta != null && Number.isFinite(delta)
        ? isPt
          ? ` Δ ${fmtMe(delta)} aplicado à altura.`
          : ` Δ ${fmtMe(delta)} applied to the height.`
        : '';
    const originSuffix = correction?.fallback
      ? isPt
        ? ' Correcção em tempo real (wave-bias.json, client-side).'
        : ' Real-time correction (wave-bias.json, client-side).'
      : isPt
        ? ' Correcção aplicada pela pipeline (meta na row).'
        : ' Correction applied by the pipeline (row meta).';
    const biasSuffix =
      me && n != null && Number.isFinite(n)
        ? isPt
          ? ` Viés regional ME ${me} (n=${n}).`
          : ` Regional bias ME ${me} (n=${n}).`
        : isPt
          ? ' Viés regional da previsão aplicado.'
          : ' Regional forecast bias applied.';
    copy = {
      label: isPt ? 'Corrigido (viés regional)' : 'Region bias corrected',
      title: isPt
        ? `A altura mostrada é previsão do modelo corrigida pela média das boias.${deltaSuffix}${biasSuffix}${originSuffix}`
        : `The height shown is the model forecast corrected by the buoy-average.${deltaSuffix}${biasSuffix}${originSuffix}`,
      tier: 'adjusted',
    };
  } else {
    copy = {
      label: isPt ? 'Só previsão' : 'Forecast only',
      title: isPt
        ? 'Sem correcção de boia — score com a previsão do modelo'
        : 'No buoy correction — forecast score',
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
