import type { Spot } from '@/types';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { phaseFromConditionsStatus, type TidePhase } from '@/lib/tideSchedule';

const TIDE_RELEVANT =
  /lagoa|obidos|óbidos|seixal|troia|tróia|foz|albufeira|alvor|ria|estuario|estuário|cabedelo|esposende|comporta|torreira|costa-nova/i;

/** Spots where tide phase matters for session planning (lagoon, estuary, reef mouth). */
export function spotShowsTideHint(spot: Spot): boolean {
  const blob = `${spot.slug} ${spot.name} ${spot.bestSwell} ${spot.type}`;
  if (TIDE_RELEVANT.test(blob)) return true;
  const swell = spot.bestSwell.toLowerCase();
  return swell.includes('lagoa') || swell.includes('rio');
}

const PHASE_LABELS: Record<TidePhase, { pt: string; en: string }> = {
  high: { pt: 'Maré alta', en: 'High tide' },
  low: { pt: 'Maré baixa', en: 'Low tide' },
  rising: { pt: 'Maré a subir', en: 'Rising tide' },
  falling: { pt: 'Maré a descer', en: 'Falling tide' },
};

/** Short tide line for map sheet when data exists. */
export function getMapTideLine(
  spot: Spot,
  conditions: MarineConditionsFields,
  isPt: boolean,
): string | null {
  if (!spotShowsTideHint(spot)) return null;

  const phase = phaseFromConditionsStatus(
    conditions.tideStatus as TidePhase | undefined,
  );
  if (phase) {
    return PHASE_LABELS[phase][isPt ? 'pt' : 'en'];
  }
  if (conditions.tideLabel?.trim()) {
    return conditions.tideLabel.trim();
  }
  if (typeof conditions.tideHeight === 'number' && !Number.isNaN(conditions.tideHeight)) {
    const h = conditions.tideHeight;
    const label = h >= 0.25
      ? isPt ? 'Maré alta' : 'High tide'
      : h <= -0.25
        ? isPt ? 'Maré baixa' : 'Low tide'
        : isPt ? 'Maré média' : 'Mid tide';
    return label;
  }
  return null;
}
