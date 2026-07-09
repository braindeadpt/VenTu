import type { GridSpotData } from '@/lib/gridSpotFilters';
import { pickMarineDisplayFields, pickObservedField } from '@/lib/marineConditions';
import { resolveConditionsEntry } from '@/lib/spotConditionsSource';
import { getAllSportScores } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';

/** Recompute grid/map scores from fresh conditions.json (incl. observed wind). */
export function refreshGridSpotScores(
  spotsData: GridSpotData[],
  conditionsJson: Record<string, unknown>,
): GridSpotData[] {
  return spotsData.map((row) => {
    const raw = resolveConditionsEntry(row.spot, conditionsJson);
    if (!raw || typeof raw !== 'object') return row;

    const record = raw as Record<string, unknown>;
    const scoreInput = rawToScoreInput(record);
    const allScores = getAllSportScores(row.spot, scoreInput);
    const observed = pickObservedField(record);

    return {
      ...row,
      conditions: {
        ...row.conditions,
        ...scoreInput,
        ...pickMarineDisplayFields(record),
        observed,
        updatedAt:
          typeof record.updatedAt === 'string' ? record.updatedAt : row.conditions.updatedAt,
      },
      allScores,
    };
  });
}
