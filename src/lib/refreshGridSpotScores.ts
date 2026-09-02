import type { GridSpotData } from '@/lib/gridSpotFilters';
import { pickMarineDisplayFields, pickObservedField } from '@/lib/marineConditions';
import { resolveConditionsEntry } from '@/lib/spotConditionsSource';
import { getAllSportScores } from '@/lib/sportScore';
import { applyRegionalBiasFallback, rawToScoreInput } from '@/lib/scoreConditions';
import type { WaveBiasRegionsFile } from '@/lib/waveBias';

/**
 * Recompute grid/map scores from fresh conditions.json (incl. observed wind).
 *
 * `waveBiasFile` (optional) is the client-fetched wave-bias.json regions — the
 * same fallback the spot page applies: when the row has no `waveBias` meta
 * (pipeline without VENTU_WAVE_BIAS_CORRECTION=1) and no fresh buoy reading,
 * the regional ME corrects the height and the `waveBias` meta is attached, so
 * the TopNow/map surfaces show «(viés regional)» honestly — never twice.
 */
export function refreshGridSpotScores<T extends GridSpotData>(
  spotsData: T[],
  conditionsJson: Record<string, unknown>,
  waveBiasFile?: WaveBiasRegionsFile | null,
): T[] {
  return spotsData.map((row) => {
    const raw = resolveConditionsEntry(row.spot, conditionsJson);
    if (!raw || typeof raw !== 'object') return row;

    const record = raw as Record<string, unknown>;
    const scoreInput0 = rawToScoreInput(record);
    const biasPatch = applyRegionalBiasFallback(record, row.spot.region, waveBiasFile);
    const scoreInput = biasPatch
      ? { ...scoreInput0, waveHeight: biasPatch.waveHeight }
      : scoreInput0;
    const allScores = getAllSportScores(row.spot, scoreInput);
    const observed = pickObservedField(record);

    return {
      ...row,
      conditions: {
        ...row.conditions,
        ...scoreInput,
        ...pickMarineDisplayFields(record),
        observed,
        // O refresh puxa a leitura de boia fresca do JSON servido (com que a
        // UI resolve o badge «Corrigido pela boia X» / relógio — o SpotListCard
        // e o TopNow leem data.conditions.observedWave). O ficheiro servido é
        // AUTORITATIVO por spot: quando a row existe nele SEM observedWave, a
        // pipeline decidiu que não há leitura nesta run — nunca ressuscitar a
        // do SSG (mostrar como «fresca» uma leitura de um snapshot anterior
        // mentiria sobre o dado). Spots ausentes do ficheiro (return row acima)
        // mantêm o SSG intacto.
        observedWave: record.observedWave as GridSpotData['conditions']['observedWave'] | undefined,
        waveBias:
          (biasPatch?.waveBias ??
            (record.waveBias as GridSpotData['conditions']['waveBias'] | undefined)) ??
          row.conditions.waveBias,
        updatedAt:
          typeof record.updatedAt === 'string' ? record.updatedAt : row.conditions.updatedAt,
      },
      allScores,
    };
  });
}
