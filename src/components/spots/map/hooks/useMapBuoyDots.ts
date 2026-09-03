'use client';

import { useCallback, useEffect, useState } from 'react';
import type L from 'leaflet';
import { MAP_BUOYS_LS_KEY } from '@/lib/map-constants';
import {
  MAP_BUOYS_ENABLE_EVENT,
  MAP_BUOYS_PANE,
  MAP_BUOYS_PANE_Z,
  buoyDotHtml,
  buoyPopupHtml,
  fetchMapBuoyDots,
  type MapBuoyDot,
  type MapBuoyPopupLabels,
} from '@/lib/mapBuoyDots';

interface UseMapBuoyDotsOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  buoyLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  isReady: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  /** Deep link `?buoys=1` — does not persist. */
  initialEnabled: boolean;
  labels: MapBuoyPopupLabels;
}

export function useMapBuoyDots({
  mapInstanceRef,
  LRef,
  buoyLayerRef,
  isReady,
  isFullscreen,
  isHeroEmbed,
  initialEnabled,
  labels,
}: UseMapBuoyDotsOptions) {
  const { hs: labelHs, stale, sourceIh, sourceWmo, noHs } = labels;
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    try {
      const v = localStorage.getItem(MAP_BUOYS_LS_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      /* noop */
    }
    return false;
  });
  const [dots, setDots] = useState<MapBuoyDot[] | undefined>(undefined);

  useEffect(() => {
    if (initialEnabled) setEnabled(true);
  }, [initialEnabled]);

  useEffect(() => {
    const onEnable = () => {
      setEnabled(true);
      try {
        localStorage.setItem(MAP_BUOYS_LS_KEY, '1');
      } catch {
        /* noop */
      }
    };
    window.addEventListener(MAP_BUOYS_ENABLE_EVENT, onEnable);
    return () => window.removeEventListener(MAP_BUOYS_ENABLE_EVENT, onEnable);
  }, []);

  const buoysOn = isFullscreen && !isHeroEmbed && enabled;

  useEffect(() => {
    if (!buoysOn || dots !== undefined) return;
    let cancelled = false;
    fetchMapBuoyDots().then((next) => {
      if (!cancelled) setDots(next);
    });
    return () => {
      cancelled = true;
    };
  }, [buoysOn, dots]);

  useEffect(() => {
    if (!buoysOn) {
      if (buoyLayerRef.current) {
        mapInstanceRef.current?.removeLayer(buoyLayerRef.current);
        buoyLayerRef.current = null;
      }
      const mapOff = mapInstanceRef.current;
      if (mapOff) {
        mapOff.getContainer().removeAttribute('data-map-buoys-layer');
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current || !LRef.current) return;
    if (!dots) return;

    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;

    if (!map.getPane(MAP_BUOYS_PANE)) {
      const pane = map.createPane(MAP_BUOYS_PANE);
      pane.style.zIndex = MAP_BUOYS_PANE_Z;
    }

    const group = Leaflet.layerGroup();
    for (const dot of dots) {
      const icon = Leaflet.divIcon({
        className: 'leaflet-div-icon ventu-buoy-marker',
        html: buoyDotHtml(dot),
        iconSize: [40, 24],
        iconAnchor: [20, 12],
        popupAnchor: [0, -12],
      });
      Leaflet.marker([dot.lat, dot.lon], {
        icon,
        pane: MAP_BUOYS_PANE,
        keyboard: true,
        title: dot.name,
      })
        .bindPopup(buoyPopupHtml(dot, { hs: labelHs, stale, sourceIh, sourceWmo, noHs }), {
          className: 'ventu-buoy-popup',
          maxWidth: 240,
        })
        .addTo(group);
    }
    group.addTo(map);
    buoyLayerRef.current = group;
    map.getContainer().dataset.mapBuoysLayer = 'true';

    return () => {
      if (map.hasLayer(group)) map.removeLayer(group);
      buoyLayerRef.current = null;
      map.getContainer().removeAttribute('data-map-buoys-layer');
    };
  }, [buoysOn, isReady, dots, labelHs, stale, sourceIh, sourceWmo, noHs, mapInstanceRef, LRef, buoyLayerRef]);

  const toggleBuoys = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_BUOYS_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return {
    buoysEnabled: buoysOn,
    toggleBuoys,
  };
}
