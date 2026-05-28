import type { Spot } from '@/types';

/** Spots where wave height is not the primary score signal (lagoas, wake, etc.). */
export function getCalmWaterMetricLabel(
  spot: Pick<Spot, 'type'>,
  waveHeight: number,
  isPt: boolean,
): string | null {
  if (spot.type === 'wakeboard') {
    return isPt ? 'Água plana' : 'Flat water';
  }
  if (
    waveHeight < 0.35 &&
    spot.type !== 'surf' &&
    spot.type !== 'big-wave'
  ) {
    return isPt ? 'Sem ondas' : 'No swell';
  }
  return null;
}
