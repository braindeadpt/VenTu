'use client';

import { useEffect, useState } from 'react';
import type { Spot } from '@/types';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { loadForecastForSpot } from '@/lib/spotDataCache';

/**
 * Linhas horárias do spot (`public/data/forecasts/{dataId}.json`, com
 * cache partilhada — o mesmo ficheiro que a página já carrega). Chaveadas
 * por `time` (ISO local) para alinhar com as horas do eixo de tempo.
 * Null enquanto carrega — os cartões usam `conditions` como primeiro
 * paint (hidração React #418: nada depende do fetch no render inicial).
 */
export function useInstrumentRows(
  spot: Pick<Spot, 'id' | 'conditionsSource'>,
): Map<string, Record<string, unknown>> | null {
  const [rows, setRows] = useState<Map<string, Record<string, unknown>> | null>(null);
  const dataId = getConditionsDataId(spot);

  useEffect(() => {
    let cancelled = false;
    loadForecastForSpot(dataId)
      .then((list) => {
        if (cancelled) return;
        const map = new Map<string, Record<string, unknown>>();
        for (const row of list) {
          if (row && typeof row.time === 'string') map.set(row.time, row);
        }
        setRows(map);
      })
      .catch(() => {
        /* sem linhas → os cartões ficam com o snapshot `conditions` */
      });
    return () => {
      cancelled = true;
    };
  }, [dataId]);

  return rows;
}
