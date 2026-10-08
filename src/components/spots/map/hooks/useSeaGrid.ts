'use client';

import { useEffect, useMemo, useState } from 'react';
import type L from 'leaflet';
import type { MapHoursFile } from '@/lib/mapHours';
import { loadLandMask } from '@/lib/landMask';
import {
  SEA_DOMAIN_MIN_ZOOM,
  SEA_DOMAIN_VIEW_BOUNDS,
  fetchSeaGrid,
  lisbonLocalToEpochMs,
  seaGridFrame,
  seaGridTimeIndex,
  type SeaGrid,
  type SeaGridFrame,
} from '@/lib/seaGrid';

/**
 * Grelha de vento + ondulação partilhada pelo campo de vento e pela camada
 * «Ondulação». `fetchSeaGrid` deduplica pedidos e tem TTL, por isso os dois
 * consumidores pedem o ficheiro uma vez.
 *
 * O recorte da costa é vectorial (landClip.ts, pedido por vista pelos
 * hooks). A máscara raster `land-mask.json` continua a ser pedida em
 * paralelo: é o fallback quando o índice do recorte falha e serve as outras
 * camadas (Hs/SST/correntes).
 *
 * `undefined` = a carregar; `null` = sem ficheiro (ou velho/malformado).
 */
export function useSeaGrid(wanted: boolean): SeaGrid | null | undefined {
  const [grid, setGrid] = useState<SeaGrid | null | undefined>(undefined);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const load = () =>
      Promise.all([fetchSeaGrid(), loadLandMask()]).then(([g]) => {
        if (!cancelled) setGrid(g);
      });
    load();
    // O mapa fica aberto horas: revalida com o mesmo TTL do cache.
    const id = window.setInterval(load, 30 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [wanted]);
  return wanted ? grid : undefined;
}

/** Relógio de parede em passos de 10 min — chega para «Agora» na grelha horária. */
function useWallClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 10 * 60_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * Instante da grelha que o scrubber das 48 h pede: com a camada «48 h» viva
 * é a hora do passo seleccionado (map-hours, hora de Lisboa); sem ela é
 * «Agora». null quando a grelha não cobre esse instante.
 */
export function useSeaGridFrame(
  grid: SeaGrid | null | undefined,
  hoursFile: MapHoursFile | null,
  hoursLive: boolean,
  hoursFrame: number,
): SeaGridFrame | null {
  const now = useWallClock(!!grid);
  const stepTime = hoursLive ? hoursFile?.times?.[hoursFrame] : undefined;
  const epoch = useMemo(() => {
    if (stepTime) return lisbonLocalToEpochMs(stepTime);
    return now;
  }, [stepTime, now]);
  return useMemo(() => {
    if (!grid || epoch == null) return null;
    const tf = seaGridTimeIndex(grid, epoch);
    if (tf == null) return null;
    return seaGridFrame(grid, tf);
  }, [grid, epoch]);
}

/**
 * Limites do /mapa fullscreen coerentes com o domínio da grelha do mar
 * (v3: 0–72 N × 100 W–44 E, esbatido 4° na borda): o pan fica no INTERIOR do
 * esbatido (`maxBounds`, viscosidade 1) e o zoom-out mínimo é o menor zoom
 * em que a vista inteira cabe nesse interior (refeito ao redimensionar).
 * Assim a borda do campo nunca chega ao ecrã — não há «rectângulo» a zoom
 * nenhum. Fora do fullscreen (hero, mini-mapas) nada muda.
 */
export function useSeaDomainBounds(
  mapInstanceRef: React.MutableRefObject<L.Map | null>,
  LRef: React.MutableRefObject<typeof L | null>,
  isReady: boolean,
  enabled: boolean,
): void {
  useEffect(() => {
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    if (!enabled || !isReady || !map || !Leaflet) return;
    const b = SEA_DOMAIN_VIEW_BOUNDS;
    const bounds = Leaflet.latLngBounds([b.south, b.west], [b.north, b.east]);
    const prevMin = map.getMinZoom();
    const prevViscosity = map.options.maxBoundsViscosity;
    const apply = () => {
      const z = Math.max(SEA_DOMAIN_MIN_ZOOM, Math.ceil(map.getBoundsZoom(bounds, true) - 1e-6));
      map.setMinZoom(z);
      if (map.getZoom() < z) map.setZoom(z, { animate: false });
    };
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(bounds);
    apply();
    map.on('resize', apply);
    return () => {
      map.off('resize', apply);
      map.setMaxBounds(undefined as unknown as L.LatLngBounds);
      map.setMinZoom(prevMin);
      map.options.maxBoundsViscosity = prevViscosity;
    };
  }, [enabled, isReady, mapInstanceRef, LRef]);
}
