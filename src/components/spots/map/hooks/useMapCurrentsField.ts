'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { MAP_CURRENTS_LS_KEY } from '@/lib/map-constants';
import {
  MAP_CURRENT_OPACITY,
  MAP_CURRENT_OPACITY_MOBILE,
  MAP_CURRENT_PANE,
  MAP_CURRENT_PANE_Z,
  collectCurrentSamples,
  maxCurrentSpd,
  renderCurrentFieldTiles,
} from '@/lib/mapCurrentsField';
import type { FieldSpot } from '@/lib/mapHsField';

interface UseMapCurrentsFieldOptions {
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

export function useMapCurrentsField({
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
}: UseMapCurrentsFieldOptions) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    try {
      const v = localStorage.getItem(MAP_CURRENTS_LS_KEY);
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
    if (hoursFile?.currents) return;
    let cancelled = false;
    fetchMapHours().then((data) => {
      if (!cancelled) setFetchedFile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isFullscreen, isHeroEmbed, hoursFile, fetchedFile]);

  const file = hoursFile ?? fetchedFile ?? null;
  const currentsOn = isFullscreen && !isHeroEmbed && enabled && !!file?.currents;
  const frame = hoursLive ? hoursFrame : 0;
  const samples = useMemo(
    () => (currentsOn && file ? collectCurrentSamples(file, spots, frame) : []),
    [currentsOn, file, spots, frame],
  );
  const sampleMax = maxCurrentSpd(samples);
  const opacity = isMobile ? MAP_CURRENT_OPACITY_MOBILE : MAP_CURRENT_OPACITY;

  const toggleCurrents = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_CURRENTS_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!currentsOn) {
      if (groupRef.current) {
        map?.removeLayer(groupRef.current);
        groupRef.current = null;
      }
      overlaysRef.current.clear();
      map?.getContainer().removeAttribute('data-map-currents');
      map?.getContainer().removeAttribute('data-map-currents-frame');
      map?.getContainer().removeAttribute('data-map-currents-max');
      return;
    }
    if (!isReady || !map || !LRef.current) return;

    const Leaflet = LRef.current;
    if (!map.getPane(MAP_CURRENT_PANE)) {
      const pane = map.createPane(MAP_CURRENT_PANE);
      pane.style.zIndex = MAP_CURRENT_PANE_Z;
      pane.style.pointerEvents = 'none';
    }

    let group = groupRef.current;
    if (!group) {
      group = Leaflet.layerGroup();
      group.addTo(map);
      groupRef.current = group;
    }

    const tiles = renderCurrentFieldTiles(samples, { mobile: isMobile, opacityScale: 1 });
    const seen = new Set<string>();
    for (const tile of tiles) {
      seen.add(tile.id);
      const bounds = Leaflet.latLngBounds(tile.bounds);
      let overlay = overlaysRef.current.get(tile.id);
      if (!overlay) {
        overlay = Leaflet.imageOverlay(tile.url, bounds, {
          opacity,
          interactive: false,
          pane: MAP_CURRENT_PANE,
          className: 'ventu-current-overlay',
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
    el.setAttribute('data-map-currents', 'true');
    el.setAttribute('data-map-currents-frame', String(frame));
    el.setAttribute('data-map-currents-max', sampleMax.toFixed(2));

    return () => {
      /* keep group until currents off — cleanup in the !currentsOn branch */
    };
  }, [
    currentsOn,
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
    currentsEnabled: currentsOn,
    currentsUnavailable: fetchedFile === null || (!!file && !file.currents),
    toggleCurrents,
    currentsMax: sampleMax,
  };
}
