'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { Waves, Wind, Zap } from 'lucide-react';

export interface SpotPopupContentProps {
  name: string;
  region: string;
  score: number;
  scoreColor: string;
  swellHeight: string;
  swellPeriod: string;
  windKnots: string;
  windDirection: string;
  wavePowerKw: string;
  spotSlug: string;
  spotId: string;
  locale: string;
}

export function SpotPopupContent({
  name,
  region,
  score,
  scoreColor,
  swellHeight,
  swellPeriod,
  windKnots,
  windDirection,
  wavePowerKw,
  spotSlug,
  spotId,
  locale,
}: SpotPopupContentProps) {
  const isPt = locale === 'pt';
  return (
    <div className="space-y-3 min-w-[210px]">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold text-sm text-fg truncate">{name}</div>
          <div className="text-[11px] text-fg-muted">{region}</div>
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-[13px] shrink-0 ml-3"
          style={{
            backgroundColor: `${scoreColor}22`,
            border: `2px solid ${scoreColor}`,
            color: scoreColor,
          }}
        >
          {Math.round(score)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="text-center bg-surface-1/[0.08] rounded-md py-1.5 px-1">
          <Waves className="w-3.5 h-3.5 mx-auto mb-0.5 text-fg-subtle" aria-hidden />
          <span className="block text-[9px] text-fg-subtle">{isPt ? 'Swell' : 'Swell'}</span>
          <span className="font-semibold text-fg tabular-nums">
            {swellHeight}m · {swellPeriod}s
          </span>
        </div>
        <div className="text-center bg-surface-1/[0.08] rounded-md py-1.5 px-1">
          <Wind className="w-3.5 h-3.5 mx-auto mb-0.5 text-fg-subtle" aria-hidden />
          <span className="block text-[9px] text-fg-subtle">{isPt ? 'Vento' : 'Wind'}</span>
          <span className="font-semibold text-fg tabular-nums">
            {windKnots}kt {windDirection}
          </span>
        </div>
        <div className="text-center bg-surface-1/[0.08] rounded-md py-1.5 px-1">
          <Zap className="w-3.5 h-3.5 mx-auto mb-0.5 text-fg-subtle" aria-hidden />
          <span className="block text-[9px] text-fg-subtle">{isPt ? 'Energia' : 'Energy'}</span>
          <span className="font-semibold text-fg tabular-nums">{wavePowerKw} kW/m</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="ventu-popup-detail w-full text-center py-2 rounded-lg bg-data-waves text-white text-xs font-semibold border-0 cursor-pointer"
          data-spot-id={spotId}
        >
          {isPt ? 'Ver condições' : 'View conditions'}
        </button>
        <a
          href={`/${locale}/spots/${spotSlug}/`}
          className="block w-full text-center py-1.5 rounded-lg bg-surface-1/[0.08] text-fg-muted text-xs font-medium no-underline transition-colors hover:bg-surface-2/[0.12] hover:text-fg"
        >
          {isPt ? 'Página do spot →' : 'Spot page →'}
        </a>
      </div>
    </div>
  );
}

export function renderSpotPopup(options: SpotPopupContentProps): string {
  return renderToStaticMarkup(<SpotPopupContent {...options} />);
}
