'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MapHoursFile } from '@/lib/mapHours';
import {
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
 * `undefined` = a carregar; `null` = sem ficheiro (ou velho/malformado).
 */
export function useSeaGrid(wanted: boolean): SeaGrid | null | undefined {
  const [grid, setGrid] = useState<SeaGrid | null | undefined>(undefined);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const load = () =>
      fetchSeaGrid().then((g) => {
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
