'use client';

/**
 * Vizinhos do nível para o aviso do spot (#nivel-ui): só carrega o map-hours
 * (o mesmo ficheiro e a mesma cache do «Perto daqui») quando o spot está acima
 * do nível escolhido. Sem ficheiro, a lista sai na mesma (sem notas).
 */
import { useEffect, useMemo, useState } from 'react';
import { spots } from '@/lib/spots';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { pickMapHourStep } from '@/lib/context/nearbySpots';
import { vizinhosDoNivel, type VizinhoDoNivel } from '@/lib/vizinhosNivel';
import type { NivelUtilizador } from '@/lib/mapDifficulty';
import type { SportType } from '@/lib/sportRatings';
import type { Spot } from '@/types';

export function useVizinhosNivel(
  spot: Spot,
  sport: SportType,
  nivel: NivelUtilizador | null,
  t: string | undefined,
  ativo: boolean,
): VizinhoDoNivel[] {
  const [file, setFile] = useState<MapHoursFile | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    void fetchMapHours().then((f) => {
      if (vivo) setFile(f);
    });
    return () => {
      vivo = false;
    };
  }, [ativo]);
  const passo = pickMapHourStep(file?.times ?? [], t);
  return useMemo(
    () => (ativo && nivel ? vizinhosDoNivel(spot, spots, sport, nivel, file, passo) : []),
    [ativo, nivel, spot, sport, file, passo],
  );
}
