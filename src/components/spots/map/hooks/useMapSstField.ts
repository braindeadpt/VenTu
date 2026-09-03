'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { MAP_SST_LS_KEY } from '@/lib/map-constants';
import {
  MAP_SST_OPACITY,
  MAP_SST_OPACITY_MOBILE,
  MAP_SST_PANE,
  MAP_SST_PANE_Z,
  collectSstSamples,
  maxSst,
  renderSstFieldTiles,
  type FieldSpot,
} from '@/lib/mapSstField';

interface UseMapSstFieldOptions {
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

export function useMapSstField({
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
}: UseMapSstFieldOptions) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    try {
      const v = localStorage.getItem(MAP_SST_LS_KEY);
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
    if (hoursFile?.sst) return;
    let cancelled = false;
    fetchMapHours().then((data) => {
      if (!cancelled) setFetchedFile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isFullscreen, isHeroEmbed, hoursFile, fetchedFile]);

  const file = hoursFile ?? fetchedFile ?? null;
  const sstOn = isFullscreen && !isHeroEmbed && enabled && !!file?.sst;
  const frame = hoursLive ? hoursFrame : 0;
  const samples = useMemo(
    () => (sstOn && file ? collectSstSamples(file, spots, frame) : []),
    [sstOn, file, spots, frame],
  );
  const sampleMax = maxSst(samples);
  const opacity = isMobile ? MAP_SST_OPACITY_MOBILE : MAP_SST_OPACITY;

  const toggleSst = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_SST_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const disableSst = useCallback(() => {
    setEnabled(false);
    try {
      localStorage.setItem(MAP_SST_LS_KEY, '0');
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!sstOn) {
      if (groupRef.current) {
        map?.removeLayer(groupRef.current);
        groupRef.current = null;
      }
      overlaysRef.current.clear();
      // Hook owns data-map-sst for BOTH states ('true'/'false') — see
      // useMapHsField for the rationale. Removing the attribute breaks
      // off-state consumers.
      const el = map?.getContainer();
      if (el) {
        el.setAttribute('data-map-sst', 'false');
        el.removeAttribute('data-map-sst-frame');
        el.removeAttribute('data-map-sst-max');
      }
      return;
    }
    if (!isReady || !map || !LRef.current) return;

    const Leaflet = LRef.current;
    if (!map.getPane(MAP_SST_PANE)) {
      const pane = map.createPane(MAP_SST_PANE);
      pane.style.zIndex = MAP_SST_PANE_Z;
      pane.style.pointerEvents = 'none';
    }

    let group = groupRef.current;
    if (!group) {
      group = Leaflet.layerGroup();
      group.addTo(map);
      groupRef.current = group;
    }

    const tiles = renderSstFieldTiles(samples, {
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
          pane: MAP_SST_PANE,
          className: 'ventu-sst-overlay',
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
    el.setAttribute('data-map-sst', 'true');
    el.setAttribute('data-map-sst-frame', String(frame));
    el.setAttribute('data-map-sst-max', sampleMax.toFixed(1));

    return () => {
      /* keep group until sstOff — cleanup in the !sstOn branch */
    };
  }, [
    sstOn,
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
    sstEnabled: sstOn,
    sstUnavailable: fetchedFile === null || (!!file && !file.sst),
    toggleSst,
    disableSst,
    sstMax: sampleMax,
  };
}
