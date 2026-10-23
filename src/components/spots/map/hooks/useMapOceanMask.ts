'use client';

import { useEffect } from 'react';
import type L from 'leaflet';

import type { BasemapMode } from '@/components/spots/MapLayerToggle';

/**
 * Máscara vectorial do oceano sobre o satélite Esri (só basemap «Satélite»).
 *
 * Perf (/mapa TBT/LCP): nada corre no arranque — o módulo da camada é um
 * chunk dinâmico importado em idle DEPOIS de o mapa estar pronto, e os dados
 * (public/geo/ocean-mask/) só são pedidos pela camada, para a vista actual.
 * No basemap «Mapa» (o default) nada é carregado.
 */

/** requestIdleCallback com fallback (Safari < 15 / iframes). */
function onIdle(cb: () => void, timeoutMs = 2000): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(cb, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(cb, 200);
  return () => window.clearTimeout(t);
}

export function oceanMaskAttributionHtml(credit: string): string {
  // `credit` traz {osm} → ligação para a página de direitos do OSM.
  const link = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  return `${credit.replace('{osm}', link)} (ODbL)`;
}

interface UseMapOceanMaskOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  basemapMode: BasemapMode;
  /** t.map.waterCredit (com {osm}) */
  credit: string;
}

export function useMapOceanMask({ mapInstanceRef, LRef, isReady, basemapMode, credit }: UseMapOceanMaskOptions): void {
  useEffect(() => {
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    if (!isReady || !map || !Leaflet) return;
    const el = map.getContainer();
    if (basemapMode !== 'satellite') {
      el.dataset.oceanMask = 'off';
      return;
    }
    let cancelled = false;
    let layer: L.Layer | null = null;
    el.dataset.oceanMask = 'loading';
    const cancelIdle = onIdle(() => {
      void import('@/components/spots/map/oceanMaskLayer')
        .then(({ createOceanMaskLayer, ensureOceanMaskPane }) => {
          if (cancelled || mapInstanceRef.current !== map) return;
          ensureOceanMaskPane(map);
          layer = createOceanMaskLayer(Leaflet, {
            attribution: oceanMaskAttributionHtml(credit),
            onState: (s) => {
              if (!cancelled) el.dataset.oceanMask = s;
            },
          });
          map.addLayer(layer);
        })
        .catch(() => {
          if (!cancelled) el.dataset.oceanMask = 'failed';
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      if (layer) {
        try {
          map.removeLayer(layer);
        } catch {
          /* mapa já removido */
        }
      }
      delete el.dataset.oceanMask;
    };
  }, [isReady, basemapMode, credit, mapInstanceRef, LRef]);
}
