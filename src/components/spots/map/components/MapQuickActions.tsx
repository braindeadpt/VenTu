'use client';

import { Crosshair, Loader2, Share2 } from 'lucide-react';

/**
 * Acções rápidas do /mapa — «Perto de mim» e «Partilhar vista».
 * Coluna flutuante no canto superior direito (mesmo sítio nos dois
 * ecrãs; o pill de controlos fica centrado e o sheet em baixo).
 */
export default function MapQuickActions({
  locateLabel,
  shareLabel,
  locating,
  onLocate,
  onShare,
}: {
  locateLabel: string;
  shareLabel: string;
  locating: boolean;
  onLocate: () => void;
  onShare: () => void;
}) {
  const btn =
    'flex h-11 w-11 items-center justify-center rounded-full border border-divider bg-bg-elevated/95 shadow-card backdrop-blur-sm text-fg-muted transition-colors duration-150 hover:text-fg hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-accent touch-manipulation';
  return (
    <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
      <button
        type="button"
        onClick={onLocate}
        aria-label={locateLabel}
        title={locateLabel}
        aria-busy={locating}
        data-map-locate
        className={btn}
      >
        {locating ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Crosshair className="h-[18px] w-[18px]" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onShare}
        aria-label={shareLabel}
        title={shareLabel}
        data-map-share
        className={btn}
      >
        <Share2 className="h-[18px] w-[18px]" aria-hidden />
      </button>
    </div>
  );
}
