import { getTranslation } from '@/lib/i18n';
import type { Spot } from '@/types';

/** Spots where wave height is not the primary score signal (lagoas, wake, etc.). */
export function getCalmWaterMetricLabel(
  spot: Pick<Spot, 'type'>,
  waveHeight: number,
  locale: string,
): string | null {
  const t = getTranslation(locale).ui;
  if (spot.type === 'wakeboard') {
    return t.calmWaterFlat;
  }
  if (
    waveHeight < 0.35 &&
    spot.type !== 'surf' &&
    spot.type !== 'big-wave'
  ) {
    return t.noSwell;
  }
  return null;
}
