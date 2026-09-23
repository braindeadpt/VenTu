import { getTranslation } from '@/lib/i18n';
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



/** Short tide line for map sheet when data exists. */
export function getMapTideLine(
  spot: Spot,
  conditions: MarineConditionsFields,
  locale: string,
): string | null {
  if (!spotShowsTideHint(spot)) return null;
  const t = getTranslation(locale).tideLabels;

  const phase = phaseFromConditionsStatus(
    conditions.tideStatus as TidePhase | undefined,
  );
  if (phase) {
    return phase === 'high'
      ? t.high
      : phase === 'low'
        ? t.low
        : phase === 'rising'
          ? t.rising
          : t.falling;
  }
  if (conditions.tideLabel?.trim()) {
    return conditions.tideLabel.trim();
  }
  if (typeof conditions.tideHeight === 'number' && !Number.isNaN(conditions.tideHeight)) {
    const h = conditions.tideHeight;
    const label = h >= 0.25 ? t.high : h <= -0.25 ? t.low : t.mid;
    return label;
  }
  return null;
}
