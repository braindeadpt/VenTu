'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { GridSportFilter } from '@/lib/sportRatings';
import MapSpotPreview, { type MapSpotPreviewData } from '@/components/spots/MapSpotPreview';

export type MapSpotSheetData = MapSpotPreviewData;

interface MapSpotSheetProps {
  data: MapSpotSheetData | null;
  selectedSport: GridSportFilter;
  locale: string;
  onClose: () => void;
  onViewSpot?: (spotId: string) => void;
}

export default function MapSpotSheet({
  data,
  selectedSport,
  locale,
  onClose,
  onViewSpot,
}: MapSpotSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isPt = locale === 'pt';

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

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-[1040] bg-black/30 motion-reduce:transition-none transition-opacity duration-200"
        aria-label={isPt ? 'Fechar' : 'Close'}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-spot-sheet-title"
        className="absolute inset-x-0 bottom-0 z-[1050] max-h-[min(85dvh,640px)] overflow-y-auto rounded-t-2xl border-t border-divider bg-bg-elevated shadow-modal pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:transition-none transition-transform duration-200 ease-out"
      >
        <div className="flex justify-center pt-2 pb-1 sticky top-0 bg-bg-elevated z-10" aria-hidden>
          <div className="w-8 h-1 rounded-full bg-fg-subtle/30" />
        </div>

        <div className="px-4 pt-1 pb-4">
          <div className="flex justify-end mb-2">
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="p-2 rounded-input hover:bg-surface-1/[0.04] text-fg-muted hover:text-fg transition-colors duration-150 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isPt ? 'Fechar' : 'Close'}
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>

          <div id="map-spot-sheet-title" className="sr-only">
            {isPt ? data.spot.name : data.spot.nameEn}
          </div>

          <MapSpotPreview
            data={data}
            locale={locale}
            highlightSport={selectedSport}
            onViewSpot={() => onViewSpot?.(data.spot.id)}
          />
        </div>
      </div>
    </>
  );
}
