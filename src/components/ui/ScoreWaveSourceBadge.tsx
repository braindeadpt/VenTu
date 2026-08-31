'use client';

import type { ScoreWaveCorrection, ScoreWaveSource } from '@/lib/scoreConditions';
import { cn } from '@/lib/cn';

interface ScoreWaveSourceBadgeProps {
  source: ScoreWaveSource;
  /** Correction details (buoy name, ME/n) for the tooltip — see scoreConditions. */
  correction?: ScoreWaveCorrection | null;
  locale: string;
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

  let copy: { label: string; title: string; className: string };
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
      className: 'border-score-good/40 bg-score-good/10 text-score-good',
    };
  } else if (source === 'bias-corrected') {
    const biasSuffix =
      me && n != null && Number.isFinite(n)
        ? isPt
          ? ` Viés regional ME ${me} (n=${n}) aplicado à previsão.`
          : ` Regional bias ME ${me} (n=${n}) applied to the forecast.`
        : isPt
          ? ' Viés regional da previsão aplicado.'
          : ' Regional forecast bias applied.';
    copy = {
      label: isPt ? 'Corrigido (viés regional)' : 'Region bias corrected',
      title: isPt
        ? `A altura mostrada é previsão do modelo corrigida pela média das boias.${biasSuffix}`
        : `The height shown is the model forecast corrected by the buoy-average.${biasSuffix}`,
      className: 'border-score-fair/40 bg-score-fair/10 text-score-fair',
    };
  } else {
    copy = {
      label: isPt ? 'Só previsão' : 'Forecast only',
      title: isPt
        ? 'Sem correcção de boia — score com a previsão do modelo'
        : 'No buoy correction — forecast score',
      className: 'border-divider bg-surface-1/[0.04] text-fg-muted',
    };
  }

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
