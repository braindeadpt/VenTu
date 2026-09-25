'use client';

import { getTranslation } from '@/lib/i18n';
import { localizedSpotName } from '@/lib/localizedSpotText';
import { useEffect, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { GridSportFilter } from '@/lib/sportRatings';
import {
  SpotCardContent,
  type MapSpotPreviewData,
} from '@/components/spots/MapSpotPreview';

export type MapSpotSheetData = MapSpotPreviewData;

interface MapSpotSheetProps {
  data: MapSpotSheetData | null;
  selectedSport: GridSportFilter;
  locale: string;
  onClose: () => void;
  /** UX v3 — «←» volta à lista de spots do viewport sem fechar o sheet. */
  onBackToList?: () => void;
  /** Score à hora activa das 48 h (mantém o cartão em sync com o marcador). */
  scoreOverride?: number;
  hoursFrame?: number;
  hourLabel?: string;
  onViewSpot?: (spotId: string) => void;
}

export default function MapSpotSheet({
  data,
  selectedSport,
  locale,
  onClose,
  onBackToList,
  scoreOverride,
  hoursFrame,
  hourLabel,
  onViewSpot,
}: MapSpotSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);

  // Swipe-to-dismiss no handle: arrastar para baixo ≥96px fecha o sheet;
  // soltar antes devolve o painel com a transição CSS de volta.
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null || !panelRef.current) return;
    const dy = Math.max(0, e.clientY - dragStartYRef.current);
    panelRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    const dy = e.clientY - dragStartYRef.current;
    dragStartYRef.current = null;
    if (panelRef.current) {
      panelRef.current.style.transform = '';
      panelRef.current.style.transition = '';
    }
    if (dy > 96) onClose();
  };

  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  // UX v3: sem backdrop — o mapa continua clicável atrás do sheet (a maquete
  // não tem scrim; tocar noutro marcador troca o spot em preview). O painel
  // fica acima do HUD do mapa (z-[1100]) e do painel de filtros (z-[1200]).
  const t = getTranslation(locale);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-spot-sheet-title"
      data-testid="map-spot-sheet"
      className="absolute inset-x-0 bottom-0 z-[1201] max-h-[min(85dvh,640px)] overflow-y-auto rounded-t-2xl border-t border-divider bg-bg-elevated shadow-modal pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:transition-none transition-transform duration-200 ease-out"
    >
      <div
        className="flex justify-center pt-2 pb-1 sticky top-0 bg-bg-elevated z-10 touch-none cursor-grab active:cursor-grabbing"
        aria-hidden
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        <div className="w-8 h-1 rounded-full bg-fg-subtle/30" />
      </div>

      <div className="px-4 pt-1 pb-4">
        <div className="flex items-center justify-between mb-2 -ml-2">
          {onBackToList ? (
            <button
              type="button"
              onClick={onBackToList}
              className="min-h-[44px] flex items-center gap-1 px-2 rounded-input text-fg-muted hover:text-fg hover:bg-surface-1/[0.04] transition-colors duration-150"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
              <span className="text-body-sm">{t.mapUiMarkers.backToList}</span>
            </button>
          ) : (
            <span />
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-input hover:bg-surface-1/[0.04] text-fg-muted hover:text-fg transition-colors duration-150"
            aria-label={t.homepage.close}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div id="map-spot-sheet-title" className="sr-only">
          {localizedSpotName(data.spot, locale)}
        </div>

        <SpotCardContent
          data={data}
          locale={locale}
          highlightSport={selectedSport}
          scoreOverride={scoreOverride}
          hoursFrame={hoursFrame}
          hourLabel={hourLabel}
          onViewSpot={() => onViewSpot?.(data.spot.id)}
        />
      </div>
    </div>
  );
}
