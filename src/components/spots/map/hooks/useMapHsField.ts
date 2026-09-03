'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { MAP_HS_LS_KEY } from '@/lib/map-constants';
import {
  MAP_HS_OPACITY,
  MAP_HS_OPACITY_MOBILE,
  MAP_HS_PANE,
  MAP_HS_PANE_Z,
  collectHsSamples,
  maxHs,
  renderHsFieldTiles,
  type FieldSpot,
} from '@/lib/mapHsField';

interface UseMapHsFieldOptions {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  initialEnabled: boolean;
  hoursFile: MapHoursFile | null;
  hoursLive: boolean;
  hoursFrame: number;
  spots: FieldSpot[];
}

export function useMapHsField({
  mapInstanceRef,
  LRef,
  isReady,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  initialEnabled,
  hoursFile,
  hoursLive,
  hoursFrame,
  spots,
}: UseMapHsFieldOptions) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    try {
      const v = localStorage.getItem(MAP_HS_LS_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      /* noop */
    }
    return false;
  });
  const groupRef = useRef<L.LayerGroup | null>(null);
  const overlaysRef = useRef<Map<string, L.ImageOverlay>>(new Map());
  const [fetchedFile, setFetchedFile] = useState<MapHoursFile | null | undefined>(undefined);

  useEffect(() => {
    if (initialEnabled) setEnabled(true);
  }, [initialEnabled]);

  useEffect(() => {
    if (!enabled || !isFullscreen || isHeroEmbed) return;
    if (fetchedFile !== undefined) return;
    if (hoursFile?.hs) return;
    let cancelled = false;
    fetchMapHours().then((data) => {
      if (!cancelled) setFetchedFile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isFullscreen, isHeroEmbed, hoursFile, fetchedFile]);

  const file = hoursFile ?? fetchedFile ?? null;
  const hsOn = isFullscreen && !isHeroEmbed && enabled && !!file?.hs;
  const frame = hoursLive ? hoursFrame : 0;
  const samples = useMemo(
    () => (hsOn && file ? collectHsSamples(file, spots, frame) : []),
    [hsOn, file, spots, frame],
  );
  const sampleMax = maxHs(samples);
  const opacity = isMobile ? MAP_HS_OPACITY_MOBILE : MAP_HS_OPACITY;

  const toggleHs = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_HS_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const disableHs = useCallback(() => {
    setEnabled(false);
    try {
      localStorage.setItem(MAP_HS_LS_KEY, '0');
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!hsOn) {
      if (groupRef.current) {
        map?.removeLayer(groupRef.current);
        groupRef.current = null;
      }
      overlaysRef.current.clear();
      map?.getContainer().removeAttribute('data-map-hs');
      map?.getContainer().removeAttribute('data-map-hs-frame');
      map?.getContainer().removeAttribute('data-map-hs-max');
      return;
    }
    if (!isReady || !map || !LRef.current) return;

    const Leaflet = LRef.current;
    if (!map.getPane(MAP_HS_PANE)) {
      const pane = map.createPane(MAP_HS_PANE);
      pane.style.zIndex = MAP_HS_PANE_Z;
      pane.style.pointerEvents = 'none';
    }

    let group = groupRef.current;
    if (!group) {
      group = Leaflet.layerGroup();
      group.addTo(map);
      groupRef.current = group;
    }

    const tiles = renderHsFieldTiles(samples, {
      mobile: isMobile,
      opacityScale: 1,
    });
    const seen = new Set<string>();
    for (const tile of tiles) {
      seen.add(tile.id);
      const bounds = Leaflet.latLngBounds(tile.bounds);
      let overlay = overlaysRef.current.get(tile.id);
      if (!overlay) {
        overlay = Leaflet.imageOverlay(tile.url, bounds, {
          opacity,
          interactive: false,
          pane: MAP_HS_PANE,
          className: 'ventu-hs-overlay',
        });
        overlay.addTo(group);
        overlaysRef.current.set(tile.id, overlay);
      } else {
        overlay.setUrl(tile.url);
        overlay.setBounds(bounds);
        overlay.setOpacity(opacity);
      }
    }
    for (const [id, overlay] of overlaysRef.current) {
      if (seen.has(id)) continue;
      group.removeLayer(overlay);
      overlaysRef.current.delete(id);
    }

    const el = map.getContainer();
    el.setAttribute('data-map-hs', 'true');
    el.setAttribute('data-map-hs-frame', String(frame));
    el.setAttribute('data-map-hs-max', sampleMax.toFixed(1));

    return () => {
      /* keep group until hsOff — cleanup in the !hsOn branch */
    };
  }, [
    hsOn,
    isReady,
    samples,
    sampleMax,
    frame,
    isMobile,
    opacity,
    mapInstanceRef,
    LRef,
  ]);

  return {
    hsEnabled: hsOn,
    hsUnavailable: fetchedFile === null || (!!file && !file.hs),
    toggleHs,
    disableHs,
    hsMax: sampleMax,
  };
}
