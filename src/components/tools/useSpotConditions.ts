'use client';

import { useEffect, useState } from 'react';
import { spots } from '@/lib/spots';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { getAssetPath } from '@/lib/paths';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';

export interface SpotConditionsPick {
  windKt: number | null;
  waterTempC: number | null;
}

interface ConditionsRow {
  windSpeed?: number;
  waterTemp?: number;
}

export const TOOL_SPOT_OPTIONS = [...spots]
  .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
  .map((s) => ({ id: s.id, name: s.name, nameEn: s.nameEn }));

/**
 * Live wind/water for a selected spot — prefill for the gear calculators.
 * Fetches conditions.json once, on first selection.
 */
export function useSpotConditions(spotId: string | null): {
  pick: SpotConditionsPick | null;
  loading: boolean;
} {
  const [conditions, setConditions] = useState<Record<string, ConditionsRow> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!spotId || conditions) return;
    let cancelled = false;
    setLoading(true);
    fetch(getAssetPath('/data/conditions.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setConditions(data ?? {});
      })
      .catch(() => {
        if (!cancelled) setConditions({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId, conditions]);

  if (!spotId || !conditions) return { pick: null, loading };

  const spot = spots.find((s) => s.id === spotId);
  const row = spot ? conditions[getConditionsDataId(spot)] : undefined;
  if (!row) return { pick: null, loading };

  return {
    pick: {
      windKt:
        typeof row.windSpeed === 'number'
          ? Math.round(row.windSpeed * MS_TO_KNOTS)
          : null,
      waterTempC: typeof row.waterTemp === 'number' ? row.waterTemp : null,
    },
    loading,
  };
}
